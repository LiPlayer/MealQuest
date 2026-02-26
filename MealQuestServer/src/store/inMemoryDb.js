function createDefaultState() {
  return {
    idCounters: {
      ledger: 0,
      audit: 0
    },
    merchants: {},
    merchantUsers: {},
    paymentsByMerchant: {},
    invoicesByMerchant: {},
    partnerOrders: {},
    strategyConfigs: {},
    strategyChats: {},
    allianceConfigs: {},
    phoneLoginCodes: {},
    socialAuth: {
      customerBindingsByMerchant: {},
      customerPhoneBindingsByMerchant: {}
    },
    contractApplications: {},
    tenantPolicies: {},
    tenantMigrations: {},
    tenantRouteFiles: {},
    idempotencyRecords: {},
    ledger: [],
    auditLogs: [],
    campaigns: [],
    proposals: []
  };
}

function createIdGenerator(prefix, counters, counterName) {
  return () => {
    counters[counterName] = Number(counters[counterName] || 0) + 1;
    return `${prefix}_${Date.now()}_${counters[counterName]}`;
  };
}

function migrateLegacyShape(state) {
  const next = { ...(state || {}) };

  if (!next.merchantUsers || typeof next.merchantUsers !== "object") {
    next.merchantUsers = {};
  }
  if (next.users && Object.keys(next.merchantUsers).length === 0) {
    const fallbackMerchantId =
      Object.keys(next.merchants || {})[0] || "m_legacy_default";
    next.merchantUsers[fallbackMerchantId] = next.users;
  }

  if (!next.paymentsByMerchant || typeof next.paymentsByMerchant !== "object") {
    next.paymentsByMerchant = {};
  }
  if (next.payments && Object.keys(next.paymentsByMerchant).length === 0) {
    for (const [paymentTxnId, payment] of Object.entries(next.payments)) {
      const merchantId =
        payment && payment.merchantId
          ? payment.merchantId
          : Object.keys(next.merchants || {})[0] || "m_legacy_default";
      if (!next.paymentsByMerchant[merchantId]) {
        next.paymentsByMerchant[merchantId] = {};
      }
      next.paymentsByMerchant[merchantId][paymentTxnId] = payment;
    }
  }

  if (!next.invoicesByMerchant || typeof next.invoicesByMerchant !== "object") {
    next.invoicesByMerchant = {};
  }
  if (!next.partnerOrders || typeof next.partnerOrders !== "object") {
    next.partnerOrders = {};
  }
  if (!next.strategyConfigs || typeof next.strategyConfigs !== "object") {
    next.strategyConfigs = {};
  }
  if (!next.strategyChats || typeof next.strategyChats !== "object") {
    next.strategyChats = {};
  }
  if (!next.allianceConfigs || typeof next.allianceConfigs !== "object") {
    next.allianceConfigs = {};
  }
  if (!next.phoneLoginCodes || typeof next.phoneLoginCodes !== "object") {
    next.phoneLoginCodes = {};
  }
  if (!next.socialAuth || typeof next.socialAuth !== "object") {
    next.socialAuth = {};
  }
  if (
    !next.socialAuth.customerBindingsByMerchant ||
    typeof next.socialAuth.customerBindingsByMerchant !== "object"
  ) {
    next.socialAuth.customerBindingsByMerchant = {};
  }
  if (
    !next.socialAuth.customerPhoneBindingsByMerchant ||
    typeof next.socialAuth.customerPhoneBindingsByMerchant !== "object"
  ) {
    next.socialAuth.customerPhoneBindingsByMerchant = {};
  }
  if (!next.contractApplications || typeof next.contractApplications !== "object") {
    next.contractApplications = {};
  }

  if (!next.tenantPolicies || typeof next.tenantPolicies !== "object") {
    next.tenantPolicies = {};
  }
  if (!next.tenantMigrations || typeof next.tenantMigrations !== "object") {
    next.tenantMigrations = {};
  }
  if (!next.tenantRouteFiles || typeof next.tenantRouteFiles !== "object") {
    next.tenantRouteFiles = {};
  }
  if (!next.idempotencyRecords || typeof next.idempotencyRecords !== "object") {
    next.idempotencyRecords = {};
  }

  return next;
}

