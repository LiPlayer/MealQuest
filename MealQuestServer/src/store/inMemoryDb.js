function createDefaultState(now = new Date()) {
  return {
    idCounters: {
      ledger: 0,
      audit: 0
    },
    merchants: {
      m_demo: {
        merchantId: "m_demo",
        name: "Demo Merchant",
        killSwitchEnabled: false,
        budgetCap: 300,
        budgetUsed: 0,
        staff: [
          { uid: "staff_owner", role: "OWNER" },
          { uid: "staff_manager", role: "MANAGER" },
          { uid: "staff_clerk", role: "CLERK" }
        ]
      },
      m_bistro: {
        merchantId: "m_bistro",
        name: "Bistro Harbor",
        killSwitchEnabled: false,
        budgetCap: 220,
        budgetUsed: 0,
        staff: [
          { uid: "staff_owner", role: "OWNER" },
          { uid: "staff_manager", role: "MANAGER" },
          { uid: "staff_clerk", role: "CLERK" }
        ]
      }
    },
    merchantUsers: {
      m_demo: {
        u_demo: {
          uid: "u_demo",
          displayName: "Demo User",
          wallet: {
            principal: 120,
            bonus: 36,
            silver: 88
          },
          tags: ["REGULAR", "SPICY_LOVER"],
          fragments: {
            spicy: 2,
            noodle: 3
          },
          vouchers: [
            {
              id: "voucher_soon",
              type: "ITEM_WARRANT",
              name: "Noodle Voucher",
              value: 18,
              minSpend: 0,
              status: "ACTIVE",
              expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
            },
            {
              id: "voucher_big",
              type: "NO_THRESHOLD_VOUCHER",
              name: "No Threshold Voucher",
              value: 30,
              minSpend: 20,
              status: "ACTIVE",
              expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
            }
          ]
        },
        u_friend: {
          uid: "u_friend",
          displayName: "Demo Friend",
          wallet: {
            principal: 40,
            bonus: 8,
            silver: 52
          },
          tags: ["REGULAR"],
          fragments: {
            spicy: 0,
            noodle: 1
          },
          vouchers: []
        }
      },
      m_bistro: {
        u_demo: {
          uid: "u_demo",
          displayName: "Demo User",
          wallet: {
            principal: 80,
            bonus: 12,
            silver: 36
          },
          tags: ["REGULAR"],
          fragments: {
            spicy: 1,
            noodle: 1
          },
          vouchers: [
            {
              id: "bistro_voucher_soon",
              type: "ITEM_WARRANT",
              name: "Soup Voucher",
              value: 10,
              minSpend: 0,
              status: "ACTIVE",
              expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
            }
          ]
        }
      }
    },
    paymentsByMerchant: {
      m_demo: {},
      m_bistro: {}
    },
    invoicesByMerchant: {
      m_demo: {},
      m_bistro: {}
    },
    partnerOrders: {
      partner_coffee: {
        ext_order_1001: {
          partnerId: "partner_coffee",
          orderId: "ext_order_1001",
          amount: 38,
          status: "PAID",
          paidAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString()
        }
      }
    },
    strategyConfigs: {
      m_demo: {
        activation_contextual_drop: {
          templateId: "activation_contextual_drop",
          branchId: "COMFORT",
          status: "ACTIVE",
          lastProposalId: "proposal_rainy",
          lastCampaignId: "campaign_rainy_hot_soup",
          updatedAt: now.toISOString()
        }
      },
      m_bistro: {}
    },
    allianceConfigs: {
      m_demo: {
        merchantId: "m_demo",
        clusterId: "cluster_demo_brand",
        stores: ["m_demo", "m_bistro"],
        walletShared: false,
        tierShared: false,
        updatedAt: now.toISOString()
      },
      m_bistro: {
        merchantId: "m_bistro",
        clusterId: "cluster_demo_brand",
        stores: ["m_demo", "m_bistro"],
        walletShared: false,
        tierShared: false,
        updatedAt: now.toISOString()
      }
    },
    socialRedPacketsByMerchant: {
      m_demo: {},
      m_bistro: {}
    },
    groupTreatSessionsByMerchant: {
      m_demo: {},
      m_bistro: {}
    },
    merchantDailySubsidyUsage: {
      m_demo: {},
      m_bistro: {}
    },
    socialTransferLogs: [],
    phoneLoginCodes: {},
    contractApplications: {},
    tenantPolicies: {},
    tenantMigrations: {},
    tenantRouteFiles: {},
    ledger: [],
    auditLogs: [],
    campaigns: [
      {
        id: "campaign_welcome",
        merchantId: "m_demo",
        name: "Welcome Campaign",
        status: "ACTIVE",
        priority: 20,
        trigger: { event: "USER_ENTER_SHOP" },
        conditions: [{ field: "isNewUser", op: "eq", value: true }],
        budget: {
          used: 0,
          cap: 80,
          costPerHit: 8
        },
        action: {
          type: "STORY_CARD",
          story: {
            templateId: "tpl_welcome",
            narrative: "Welcome and claim your first voucher.",
            assets: [{ kind: "voucher", id: "voucher_welcome_noodle" }],
            triggers: ["tap_claim"]
          }
        }
      }
    ],
    proposals: [
      {
        id: "proposal_rainy",
        merchantId: "m_demo",
        status: "PENDING",
        title: "Rainy Day Promotion",
        createdAt: now.toISOString(),
        suggestedCampaign: {
          id: "campaign_rainy_hot_soup",
          merchantId: "m_demo",
          name: "Rainy Hot Soup Campaign",
          status: "ACTIVE",
          priority: 90,
          trigger: { event: "WEATHER_CHANGE" },
          conditions: [{ field: "weather", op: "eq", value: "RAIN" }],
          budget: {
            used: 0,
            cap: 60,
            costPerHit: 12
          },
          action: {
            type: "STORY_CARD",
            story: {
              templateId: "tpl_rain",
              narrative: "A warm soup for rainy days.",
              assets: [{ kind: "voucher", id: "voucher_hot_soup" }],
              triggers: ["tap_pay"]
            }
          },
          ttlUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()
        }
      }
    ]
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
    next.merchantUsers.m_demo = next.users;
  }

  if (!next.paymentsByMerchant || typeof next.paymentsByMerchant !== "object") {
    next.paymentsByMerchant = {};
  }
  if (next.payments && Object.keys(next.paymentsByMerchant).length === 0) {
    for (const [paymentTxnId, payment] of Object.entries(next.payments)) {
      const merchantId = payment && payment.merchantId ? payment.merchantId : "m_demo";
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
  if (!next.allianceConfigs || typeof next.allianceConfigs !== "object") {
    next.allianceConfigs = {};
  }
  if (
    !next.socialRedPacketsByMerchant ||
    typeof next.socialRedPacketsByMerchant !== "object"
  ) {
    next.socialRedPacketsByMerchant = {};
  }
  if (
    !next.groupTreatSessionsByMerchant ||
    typeof next.groupTreatSessionsByMerchant !== "object"
  ) {
    next.groupTreatSessionsByMerchant = {};
  }
  if (
    !next.merchantDailySubsidyUsage ||
    typeof next.merchantDailySubsidyUsage !== "object"
  ) {
    next.merchantDailySubsidyUsage = {};
  }
  if (!Array.isArray(next.socialTransferLogs)) {
    next.socialTransferLogs = [];
  }
  if (!next.phoneLoginCodes || typeof next.phoneLoginCodes !== "object") {
    next.phoneLoginCodes = {};
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
    if (!state.socialRedPacketsByMerchant[merchantId]) {
      state.socialRedPacketsByMerchant[merchantId] = {};
    }
    if (!state.groupTreatSessionsByMerchant[merchantId]) {
      state.groupTreatSessionsByMerchant[merchantId] = {};
    }
    if (!state.merchantDailySubsidyUsage[merchantId]) {
      state.merchantDailySubsidyUsage[merchantId] = {};
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
    allianceConfigs: {
      ...defaults.allianceConfigs,
      ...(migrated.allianceConfigs || {})
    },
    socialRedPacketsByMerchant: {
      ...defaults.socialRedPacketsByMerchant,
      ...(migrated.socialRedPacketsByMerchant || {})
    },
    groupTreatSessionsByMerchant: {
      ...defaults.groupTreatSessionsByMerchant,
      ...(migrated.groupTreatSessionsByMerchant || {})
    },
    merchantDailySubsidyUsage: {
      ...defaults.merchantDailySubsidyUsage,
      ...(migrated.merchantDailySubsidyUsage || {})
    },
    socialTransferLogs: Array.isArray(migrated.socialTransferLogs)
      ? migrated.socialTransferLogs
      : defaults.socialTransferLogs,
    phoneLoginCodes: {
      ...defaults.phoneLoginCodes,
      ...(migrated.phoneLoginCodes || {})
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
    ledger: Array.isArray(migrated.ledger) ? migrated.ledger : defaults.ledger,
    auditLogs: Array.isArray(migrated.auditLogs)
      ? migrated.auditLogs
      : defaults.auditLogs,
    campaigns: Array.isArray(migrated.campaigns) ? migrated.campaigns : defaults.campaigns,
    proposals: Array.isArray(migrated.proposals) ? migrated.proposals : defaults.proposals
  };
  ensureMerchantBuckets(normalized);
  return normalized;
}

function createInMemoryDb(initialState = null) {
  const state = normalizeState(initialState);
  const db = {
    ...state,
    idempotencyMap: new Map(),
    save: () => {},
    serialize: () => ({
      idCounters: { ...db.idCounters },
      merchants: db.merchants,
      merchantUsers: db.merchantUsers,
      paymentsByMerchant: db.paymentsByMerchant,
      invoicesByMerchant: db.invoicesByMerchant,
      partnerOrders: db.partnerOrders,
      strategyConfigs: db.strategyConfigs,
      allianceConfigs: db.allianceConfigs,
      socialRedPacketsByMerchant: db.socialRedPacketsByMerchant,
      groupTreatSessionsByMerchant: db.groupTreatSessionsByMerchant,
      merchantDailySubsidyUsage: db.merchantDailySubsidyUsage,
      socialTransferLogs: db.socialTransferLogs,
      phoneLoginCodes: db.phoneLoginCodes,
      contractApplications: db.contractApplications,
      tenantPolicies: db.tenantPolicies,
      tenantMigrations: db.tenantMigrations,
      tenantRouteFiles: db.tenantRouteFiles,
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
