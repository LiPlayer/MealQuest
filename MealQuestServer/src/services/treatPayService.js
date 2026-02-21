function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function toPositiveMoney(value, label) {
  const parsed = roundMoney(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createTreatPayService(db) {
  function ensureSessionBucket(merchantId) {
    if (
      !db.groupTreatSessionsByMerchant ||
      typeof db.groupTreatSessionsByMerchant !== "object"
    ) {
      db.groupTreatSessionsByMerchant = {};
    }
    if (!db.groupTreatSessionsByMerchant[merchantId]) {
      db.groupTreatSessionsByMerchant[merchantId] = {};
    }
    return db.groupTreatSessionsByMerchant[merchantId];
  }

  function ensureDailySubsidyBucket(merchantId) {
    if (!db.merchantDailySubsidyUsage || typeof db.merchantDailySubsidyUsage !== "object") {
      db.merchantDailySubsidyUsage = {};
    }
    if (!db.merchantDailySubsidyUsage[merchantId]) {
      db.merchantDailySubsidyUsage[merchantId] = {};
    }
    return db.merchantDailySubsidyUsage[merchantId];
  }

  function getUser(merchantId, userId) {
    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const user = db.getMerchantUser(merchantId, userId);
    assertEntity(user, "user");
    return user;
  }

  function deductFromWallet(user, amount) {
    const principal = Number(user.wallet.principal || 0);
    const bonus = Number(user.wallet.bonus || 0);
    const available = roundMoney(principal + bonus);
    if (available < amount) {
      throw new Error("insufficient wallet balance");
    }
    const takePrincipal = Math.min(principal, amount);
    const takeBonus = roundMoney(amount - takePrincipal);
    user.wallet.principal = roundMoney(principal - takePrincipal);
    user.wallet.bonus = roundMoney(bonus - takeBonus);
    return {
      principal: roundMoney(takePrincipal),
      bonus: roundMoney(takeBonus)
    };
  }

  function refundToWalletByRatio(user, deduction, ratio) {
    const principalBack = roundMoney(Number(deduction.principal || 0) * ratio);
    const bonusBack = roundMoney(Number(deduction.bonus || 0) * ratio);
    user.wallet.principal = roundMoney(Number(user.wallet.principal || 0) + principalBack);
    user.wallet.bonus = roundMoney(Number(user.wallet.bonus || 0) + bonusBack);
    return {
      principal: principalBack,
      bonus: bonusBack
    };
  }

  function createSession({
    merchantId,
    initiatorUserId,
    mode = "GROUP_PAY",
    orderAmount,
    subsidyRate = 0,
    subsidyCap = 0,
    dailySubsidyCap = 0,
    ttlMinutes = 120
  }) {
    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    getUser(merchantId, initiatorUserId);

    const normalizedMode = String(mode || "").toUpperCase();
    if (!["GROUP_PAY", "MERCHANT_SUBSIDY"].includes(normalizedMode)) {
      throw new Error("unsupported treat mode");
    }
    const normalizedOrderAmount = toPositiveMoney(orderAmount, "orderAmount");
    const normalizedSubsidyRate = Math.max(0, Math.min(1, Number(subsidyRate || 0)));
    const normalizedSubsidyCap = roundMoney(Math.max(0, Number(subsidyCap || 0)));
    const normalizedDailySubsidyCap = roundMoney(Math.max(0, Number(dailySubsidyCap || 0)));
    const expiresAt = new Date(
      Date.now() + Math.max(5, Math.floor(Number(ttlMinutes || 120))) * 60 * 1000
    ).toISOString();

    const session = {
      sessionId: `treat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      merchantId,
      initiatorUserId,
      mode: normalizedMode,
      orderAmount: normalizedOrderAmount,
      subsidyRate: normalizedSubsidyRate,
      subsidyCap: normalizedSubsidyCap,
      dailySubsidyCap: normalizedDailySubsidyCap,
      totalContributed: 0,
      participants: [],
      status: "OPEN",
      createdAt: new Date().toISOString(),
      expiresAt,
      settledAt: null,
      settlement: null
    };
    ensureSessionBucket(merchantId)[session.sessionId] = session;
    db.save();
    return {
      ...session
    };
  }

  function joinSession({
    merchantId,
    sessionId,
    userId,
    amount,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const idemKey = `treat_join:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const session = ensureSessionBucket(merchantId)[sessionId];
    assertEntity(session, "session");
    if (session.status !== "OPEN") {
      throw new Error("session is not open");
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      session.status = "EXPIRED";
      db.save();
      throw new Error("session expired");
    }
    if (session.participants.some((item) => item.userId === userId)) {
      throw new Error("user already joined");
    }

    const contributionAmount = toPositiveMoney(amount, "amount");
    const user = getUser(merchantId, userId);
    const deduction = deductFromWallet(user, contributionAmount);

    const row = {
      userId,
      amount: contributionAmount,
      deduction,
      joinedAt: new Date().toISOString()
    };
    session.participants.push(row);
    session.totalContributed = roundMoney(session.totalContributed + contributionAmount);
    db.save();

    const result = {
      sessionId,
      merchantId,
      userId,
      amount: contributionAmount,
      totalContributed: session.totalContributed,
      userWallet: {
        ...user.wallet
      }
    };
    db.idempotencyMap.set(idemKey, result);
    return result;
  }

  function closeSession({ merchantId, sessionId, operatorId = "system" }) {
    const session = ensureSessionBucket(merchantId)[sessionId];
    assertEntity(session, "session");
    if (!["OPEN", "FAILED"].includes(session.status)) {
      return {
        ...session
      };
    }

    const orderAmount = Number(session.orderAmount || 0);
    const mode = session.mode;
    let merchantSubsidy = 0;
    const desiredSubsidy =
      mode === "MERCHANT_SUBSIDY"
        ? Math.min(
            roundMoney(orderAmount * Number(session.subsidyRate || 0)),
            Number(session.subsidyCap || 0) || Number.MAX_SAFE_INTEGER
          )
        : 0;
    if (mode === "MERCHANT_SUBSIDY") {
      const usageBucket = ensureDailySubsidyBucket(merchantId);
      const today = getTodayKey();
      const used = Number(usageBucket[today] || 0);
      const dailyCap =
        Number(session.dailySubsidyCap || 0) > 0
          ? Number(session.dailySubsidyCap)
          : Number.MAX_SAFE_INTEGER;
      const remainingDaily = Math.max(0, roundMoney(dailyCap - used));
      merchantSubsidy = roundMoney(Math.min(desiredSubsidy, remainingDaily));
    }

    const requiredUserContribution = roundMoney(orderAmount - merchantSubsidy);
    const totalContributed = Number(session.totalContributed || 0);

    if (totalContributed < requiredUserContribution) {
      for (const row of session.participants) {
        const user = getUser(merchantId, row.userId);
        refundToWalletByRatio(user, row.deduction, 1);
      }
      session.status = "FAILED";
      session.settledAt = new Date().toISOString();
      session.settlement = {
        operatorId,
        reason: "INSUFFICIENT_CONTRIBUTION",
        orderAmount,
        requiredUserContribution,
        totalContributed,
        merchantSubsidyApplied: 0
      };
      db.save();
      return {
        ...session
      };
    }

    const overPaid = roundMoney(totalContributed - requiredUserContribution);
    if (overPaid > 0) {
      for (const row of session.participants) {
        const user = getUser(merchantId, row.userId);
        const ratio = Number(row.amount || 0) / totalContributed;
        const refundRatio = overPaid / totalContributed;
        const combinedRatio = Math.min(1, Math.max(0, refundRatio));
        const refundResult = refundToWalletByRatio(user, row.deduction, combinedRatio);
        row.refund = refundResult;
      }
    }

    if (merchantSubsidy > 0) {
      const usageBucket = ensureDailySubsidyBucket(merchantId);
      const today = getTodayKey();
      usageBucket[today] = roundMoney(Number(usageBucket[today] || 0) + merchantSubsidy);
    }

    db.ledger.push({
      txnId: db.nextLedgerId(),
      merchantId,
      userId: session.initiatorUserId,
      type: "TREAT_PAY",
      amount: orderAmount,
      details: {
        sessionId,
        mode,
        requiredUserContribution,
        totalContributed,
        merchantSubsidyApplied: merchantSubsidy,
        participants: session.participants.map((item) => ({
          userId: item.userId,
          amount: item.amount
        }))
      },
      timestamp: new Date().toISOString()
    });

    session.status = "SETTLED";
    session.settledAt = new Date().toISOString();
    session.settlement = {
      operatorId,
      orderAmount,
      requiredUserContribution,
      totalContributed,
      overPaid,
      merchantSubsidyApplied: merchantSubsidy
    };
    db.save();
    return {
      ...session
    };
  }

  function getSession({ merchantId, sessionId }) {
    const session = ensureSessionBucket(merchantId)[sessionId];
    assertEntity(session, "session");
    return {
      ...session
    };
  }

  return {
    createSession,
    joinSession,
    closeSession,
    getSession
  };
}

module.exports = {
  createTreatPayService
};