function ensureMerchantBuckets(state) {
  for (const merchantId of Object.keys(state.merchants || {})) {
    if (!state.merchantUsers[merchantId]) {
      state.merchantUsers[merchantId] = {};
    }
    if (!state.paymentsByMerchant[merchantId]) {
      state.paymentsByMerchant[merchantId] = {};
    }
    if (!state.invoicesByMerchant[merchantId]) {
      state.invoicesByMerchant[merchantId] = {};
    }
    if (!state.strategyConfigs[merchantId]) {
      state.strategyConfigs[merchantId] = {};
    }
    if (!state.strategyChats[merchantId]) {
      state.strategyChats[merchantId] = {
        activeSessionId: null,
        sessions: {}
      };
    }
  }
}

function normalizeState(initialState = null) {
  const defaults = createDefaultState();
  if (!initialState) {
    return defaults;
  }

  const migrated = migrateLegacyShape(initialState);
  const normalized = {
    ...defaults,
    ...migrated,
    idCounters: {
      ...defaults.idCounters,
      ...(migrated.idCounters || {})
    },
    merchants: {
      ...defaults.merchants,
      ...(migrated.merchants || {})
    },
    merchantUsers: {
      ...defaults.merchantUsers,
      ...(migrated.merchantUsers || {})
    },
    paymentsByMerchant: {
      ...defaults.paymentsByMerchant,
      ...(migrated.paymentsByMerchant || {})
    },
    invoicesByMerchant: {
      ...defaults.invoicesByMerchant,
      ...(migrated.invoicesByMerchant || {})
    },
    partnerOrders: {
      ...defaults.partnerOrders,
      ...(migrated.partnerOrders || {})
    },
    strategyConfigs: {
      ...defaults.strategyConfigs,
      ...(migrated.strategyConfigs || {})
    },
    strategyChats: {
      ...defaults.strategyChats,
      ...(migrated.strategyChats || {})
    },
    allianceConfigs: {
      ...defaults.allianceConfigs,
      ...(migrated.allianceConfigs || {})
    },
    phoneLoginCodes: {
      ...defaults.phoneLoginCodes,
      ...(migrated.phoneLoginCodes || {})
    },
    socialAuth: {
      customerBindingsByMerchant: {
        ...defaults.socialAuth.customerBindingsByMerchant,
        ...((migrated.socialAuth && migrated.socialAuth.customerBindingsByMerchant) || {})
      },
      customerPhoneBindingsByMerchant: {
        ...defaults.socialAuth.customerPhoneBindingsByMerchant,
        ...((migrated.socialAuth && migrated.socialAuth.customerPhoneBindingsByMerchant) || {})
      }
    },
    contractApplications: {
      ...defaults.contractApplications,
      ...(migrated.contractApplications || {})
    },
    tenantPolicies: {
      ...defaults.tenantPolicies,
      ...(migrated.tenantPolicies || {})
    },
    tenantMigrations: {
      ...defaults.tenantMigrations,
      ...(migrated.tenantMigrations || {})
    },
    tenantRouteFiles: {
      ...defaults.tenantRouteFiles,
      ...(migrated.tenantRouteFiles || {})
    },
    idempotencyRecords: {
      ...defaults.idempotencyRecords,
      ...(migrated.idempotencyRecords || {})
    },
    ledger: Array.isArray(migrated.ledger) ? migrated.ledger : defaults.ledger,
    auditLogs: Array.isArray(migrated.auditLogs)
      ? migrated.auditLogs
      : defaults.auditLogs,
    campaigns: Array.isArray(migrated.campaigns) ? migrated.campaigns : defaults.campaigns,
    proposals: Array.isArray(migrated.proposals) ? migrated.proposals : defaults.proposals
  };
  // Drop removed social/treat fields when loading legacy snapshots.
  delete normalized.groupTreatSessionsByMerchant;
  delete normalized.merchantDailySubsidyUsage;
  delete normalized.socialTransferLogs;
  ensureMerchantBuckets(normalized);
  return normalized;
}

