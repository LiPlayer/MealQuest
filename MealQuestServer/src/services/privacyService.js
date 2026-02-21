function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function createPrivacyService(db) {
  function exportUserData({ merchantId, userId }) {
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

  function deleteUserData({ merchantId, userId }) {
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

  return {
    exportUserData,
    deleteUserData
  };
}

module.exports = {
  createPrivacyService
};
