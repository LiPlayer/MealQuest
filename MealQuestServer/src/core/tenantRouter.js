function uniqueDbs(list) {
  const result = [];
  for (const item of list) {
    if (!item) {
      continue;
    }
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function findUserInDb(db, merchantId, userId) {
  if (!db || !merchantId || !userId) {
    return null;
  }
  if (typeof db.getMerchantUser === "function") {
    return db.getMerchantUser(merchantId, userId);
  }
  const bucket = db.merchantUsers && db.merchantUsers[merchantId];
  if (!bucket) {
    return null;
  }
  return bucket[userId] || null;
}

function createTenantRouter({ defaultDb, tenantDbMap = {} }) {
  if (!defaultDb) {
    throw new Error("defaultDb is required");
  }

  const overrideEntries = Object.entries(tenantDbMap || {}).filter(([, db]) =>
    Boolean(db)
  );
  const overrideMap = Object.fromEntries(overrideEntries);

  function getOverrideDbs() {
    return Object.values(overrideMap).filter(Boolean);
  }

  function getCandidateDbs(merchantId) {
    const preferred = merchantId ? overrideMap[merchantId] : null;
    return uniqueDbs([preferred, defaultDb, ...getOverrideDbs()]);
  }

  function getDbForMerchant(merchantId) {
    if (!merchantId) {
      return defaultDb;
    }
    for (const db of getCandidateDbs(merchantId)) {
      if (db.merchants && db.merchants[merchantId]) {
        return db;
      }
    }
    return overrideMap[merchantId] || defaultDb;
  }

  function getMerchant(merchantId) {
    if (!merchantId) {
      return null;
    }
    const db = getDbForMerchant(merchantId);
    return (db.merchants && db.merchants[merchantId]) || null;
  }

  function getMerchantUser(merchantId, userId) {
    if (!merchantId || !userId) {
      return null;
    }
    for (const db of getCandidateDbs(merchantId)) {
      const user = findUserInDb(db, merchantId, userId);
      if (user) {
        return user;
      }
    }
    return null;
  }

  function setDbForMerchant(merchantId, db) {
    if (!merchantId) {
      throw new Error("merchantId is required");
    }
    if (!db) {
      throw new Error("db is required");
    }
    overrideMap[merchantId] = db;
    return db;
  }

  function clearDbForMerchant(merchantId) {
    if (!merchantId) {
      return;
    }
    delete overrideMap[merchantId];
  }

  function hasDbOverride(merchantId) {
    return Boolean(merchantId && overrideMap[merchantId]);
  }

  return {
    getDbForMerchant,
    getMerchant,
    getMerchantUser,
    setDbForMerchant,
    clearDbForMerchant,
    hasDbOverride
  };
}

module.exports = {
  createTenantRouter
};
