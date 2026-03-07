const { ensurePolicyOsState } = require("../policyos/state");

const AUTOMATION_VERSION = "S100-SRV-01.v1";
const SUPPORTED_EVENTS = new Set(["USER_ENTER_SHOP", "PAYMENT_VERIFY"]);

function toString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

function createAutomationService(db, { policyOsService = null } = {}) {
  if (!db) {
    throw new Error("db is required");
  }
  if (!policyOsService || typeof policyOsService.listDecisions !== "function") {
    throw new Error("policyOsService is required");
  }

  function assertMerchant(merchantId) {
    const safeMerchantId = toString(merchantId);
    if (!safeMerchantId) {
      throw new Error("merchantId is required");
    }
    ensurePolicyOsState(db);
    if (!db.merchants || !db.merchants[safeMerchantId]) {
      throw new Error("merchant not found");
    }
    return safeMerchantId;
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
    listExecutions
  };
}

module.exports = {
  createAutomationService
};
