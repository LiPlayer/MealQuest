const { buildCheckoutQuote } = require("../core/smartCheckout");
const { applyRefundClawback } = require("../core/clawback");

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function createPaymentService(db) {
  function getMerchantAndUser({ merchantId, userId }) {
    const merchant = db.merchants[merchantId];
    const user = db.getMerchantUser(merchantId, userId);
    assertEntity(merchant, "merchant");
    assertEntity(user, "user");
    return { merchant, user };
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

  function verifyPayment({ merchantId, userId, orderAmount, idempotencyKey }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }

    const idemKey = `verify:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const { user, merchant } = getMerchantAndUser({ merchantId, userId });
    const quote = getQuote({ merchantId, userId, orderAmount });

    user.wallet = {
      ...quote.remainingWallet
    };

    if (quote.selectedVoucher) {
      const voucher = user.vouchers.find((item) => item.id === quote.selectedVoucher.id);
      if (voucher) {
        voucher.status = "USED";
      }
    }

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
      orderAmount: Number(orderAmount),
      deduction: quote.deduction,
      refundedAmount: 0,
      createdAt: paymentLedger.timestamp
    });

    merchant.budgetUsed = roundMoney(merchant.budgetUsed + quote.deduction.voucher);

    const result = {
      paymentTxnId: paymentLedger.txnId,
      quote,
      wallet: user.wallet
    };
    db.idempotencyMap.set(idemKey, result);
    db.save();
    return result;
  }

  function refundPayment({
    merchantId,
    userId,
    paymentTxnId,
    refundAmount,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const idemKey = `refund:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const payment = db.getPayment(merchantId, paymentTxnId);
    assertEntity(payment, "payment");
    if (userId && payment.userId !== userId) {
      throw new Error("payment user mismatch");
    }
    const user = db.getMerchantUser(merchantId, payment.userId);
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
      clawback: clawbackResult.clawback
    };
    db.idempotencyMap.set(idemKey, result);
    db.save();
    return result;
  }

  return {
    getQuote,
    verifyPayment,
    refundPayment
  };
}

module.exports = {
  createPaymentService
};
