function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

function createSupplierService(db, options = {}) {
  const fromFreshState = Boolean(options.__fromFreshState);

  function ensurePartnerBucket(partnerId) {
    if (!db.partnerOrders || typeof db.partnerOrders !== "object") {
      db.partnerOrders = {};
    }
    if (!db.partnerOrders[partnerId]) {
      db.partnerOrders[partnerId] = {};
    }
    return db.partnerOrders[partnerId];
  }

  async function registerPartnerOrder({
    partnerId,
    orderId,
    amount,
    status = "PAID"
  }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createSupplierService(workingDb, { __fromFreshState: true });
        return scopedService.registerPartnerOrder({
          partnerId,
          orderId,
          amount,
          status,
        });
      });
    }

    if (!partnerId || !orderId) {
      throw new Error("partnerId and orderId are required");
    }
    const bucket = ensurePartnerBucket(partnerId);
    const record = {
      partnerId,
      orderId,
      amount: toMoney(amount),
      status: String(status || "PAID").toUpperCase(),
      paidAt: new Date().toISOString()
    };
    bucket[orderId] = record;
    db.save();
    return record;
  }

  async function verifyPartnerOrder({
    partnerId,
    orderId,
    minSpend = 0
  }) {
    if (!fromFreshState && typeof db.runWithFreshRead === "function") {
      return db.runWithFreshRead(async (workingDb) => {
        const scopedService = createSupplierService(workingDb, { __fromFreshState: true });
        return scopedService.verifyPartnerOrder({
          partnerId,
          orderId,
          minSpend,
        });
      });
    }

    if (!partnerId || !orderId) {
      throw new Error("partnerId and orderId are required");
    }
    const bucket = ensurePartnerBucket(partnerId);
    const order = bucket[orderId] || null;
    const minimum = toMoney(minSpend);
    const verified = Boolean(
      order &&
        order.status === "PAID" &&
        Number(order.amount || 0) >= minimum
    );

    return {
      partnerId,
      orderId,
      minSpend: minimum,
      verified,
      order: order
        ? {
            ...order
          }
        : null
    };
  }

  return {
    registerPartnerOrder,
    verifyPartnerOrder
  };
}

module.exports = {
  createSupplierService
};
