const { ensurePolicyOsState } = require("../policyos/state");

const AUTOMATION_VERSION = "S100-SRV-01.v1";
const SUPPORTED_EVENTS = new Set(["USER_ENTER_SHOP", "PAYMENT_VERIFY"]);
const DEFAULT_RULES = [
  {
    ruleId: "AUTO_USER_ENTER_SHOP",
    event: "USER_ENTER_SHOP",
    enabled: true,
    description: "顾客入店时自动触发策略执行"
  },
  {
    ruleId: "AUTO_PAYMENT_VERIFY",
    event: "PAYMENT_VERIFY",
    enabled: true,
    description: "支付核销后自动触发策略执行"
  }
];

function toString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return Math.floor(num);
}

function toOutcome(decision) {
  const executed = Array.isArray(decision && decision.executed) ? decision.executed : [];
  const rejected = Array.isArray(decision && decision.rejected) ? decision.rejected : [];
  if (executed.length > 0) {
    return "HIT";
  }
  if (rejected.length > 0) {
    return "BLOCKED";
  }
  return "NO_POLICY";
}

function isAutomationDecision(decision = {}) {
  const event = toString(decision.event).toUpperCase();
  const eventId = toString(decision.event_id || decision.eventId);
  if (event === "USER_ENTER_SHOP") {
    return eventId.startsWith("user_enter_shop:");
  }
  if (event === "PAYMENT_VERIFY") {
    return eventId.startsWith("evt_payment_verify_");
  }
  return false;
}

function normalizeRule(item, index = 0) {
  const event = toString(item && item.event).toUpperCase();
  if (!SUPPORTED_EVENTS.has(event)) {
    throw new Error(`unsupported automation event: ${event || "UNKNOWN"}`);
  }
  return {
    ruleId: toString(item && item.ruleId, `AUTO_${event}_${index + 1}`),
    event,
    enabled: toBoolean(item && item.enabled, true),
    description: toString(item && item.description, "")
  };
}

function buildDefaultConfig(merchantId) {
  return {
    version: AUTOMATION_VERSION,
    merchantId,
    enabled: true,
    rules: DEFAULT_RULES.map((item) => ({ ...item })),
    updatedAt: null,
    updatedBy: null
  };
}

