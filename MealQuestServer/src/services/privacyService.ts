function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function buildDeletedAlias(merchantId, userId) {
  return `DELETED_${merchantId}_${userId}`;
}

function replaceUserRef(value, userId, alias) {
  return value === userId ? alias : value;
}

function createPrivacyService(db, options = {}) {
  const fromFreshState = Boolean(options.__fromFreshState);

  async function exportUserData({ merchantId, userId }) {
    if (!fromFreshState && typeof db.runWithFreshRead === "function") {
      return db.runWithFreshRead(async (workingDb) => {
        const scopedService = createPrivacyService(workingDb, { __fromFreshState: true });
        return scopedService.exportUserData({ merchantId, userId });
      });
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const user = db.getMerchantUser(merchantId, userId);
    assertEntity(user, "user");

    const payments = Object.values(db.paymentsByMerchant[merchantId] || {}).filter(
      (item) => item.userId === userId
    );
    const invoices = Object.values(db.invoicesByMerchant[merchantId] || {}).filter(
      (item) => item.userId === userId
    );
    const ledger = (db.ledger || []).filter(
      (item) => item.merchantId === merchantId && item.userId === userId
    );

    return {
      merchantId,
      userId,
      exportedAt: new Date().toISOString(),
      user,
      payments,
      invoices,
      ledger
    };
  }

  async function deleteUserData({ merchantId, userId }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createPrivacyService(workingDb, { __fromFreshState: true });
        return scopedService.deleteUserData({ merchantId, userId });
      });
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const user = db.getMerchantUser(merchantId, userId);
    assertEntity(user, "user");

    if (user.isDeleted) {
      return {
        merchantId,
        userId,
        deleted: true,
        deletedAt: user.deletedAt
      };
    }

    user.displayName = `ANONYMIZED_${userId}`;
    user.tags = [];
    user.fragments = {};
    user.vouchers = [];
    user.isDeleted = true;
    user.deletedAt = new Date().toISOString();
    db.save();

    return {
      merchantId,
      userId,
      deleted: true,
      deletedAt: user.deletedAt
    };
  }

  async function cancelUserAccount({ merchantId, userId }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createPrivacyService(workingDb, { __fromFreshState: true });
        return scopedService.cancelUserAccount({ merchantId, userId });
      });
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const users = db.merchantUsers[merchantId] || {};
    const user = users[userId];
    assertEntity(user, "user");

    const deletedAt = new Date().toISOString();
    const alias = buildDeletedAlias(merchantId, userId);

    for (const payment of Object.values(db.paymentsByMerchant[merchantId] || {})) {
      payment.userId = replaceUserRef(payment.userId, userId, alias);
    }
    for (const invoice of Object.values(db.invoicesByMerchant[merchantId] || {})) {
      invoice.userId = replaceUserRef(invoice.userId, userId, alias);
    }
    for (const row of db.ledger || []) {
      if (row.merchantId !== merchantId) {
        continue;
      }
      row.userId = replaceUserRef(row.userId, userId, alias);
    }
    for (const row of db.auditLogs || []) {
      if (row.merchantId !== merchantId) {
        continue;
      }
      row.operatorId = replaceUserRef(row.operatorId, userId, alias);
    }

    delete users[userId];
    db.save();

    return {
      merchantId,
      userId,
      deleted: true,
      deletedAt,
      anonymizedUserId: alias
    };
  }

  return {
    exportUserData,
    deleteUserData,
    cancelUserAccount
  };
}

module.exports = {
  createPrivacyService
};
