const { createSchemaRegistry } = require("./schemaRegistry");
const { createPolicyRegistry } = require("./policyRegistry");
const { createPluginRegistry } = require("./pluginRegistry");
const { createPolicyLedgerService } = require("./ledgerService");
const { createDecisionService } = require("./decisionService");
const { createPolicyRuntimeExecutor } = require("./adapters/policyRuntimeExecutor");
const { createApprovalTokenService } = require("./approvalTokenService");
const { registerDefaultPlugins } = require("./plugins/defaultPlugins");
const { createWsDispatcher } = require("./wsDispatcher");
const { ensurePolicyOsState } = require("./state");

function createPolicyOsService(db, { wsHub = null, metrics = null, now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
  }
  ensurePolicyOsState(db);
  const schemaRegistry = createSchemaRegistry();
  const approvalTokenService = createApprovalTokenService();
  const policyRegistry = createPolicyRegistry({
    db,
    schemaRegistry,
    approvalTokenService,
    now
  });
  const pluginRegistry = createPluginRegistry();
  const ledgerService = createPolicyLedgerService(db);
  registerDefaultPlugins({
    pluginRegistry,
    db,
    ledgerService,
    now
  });
  const executionAdapter = createPolicyRuntimeExecutor({
    pluginRegistry
  });
  const decisionService = createDecisionService({
    policyRegistry,
    pluginRegistry,
    executionAdapter,
    approvalTokenService,
    now,
    metrics
  });
  const wsDispatcher = createWsDispatcher({
    db,
    wsHub,
    now
  });

  function resolveMerchantAndUser(merchantId, userId = "") {
    const merchant = db.merchants && db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    let user = null;
    if (userId) {
      if (typeof db.getMerchantUser === "function") {
        user = db.getMerchantUser(merchantId, userId);
      } else {
        user = db.merchantUsers && db.merchantUsers[merchantId] && db.merchantUsers[merchantId][userId];
      }
      if (!user) {
        throw new Error("user not found");
      }
    }
    return {
      merchant,
      user
    };
  }

  async function evaluateDecision({
    merchantId,
    userId = "",
    event,
    context = {},
    approvalToken,
    eventId = ""
  }) {
    const { merchant, user } = resolveMerchantAndUser(merchantId, userId);
    const decision = await decisionService.evaluateEvent({
      merchantId,
      event,
      eventId,
      context: {
        ...context,
        merchant
      },
      user,
      approvalToken
    });
    await wsDispatcher.dispatch({
      merchantId,
      event: "POLICYOS_DECISION",
      payload: {
        decisionId: decision.decision_id,
        traceId: decision.trace_id,
        executed: decision.executed
      },
      messageId: decision.decision_id
    });
    return decision;
  }

  function appendBehaviorLog({ merchantId, userId = "", category, payload }) {
    const state = ensurePolicyOsState(db);
    state.compliance.behaviorLogs.push({
      id: `behavior_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      merchantId,
      userId: userId || "",
      category: String(category || "GENERAL"),
      payload: payload || {},
      createdAt: new Date(now()).toISOString(),
      anonymized: false
    });
    db.save();
  }

  function runRetentionJobs({
    behaviorRetentionDays = 180,
    transactionRetentionDays = 365 * 3
  } = {}) {
    const state = ensurePolicyOsState(db);
    const nowMs = now();
    const behaviorCutoff = nowMs - Math.max(1, behaviorRetentionDays) * 24 * 60 * 60 * 1000;
    const txnCutoff = nowMs - Math.max(1, transactionRetentionDays) * 24 * 60 * 60 * 1000;

    let anonymizedCount = 0;
    for (const row of state.compliance.behaviorLogs) {
      const createdAtMs = Date.parse(String(row.createdAt || ""));
      if (!Number.isFinite(createdAtMs) || createdAtMs > behaviorCutoff || row.anonymized) {
        continue;
      }
      row.userId = "";
      row.payload = {
        ...row.payload,
        anonymized: true
      };
      row.anonymized = true;
      anonymizedCount += 1;
    }

    const beforeLedger = Array.isArray(db.ledger) ? db.ledger.length : 0;
    if (Array.isArray(db.ledger)) {
      db.ledger = db.ledger.filter((row) => {
        const ts = Date.parse(String(row.createdAt || ""));
        return !Number.isFinite(ts) || ts >= txnCutoff;
      });
    }
    const afterLedger = Array.isArray(db.ledger) ? db.ledger.length : 0;
    const deletedTransactions = Math.max(0, beforeLedger - afterLedger);
    db.save();
    return {
      anonymizedCount,
      deletedTransactions
    };
  }

  return {
    getSchemas: schemaRegistry.listSchemas,
    listPlugins: () => ({
      triggers: pluginRegistry.list("trigger"),
      segments: pluginRegistry.list("segment"),
      constraints: pluginRegistry.list("constraint"),
      scorers: pluginRegistry.list("scorer"),
      actions: pluginRegistry.list("action")
    }),
    createDraft: policyRegistry.createDraft,
    submitDraft: policyRegistry.submitDraft,
    approveDraft: policyRegistry.approveDraft,
    publishDraft: policyRegistry.publishDraft,
    listDrafts: policyRegistry.listDrafts,
    listPolicies: policyRegistry.listPolicies,
    listActivePolicies: policyRegistry.listActivePolicies,
    evaluateDecision,
    getDecisionExplain: decisionService.getDecisionExplain,
    appendBehaviorLog,
    runRetentionJobs,
    reconcileLedger: ledgerService.reconcileMerchant
  };
}

module.exports = {
  createPolicyOsService
};