function createAutomationService(db, { policyOsService = null, now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
  }
  if (!policyOsService || typeof policyOsService.listDecisions !== "function") {
    throw new Error("policyOsService is required");
  }

  function ensureAutomationState() {
    const policyOs = ensurePolicyOsState(db);
    policyOs.automation = policyOs.automation && typeof policyOs.automation === "object" ? policyOs.automation : {};
    policyOs.automation.configByMerchant =
      policyOs.automation.configByMerchant && typeof policyOs.automation.configByMerchant === "object"
        ? policyOs.automation.configByMerchant
        : {};
    return policyOs.automation;
  }

  function assertMerchant(merchantId) {
    const safeMerchantId = toString(merchantId);
    if (!safeMerchantId) {
      throw new Error("merchantId is required");
    }
    if (!db.merchants || !db.merchants[safeMerchantId]) {
      throw new Error("merchant not found");
    }
    return safeMerchantId;
  }

  function getAutomationConfig({ merchantId }) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureAutomationState();
    const saved = state.configByMerchant[safeMerchantId];
    if (!saved || typeof saved !== "object") {
      return buildDefaultConfig(safeMerchantId);
    }
    const rulesRaw = Array.isArray(saved.rules) ? saved.rules : [];
    const rules = rulesRaw.map((item, index) => normalizeRule(item, index));
    return {
      version: AUTOMATION_VERSION,
      merchantId: safeMerchantId,
      enabled: toBoolean(saved.enabled, true),
      rules,
      updatedAt: toString(saved.updatedAt) || null,
      updatedBy: toString(saved.updatedBy) || null
    };
  }

  function setAutomationConfig({ merchantId, operatorId = "", config = {} }) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureAutomationState();
    const previous = getAutomationConfig({ merchantId: safeMerchantId });
    const patch = config && typeof config === "object" ? config : {};
    const nextEnabled = Object.prototype.hasOwnProperty.call(patch, "enabled")
      ? toBoolean(patch.enabled, previous.enabled)
      : previous.enabled;
    const nextRules = Object.prototype.hasOwnProperty.call(patch, "rules")
      ? (Array.isArray(patch.rules) ? patch.rules : []).map((item, index) => normalizeRule(item, index))
      : previous.rules;
    if (nextRules.length === 0) {
      throw new Error("automation rules cannot be empty");
    }
    const persisted = {
      version: AUTOMATION_VERSION,
      merchantId: safeMerchantId,
      enabled: nextEnabled,
      rules: nextRules,
      updatedAt: new Date(now()).toISOString(),
      updatedBy: toString(operatorId, "system")
    };
    state.configByMerchant[safeMerchantId] = persisted;
    db.save();
    return persisted;
  }

  function isEventEnabled({ merchantId, event }) {
    const config = getAutomationConfig({ merchantId });
    const safeEvent = toString(event).toUpperCase();
    if (!config.enabled) {
      return {
        allowed: false,
        reasonCode: "AUTOMATION_DISABLED"
      };
    }
    const relatedRules = config.rules.filter((item) => item.event === safeEvent);
    if (relatedRules.length === 0) {
      return {
        allowed: false,
        reasonCode: "AUTOMATION_RULE_NOT_FOUND"
      };
    }
    if (relatedRules.every((item) => item.enabled === false)) {
      return {
        allowed: false,
        reasonCode: "AUTOMATION_RULE_DISABLED"
      };
    }
    return {
      allowed: true,
      reasonCode: ""
    };
  }

  function listExecutions({ merchantId, event = "", outcome = "ALL", limit = 20 }) {
    const safeMerchantId = assertMerchant(merchantId);
    const normalizedEvent = toString(event).toUpperCase();
    if (normalizedEvent && !SUPPORTED_EVENTS.has(normalizedEvent)) {
      throw new Error("invalid event");
    }
    const normalizedOutcome = toString(outcome, "ALL").toUpperCase() || "ALL";
    if (!["ALL", "HIT", "BLOCKED", "NO_POLICY"].includes(normalizedOutcome)) {
      throw new Error("invalid outcome");
    }
    const safeLimit = Math.min(Math.max(toPositiveInt(limit, 20), 1), 100);
    const decisions = policyOsService.listDecisions({
      merchantId: safeMerchantId,
      event: normalizedEvent || "",
      mode: "EXECUTE",
      limit: 600
    });
    const items = decisions
      .filter((item) => isAutomationDecision(item))
      .map((item) => {
        const resolvedOutcome = toOutcome(item);
        return {
          decisionId: toString(item.decision_id),
          traceId: toString(item.trace_id),
          event: toString(item.event).toUpperCase(),
          outcome: resolvedOutcome,
          reasonCodes: Array.from(
            new Set(
              (Array.isArray(item.rejected) ? item.rejected : [])
                .map((row) => toString(row && row.reason))
                .filter(Boolean)
            )
          ),
          executedCount: Array.isArray(item.executed) ? item.executed.length : 0,
          createdAt: toString(item.created_at),
          userId: toString(item.user_id) || null
        };
      })
      .filter((item) => (normalizedOutcome === "ALL" ? true : item.outcome === normalizedOutcome))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    const sliced = items.slice(0, safeLimit);
    return {
      version: AUTOMATION_VERSION,
      merchantId: safeMerchantId,
      event: normalizedEvent || "ALL",
      outcome: normalizedOutcome,
      items: sliced,
      pageInfo: {
        limit: safeLimit,
        returned: sliced.length,
        total: items.length
      },
      lastUpdatedAt: sliced.length > 0 ? sliced[0].createdAt : null
    };
  }

  return {
    getAutomationConfig,
    setAutomationConfig,
    isEventEnabled,
    listExecutions
  };
}

module.exports = {
  createAutomationService
};
