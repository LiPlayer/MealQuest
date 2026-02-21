function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function normalizeStoreList(stores) {
  if (!Array.isArray(stores)) {
    return [];
  }
  return [...new Set(stores.map((item) => String(item || "").trim()).filter(Boolean))];
}

function cloneUserShape(user) {
  return {
    uid: user.uid,
    displayName: user.displayName,
    wallet: { ...(user.wallet || { principal: 0, bonus: 0, silver: 0 }) },
    tags: Array.isArray(user.tags) ? [...user.tags] : [],
    fragments: { ...(user.fragments || {}) },
    vouchers: Array.isArray(user.vouchers) ? user.vouchers.map((item) => ({ ...item })) : []
  };
}

function createAllianceService(db) {
  function ensureAllianceBucket() {
    if (!db.allianceConfigs || typeof db.allianceConfigs !== "object") {
      db.allianceConfigs = {};
    }
    return db.allianceConfigs;
  }

  function buildDefaultConfig(merchantId) {
    return {
      merchantId,
      clusterId: `cluster_${merchantId}`,
      stores: [merchantId],
      walletShared: false,
      tierShared: false,
      updatedAt: new Date().toISOString()
    };
  }

  function getAllianceConfig({ merchantId }) {
    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const bucket = ensureAllianceBucket();
    return {
      ...(bucket[merchantId] || buildDefaultConfig(merchantId))
    };
  }

  function setAllianceConfig({
    merchantId,
    clusterId = "",
    stores = [],
    walletShared,
    tierShared
  }) {
    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const bucket = ensureAllianceBucket();
    const previous = getAllianceConfig({ merchantId });
    const normalizedStores = normalizeStoreList(stores);
    for (const storeId of normalizedStores) {
      if (!db.merchants[storeId]) {
        throw new Error(`store not found: ${storeId}`);
      }
    }
    const next = {
      ...previous,
      clusterId: clusterId ? String(clusterId) : previous.clusterId,
      stores: normalizedStores.length > 0 ? normalizedStores : previous.stores,
      walletShared:
        walletShared === undefined ? previous.walletShared : Boolean(walletShared),
      tierShared: tierShared === undefined ? previous.tierShared : Boolean(tierShared),
      updatedAt: new Date().toISOString()
    };
    bucket[merchantId] = next;
    db.save();
    return {
      ...next
    };
  }

  function listStores({ merchantId }) {
    const config = getAllianceConfig({ merchantId });
    return {
      merchantId,
      clusterId: config.clusterId,
      walletShared: config.walletShared,
      tierShared: config.tierShared,
      stores: config.stores.map((storeId) => ({
        merchantId: storeId,
        name: db.merchants[storeId] ? db.merchants[storeId].name : storeId
      }))
    };
  }

  function syncUserAcrossStores({ merchantId, userId }) {
    const config = getAllianceConfig({ merchantId });
    const sourceUsers = db.merchantUsers[merchantId] || {};
    const sourceUser = sourceUsers[userId];
    assertEntity(sourceUser, "user");

    const syncedStores = [];
    for (const storeId of config.stores) {
      if (!db.merchantUsers[storeId]) {
        db.merchantUsers[storeId] = {};
      }
      db.merchantUsers[storeId][userId] = cloneUserShape(sourceUser);
      syncedStores.push(storeId);
    }
    db.save();
    return {
      merchantId,
      userId,
      syncedStores
    };
  }

  return {
    getAllianceConfig,
    setAllianceConfig,
    listStores,
    syncUserAcrossStores
  };
}

module.exports = {
  createAllianceService
};
