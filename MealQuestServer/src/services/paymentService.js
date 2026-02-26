const { buildCheckoutQuote } = require("../core/smartCheckout");
const { applyRefundClawback } = require("../core/clawback");

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function createDefaultPaymentProvider() {
  return {
    name: "MOCK_GATEWAY",
    createPaymentIntent({ merchantId, userId, orderAmount, payableAmount }) {
      return {
        provider: "MOCK_GATEWAY",
        merchantId,
        userId,
        orderAmount: roundMoney(orderAmount),
        payableAmount: roundMoney(payableAmount),
        paymentIntentId: `pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "REQUIRES_CALLBACK"
      };
    }
  };
}

function createPaymentService(db, options = {}) {
  const paymentProvider = options.paymentProvider || createDefaultPaymentProvider();
  const fromFreshState = Boolean(options.__fromFreshState);
  const keyLocks = new Map();

  async function withKeyLock(key, runner) {
    const lockKey = String(key || "__default__");
    const previous = keyLocks.get(lockKey) || Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    keyLocks.set(lockKey, tail);

    await previous;
    try {
      return await runner();
    } finally {
      releaseCurrent();
      if (keyLocks.get(lockKey) === tail) {
        keyLocks.delete(lockKey);
      }
    }
  }

  function getIdempotencyEntry(key) {
    if (typeof db.getIdempotencyEntry === "function") {
      return db.getIdempotencyEntry(key);
    }
    if (!db.idempotencyMap || typeof db.idempotencyMap.get !== "function") {
      return null;
    }
    return db.idempotencyMap.get(key) || null;
  }

  function setIdempotencyEntry(key, value) {
    if (typeof db.setIdempotencyEntry === "function") {
      db.setIdempotencyEntry(key, value);
      return;
    }
    if (!db.idempotencyMap || typeof db.idempotencyMap.set !== "function") {
      db.idempotencyMap = new Map();
    }
    db.idempotencyMap.set(key, value);
  }

  function resolveWalletScope(merchantId) {
    const config =
      db.allianceConfigs && db.allianceConfigs[merchantId]
        ? db.allianceConfigs[merchantId]
        : null;
    if (
      !config ||
      !config.walletShared ||
      !Array.isArray(config.stores) ||
      config.stores.length === 0
    ) {
      return {
        walletMerchantId: merchantId,
        walletShared: false
      };
    }
    const firstStore = config.stores.find((storeId) => db.merchants[storeId]);
    return {
      walletMerchantId: firstStore || merchantId,
      walletShared: true
    };
  }

  function getMerchantAndUser({ merchantId, userId }) {
    if (!String(userId || "").trim()) {
      throw new Error("userId is required");
    }
    const merchant = db.merchants[merchantId];
    const scope = resolveWalletScope(merchantId);
    assertEntity(merchant, "merchant");
    const user = db.getMerchantUser(scope.walletMerchantId, userId);
    assertEntity(user, "user");
    return {
      merchant,
      user,
      walletMerchantId: scope.walletMerchantId,
      walletShared: scope.walletShared
    };
  }

  function getQuote({ merchantId, userId, orderAmount }) {
    const { user } = getMerchantAndUser({ merchantId, userId });
    return buildCheckoutQuote({
      orderAmount: Number(orderAmount),
      wallet: user.wallet,
      vouchers: user.vouchers
    });
  }

  function appendLedger({ merchantId, userId, type, amount, details }) {
    const ledgerRecord = {
      txnId: db.nextLedgerId(),
      merchantId,
      userId,
      type,
      amount: roundMoney(amount),
      details,
      timestamp: new Date().toISOString()
    };
    db.ledger.push(ledgerRecord);
    return ledgerRecord;
  }

  function applyQuoteToUser(user, quote) {
    user.wallet = {
      ...quote.remainingWallet
    };
    if (quote.selectedVoucher) {
      const voucher = user.vouchers.find((item) => item.id === quote.selectedVoucher.id);
      if (voucher) {
        voucher.status = "USED";
      }
    }
    return user.wallet;
  }

  async function verifyPayment({ merchantId, userId, orderAmount, idempotencyKey }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createPaymentService(workingDb, {
          paymentProvider,
          __fromFreshState: true,
        });
        return scopedService.verifyPayment({
          merchantId,
          userId,
          orderAmount,
          idempotencyKey,
        });
      });
    }

    const lockKey = `verify:${merchantId}:${userId}`;
    return withKeyLock(lockKey, async () => {
      if (!idempotencyKey) {
        throw new Error("Idempotency-Key is required");
      }

      const idemKey = `verify:${merchantId}:${idempotencyKey}`;
      const cached = getIdempotencyEntry(idemKey);
      if (cached) {
        return cached;
      }

      const { user, merchant, walletMerchantId, walletShared } = getMerchantAndUser({
        merchantId,
        userId
      });
      const quote = getQuote({ merchantId, userId, orderAmount });
      const payable = roundMoney(quote.payable);

      if (payable > 0) {
        const externalPayment = paymentProvider.createPaymentIntent({
          merchantId,
          userId,
          orderAmount: Number(orderAmount),
          payableAmount: payable
        });
        const paymentTxnId = db.nextLedgerId();
        const paymentRecord = {
          paymentTxnId,
          merchantId,
          userId,
          status: "PENDING_EXTERNAL",
          orderAmount: Number(orderAmount),
          deduction: quote.deduction,
          quote,
          refundedAmount: 0,
          externalPayment: {
            provider: externalPayment.provider || paymentProvider.name || "GATEWAY",
            paymentIntentId: externalPayment.paymentIntentId,
            payableAmount: payable,
            status: "PENDING",
            externalTxnId: null,
            confirmedAt: null
          },
          createdAt: new Date().toISOString()
        };

        db.setPayment(merchantId, paymentTxnId, paymentRecord);
        appendLedger({
          merchantId,
          userId,
          type: "PAYMENT_PENDING",
          amount: Number(orderAmount),
          details: {
            quote,
            externalPayment: paymentRecord.externalPayment
          }
        });

        const result = {
          paymentTxnId,
          status: paymentRecord.status,
          quote,
          externalPayment: paymentRecord.externalPayment,
          walletScope: {
            walletShared,
            walletMerchantId
          }
        };
        setIdempotencyEntry(idemKey, result);
        db.save();
        return result;
      }

      applyQuoteToUser(user, quote);
      const paymentLedger = appendLedger({
        merchantId,
        userId,
        type: "PAYMENT",
        amount: Number(orderAmount),
        details: {
          quote
        }
      });

      db.setPayment(merchantId, paymentLedger.txnId, {
        paymentTxnId: paymentLedger.txnId,
        merchantId,
        userId,
        status: "PAID",
        orderAmount: Number(orderAmount),
        deduction: quote.deduction,
        quote,
        refundedAmount: 0,
        externalPayment: null,
        createdAt: paymentLedger.timestamp
      });

      merchant.budgetUsed = roundMoney(merchant.budgetUsed + quote.deduction.voucher);

      const result = {
        paymentTxnId: paymentLedger.txnId,
        status: "PAID",
        quote,
        wallet: user.wallet,
        walletScope: {
          walletShared,
          walletMerchantId
        }
      };
      setIdempotencyEntry(idemKey, result);
      db.save();
      return result;
    });
  }

  async function confirmExternalPayment({
    merchantId,
    paymentTxnId,
    externalTxnId,
    callbackStatus,
    paidAmount,
    idempotencyKey
  }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createPaymentService(workingDb, {
          paymentProvider,
          __fromFreshState: true,
        });
        return scopedService.confirmExternalPayment({
          merchantId,
          paymentTxnId,
          externalTxnId,
          callbackStatus,
          paidAmount,
          idempotencyKey,
        });
      });
    }

    const lockKey = `callback:${merchantId}:${paymentTxnId}`;
    return withKeyLock(lockKey, async () => {
      if (!idempotencyKey) {
        throw new Error("callback idempotencyKey is required");
      }

      const idemKey = `callback:${merchantId}:${idempotencyKey}`;
      const cached = getIdempotencyEntry(idemKey);
      if (cached) {
        return cached;
      }

      const merchant = db.merchants[merchantId];
      assertEntity(merchant, "merchant");
      const payment = db.getPayment(merchantId, paymentTxnId);
      assertEntity(payment, "payment");

      if (payment.status === "PAID") {
        const settled = {
          paymentTxnId: payment.paymentTxnId,
          status: payment.status,
          externalPayment: payment.externalPayment,
          wallet: getMerchantAndUser({ merchantId, userId: payment.userId }).user.wallet
        };
        setIdempotencyEntry(idemKey, settled);
        return settled;
      }

      if (payment.status !== "PENDING_EXTERNAL") {
        throw new Error("payment is not waiting for external callback");
      }

      if (String(callbackStatus || "").toUpperCase() !== "SUCCESS") {
        payment.status = "EXTERNAL_FAILED";
        payment.externalPayment.status = "FAILED";
        payment.externalPayment.externalTxnId = externalTxnId || null;
        payment.externalPayment.confirmedAt = new Date().toISOString();
        db.save();
        const failedResult = {
          paymentTxnId: payment.paymentTxnId,
          status: payment.status,
          externalPayment: payment.externalPayment
        };
        setIdempotencyEntry(idemKey, failedResult);
        return failedResult;
      }

      const normalizedPaid = roundMoney(paidAmount);
      const expectedPaid = roundMoney(payment.externalPayment.payableAmount);
      if (normalizedPaid !== expectedPaid) {
        throw new Error("paidAmount mismatch");
      }

      const userScope = getMerchantAndUser({ merchantId, userId: payment.userId });
      const user = userScope.user;
      assertEntity(user, "user");
      applyQuoteToUser(user, payment.quote);

      payment.status = "PAID";
      payment.externalPayment.status = "CONFIRMED";
      payment.externalPayment.externalTxnId = externalTxnId || null;
      payment.externalPayment.confirmedAt = new Date().toISOString();

      appendLedger({
        merchantId,
        userId: payment.userId,
        type: "PAYMENT_EXTERNAL_CONFIRM",
        amount: normalizedPaid,
        details: {
          paymentTxnId: payment.paymentTxnId,
          externalTxnId: payment.externalPayment.externalTxnId
        }
      });

      merchant.budgetUsed = roundMoney(
        merchant.budgetUsed + Number(payment.deduction && payment.deduction.voucher ? payment.deduction.voucher : 0)
      );

      const result = {
        paymentTxnId: payment.paymentTxnId,
        status: payment.status,
        externalPayment: payment.externalPayment,
        wallet: user.wallet,
        walletScope: {
          walletShared: userScope.walletShared,
          walletMerchantId: userScope.walletMerchantId
        }
      };
      setIdempotencyEntry(idemKey, result);
      db.save();
      return result;
    });
  }

  async function refundPayment({
    merchantId,
    userId,
    paymentTxnId,
    refundAmount,
    idempotencyKey
  }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createPaymentService(workingDb, {
          paymentProvider,
          __fromFreshState: true,
        });
        return scopedService.refundPayment({
          merchantId,
          userId,
          paymentTxnId,
          refundAmount,
          idempotencyKey,
        });
      });
    }

    const lockKey = `refund:${merchantId}:${paymentTxnId}`;
    return withKeyLock(lockKey, async () => {
      if (!idempotencyKey) {
        throw new Error("Idempotency-Key is required");
      }
      const idemKey = `refund:${merchantId}:${idempotencyKey}`;
      const cached = getIdempotencyEntry(idemKey);
      if (cached) {
        return cached;
      }

      const merchant = db.merchants[merchantId];
      assertEntity(merchant, "merchant");
      const payment = db.getPayment(merchantId, paymentTxnId);
      assertEntity(payment, "payment");
      if (payment.status !== "PAID") {
        throw new Error("payment is not settled");
      }
      if (userId && payment.userId !== userId) {
        throw new Error("payment user mismatch");
      }
      const userScope = getMerchantAndUser({ merchantId, userId: payment.userId });
      const user = userScope.user;
      assertEntity(user, "user");

      const normalizedRefundAmount = Number(refundAmount);
      const availableRefund = roundMoney(payment.orderAmount - payment.refundedAmount);
      if (normalizedRefundAmount > availableRefund) {
        throw new Error("refundAmount exceeds available amount");
      }

      const ratio = normalizedRefundAmount / payment.orderAmount;
      const bonusConsumed = roundMoney(payment.deduction.bonus * ratio);

      const clawbackResult = applyRefundClawback({
        wallet: user.wallet,
        refundAmount: normalizedRefundAmount,
        bonusConsumed
      });

      user.wallet = clawbackResult.nextWallet;
      payment.refundedAmount = roundMoney(payment.refundedAmount + normalizedRefundAmount);

      const refundLedger = appendLedger({
        merchantId,
        userId: payment.userId,
        type: "REFUND",
        amount: normalizedRefundAmount,
        details: {
          paymentTxnId,
          clawback: clawbackResult.clawback
        }
      });

      const result = {
        refundTxnId: refundLedger.txnId,
        paymentTxnId,
        refundedAmount: normalizedRefundAmount,
        wallet: user.wallet,
        clawback: clawbackResult.clawback,
        walletScope: {
          walletShared: userScope.walletShared,
          walletMerchantId: userScope.walletMerchantId
        }
      };
      setIdempotencyEntry(idemKey, result);
      db.save();
      return result;
    });
  }

  return {
    getQuote,
    verifyPayment,
    confirmExternalPayment,
    refundPayment
  };
}

module.exports = {
  createPaymentService
};