function createInMemoryDb(initialState = null) {
  const state = normalizeState(initialState);
  const idempotencyEntries = Object.entries(state.idempotencyRecords || {});
  const db = {
    ...state,
    idempotencyMap: new Map(idempotencyEntries),
    save: () => {},
    serialize: () => ({
      idCounters: { ...db.idCounters },
      merchants: db.merchants,
      merchantUsers: db.merchantUsers,
      paymentsByMerchant: db.paymentsByMerchant,
      invoicesByMerchant: db.invoicesByMerchant,
      partnerOrders: db.partnerOrders,
      strategyConfigs: db.strategyConfigs,
      strategyChats: db.strategyChats,
      allianceConfigs: db.allianceConfigs,
      phoneLoginCodes: db.phoneLoginCodes,
      socialAuth: db.socialAuth,
      contractApplications: db.contractApplications,
      tenantPolicies: db.tenantPolicies,
      tenantMigrations: db.tenantMigrations,
      tenantRouteFiles: db.tenantRouteFiles,
      idempotencyRecords: db.idempotencyRecords,
      ledger: db.ledger,
      auditLogs: db.auditLogs,
      campaigns: db.campaigns,
      proposals: db.proposals
    }),
    getMerchantUser: (merchantId, userId) => {
      const users = db.merchantUsers[merchantId];
      if (!users) {
        return null;
      }
      return users[userId] || null;
    },
    getPayment: (merchantId, paymentTxnId) => {
      const payments = db.paymentsByMerchant[merchantId];
      if (!payments) {
        return null;
      }
      return payments[paymentTxnId] || null;
    },
    setPayment: (merchantId, paymentTxnId, payment) => {
      if (!db.paymentsByMerchant[merchantId]) {
        db.paymentsByMerchant[merchantId] = {};
      }
      db.paymentsByMerchant[merchantId][paymentTxnId] = payment;
    },
    getIdempotencyEntry: (key) => db.idempotencyMap.get(String(key || "")),
    setIdempotencyEntry: (key, value) => {
      const normalizedKey = String(key || "");
      if (!normalizedKey) {
        return;
      }
      db.idempotencyMap.set(normalizedKey, value);
      db.idempotencyRecords[normalizedKey] = value;
    },
    getInvoice: (merchantId, invoiceNo) => {
      const invoices = db.invoicesByMerchant[merchantId];
      if (!invoices) {
        return null;
      }
      return invoices[invoiceNo] || null;
    },
    setInvoice: (merchantId, invoiceNo, invoice) => {
      if (!db.invoicesByMerchant[merchantId]) {
        db.invoicesByMerchant[merchantId] = {};
      }
      db.invoicesByMerchant[merchantId][invoiceNo] = invoice;
    },
    appendAuditLog: ({ merchantId, action, status, role, operatorId, details = {} }) => {
      const log = {
        auditId: db.nextAuditId(),
        timestamp: new Date().toISOString(),
        merchantId,
        action,
        status,
        role: role || "UNKNOWN",
        operatorId: operatorId || "unknown",
        details
      };
      db.auditLogs.push(log);
      return log;
    }
  };

  db.nextLedgerId = createIdGenerator("txn", db.idCounters, "ledger");
  db.nextAuditId = createIdGenerator("audit", db.idCounters, "audit");
  return db;
}

module.exports = {
  createDefaultState,
  createInMemoryDb
};
