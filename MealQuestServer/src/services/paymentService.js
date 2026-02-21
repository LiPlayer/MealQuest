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
    const user = db.users[userId];
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

    const idemKey = `verify:${idempotencyKey}`;
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

    db.payments[paymentLedger.txnId] = {
      paymentTxnId: paymentLedger.txnId,
      merchantId,
      userId,
      orderAmount: Number(orderAmount),
      deduction: quote.deduction,
      refundedAmount: 0,
      createdAt: paymentLedger.timestamp
    };

    merchant.budgetUsed = roundMoney(merchant.budgetUsed + quote.deduction.voucher);

    const result = {
      paymentTxnId: paymentLedger.txnId,
      quote,
      wallet: user.wallet
    };
    db.idempotencyMap.set(idemKey, result);
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
    const idemKey = `refund:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const { user } = getMerchantAndUser({ merchantId, userId });
    const payment = db.payments[paymentTxnId];
    assertEntity(payment, "payment");

    const availableRefund = roundMoney(payment.orderAmount - payment.refundedAmount);
    if (refundAmount > availableRefund) {
      throw new Error("refundAmount exceeds available amount");
    }

    const ratio = refundAmount / payment.orderAmount;
    const bonusConsumed = roundMoney(payment.deduction.bonus * ratio);

    const clawbackResult = applyRefundClawback({
      wallet: user.wallet,
      refundAmount: Number(refundAmount),
      bonusConsumed
    });

    user.wallet = clawbackResult.nextWallet;
    payment.refundedAmount = roundMoney(payment.refundedAmount + refundAmount);

    const refundLedger = appendLedger({
      merchantId,
      userId,
      type: "REFUND",
      amount: Number(refundAmount),
      details: {
        paymentTxnId,
        clawback: clawbackResult.clawback
      }
    });

    const result = {
      refundTxnId: refundLedger.txnId,
      paymentTxnId,
      refundedAmount: refundAmount,
      wallet: user.wallet,
      clawback: clawbackResult.clawback
    };
    db.idempotencyMap.set(idemKey, result);
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
