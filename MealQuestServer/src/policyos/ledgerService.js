const { applyRefundClawback } = require("../core/clawback");

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round(num * 100) / 100;
}

function ensureWallet(user) {
  if (!user.wallet || typeof user.wallet !== "object") {
    user.wallet = {
      principal: 0,
      bonus: 0,
      silver: 0
    };
  }
  return user.wallet;
}

function createPolicyLedgerService(db) {
  if (!db) {
    throw new Error("db is required");
  }

  function resolveIdempotency(key) {
    const normalized = String(key || "").trim();
    if (!normalized) {
      return null;
    }
    if (typeof db.getIdempotencyEntry === "function") {
      return db.getIdempotencyEntry(normalized) || null;
    }
    return (db.idempotencyRecords && db.idempotencyRecords[normalized]) || null;
  }

  function persistIdempotency(key, value) {
    const normalized = String(key || "").trim();
    if (!normalized) {
      return;
    }
    if (typeof db.setIdempotencyEntry === "function") {
      db.setIdempotencyEntry(normalized, value);
      return;
    }
    if (!db.idempotencyRecords || typeof db.idempotencyRecords !== "object") {
      db.idempotencyRecords = {};
    }
    db.idempotencyRecords[normalized] = value;
  }

  function appendLedger(entry) {
    if (!Array.isArray(db.ledger)) {
      db.ledger = [];
    }
    db.ledger.push(entry);
    return entry;
  }

  function createLedgerEntry({
    merchantId,
    userId,
    type,
    idempotencyKey = "",
    entries = [],
    metadata = {}
  }) {
    const txnId = typeof db.nextLedgerId === "function" ? db.nextLedgerId() : `txn_${Date.now()}`;
    const payload = {
      txnId,
      merchantId,
      userId,
      type,
      idempotencyKey: String(idempotencyKey || ""),
      entries,
      metadata,
      createdAt: new Date().toISOString()
    };
    appendLedger(payload);
    return payload;
  }

  function grant({
    merchantId,
    user,
    account = "bonus",
    amount,
    idempotencyKey = "",
    metadata = {}
  }) {
    const normalizedAmount = toMoney(amount);
    if (normalizedAmount <= 0) {
      throw new Error("grant amount must be positive");
    }
    const idemKey = String(idempotencyKey || "").trim();
    if (idemKey) {
      const existing = resolveIdempotency(idemKey);
      if (existing) {
        return existing;
      }
    }
    const wallet = ensureWallet(user);
    wallet[account] = toMoney(Number(wallet[account] || 0) + normalizedAmount);
    const result = createLedgerEntry({
      merchantId,
      userId: user.uid,
      type: "POLICYOS_GRANT",
      idempotencyKey: idemKey,
      entries: [
        {
          account: "marketing_expense",
          direction: "DEBIT",
          amount: normalizedAmount
        },
        {
          account: `user_wallet:${account}`,
          direction: "CREDIT",
          amount: normalizedAmount
        }
      ],
      metadata
    });
    if (idemKey) {
      persistIdempotency(idemKey, result);
    }
    db.save();
    return result;
  }

  function record({
    merchantId,
    userId = "",
    type = "POLICYOS_EVENT",
    idempotencyKey = "",
    entries = [],
    metadata = {}
  }) {
    const idemKey = String(idempotencyKey || "").trim();
    if (idemKey) {
      const existing = resolveIdempotency(idemKey);
      if (existing) {
        return existing;
      }
    }
    const txn = createLedgerEntry({
      merchantId,
      userId: String(userId || ""),
      type,
      idempotencyKey: idemKey,
      entries: Array.isArray(entries) ? entries : [],
      metadata: metadata && typeof metadata === "object" ? metadata : {}
    });
    if (idemKey) {
      persistIdempotency(idemKey, txn);
    }
    db.save();
    return txn;
  }

  function clawbackRefund({
    merchantId,
    user,
    refundAmount,
    bonusConsumed = 0,
    idempotencyKey = "",
    metadata = {}
  }) {
    const normalizedRefund = toMoney(refundAmount);
    if (normalizedRefund <= 0) {
      throw new Error("refundAmount must be positive");
    }
    const idemKey = String(idempotencyKey || "").trim();
    if (idemKey) {
      const existing = resolveIdempotency(idemKey);
      if (existing) {
        return existing;
      }
    }
    const wallet = ensureWallet(user);
    const result = applyRefundClawback({
      wallet,
      refundAmount: normalizedRefund,
      bonusConsumed: toMoney(bonusConsumed)
    });
    user.wallet = result.nextWallet;
    const txn = createLedgerEntry({
      merchantId,
      userId: user.uid,
      type: "POLICYOS_CLAWBACK",
      idempotencyKey: idemKey,
      entries: [
        {
          account: "user_wallet:bonus",
          direction: "DEBIT",
          amount: toMoney(result.clawback.fromBonus)
        },
        {
          account: "user_wallet:principal",
          direction: "DEBIT",
          amount: toMoney(result.clawback.fromPrincipal)
        },
        {
          account: "refund_pool",
          direction: "CREDIT",
          amount: toMoney(result.clawback.reclaimTarget)
        }
      ],
      metadata: {
        ...metadata,
        clawback: result.clawback
      }
    });
    if (idemKey) {
      persistIdempotency(idemKey, txn);
    }
    db.save();
    return {
      ledger: txn,
      clawback: result.clawback,
      wallet: result.nextWallet
    };
  }

  function reconcileMerchant({ merchantId }) {
    const rows = (db.ledger || []).filter((item) => item.merchantId === merchantId);
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      for (const entry of row.entries || []) {
        const amount = toMoney(entry.amount);
        if (String(entry.direction || "").toUpperCase() === "DEBIT") {
          debit += amount;
        } else if (String(entry.direction || "").toUpperCase() === "CREDIT") {
          credit += amount;
        }
      }
    }
    return {
      merchantId,
      debit: toMoney(debit),
      credit: toMoney(credit),
      delta: toMoney(debit - credit),
      balanced: Math.abs(toMoney(debit - credit)) < 0.0001
    };
  }

  return {
    grant,
    record,
    clawbackRefund,
    reconcileMerchant
  };
}

module.exports = {
  createPolicyLedgerService
};
