const crypto = require("node:crypto");

const { ensurePolicyOsState } = require("../policyos/state");

const EXPERIMENT_VERSION = "S110-SRV-01.v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_EXPERIMENT_ID = "exp_main";
const SUPPORTED_EVENTS = new Set(["USER_ENTER_SHOP", "PAYMENT_VERIFY"]);
const SUPPORTED_OPTIMIZATION_MODES = new Set(["MANUAL"]);

const DEFAULT_GUARDRAILS = {
  minPaymentSuccessRate30: 0.995,
  maxRiskLossProxy30: 0.003,
  maxSubsidyWasteProxy: 0.6
};

function toString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function safeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function clamp(value, min, max) {
  const safe = toFiniteNumber(value, min);
  if (safe < min) {
    return min;
  }
  if (safe > max) {
    return max;
  }
  return safe;
}

function roundMoney(value) {
  return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

function roundRate(value) {
  return Math.round(toFiniteNumber(value, 0) * 10000) / 10000;
}

function toTimestampMs(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function toSafeWindowDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WINDOW_DAYS;
  }
  return Math.min(90, Math.max(7, Math.floor(parsed)));
}

function normalizeTrafficPercent(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.min(100, Math.max(0, Math.floor(fallback)));
  }
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

function normalizeEvent(value, fallback = "USER_ENTER_SHOP") {
  const event = safeUpper(value || fallback);
  if (!SUPPORTED_EVENTS.has(event)) {
    return fallback;
  }
  return event;
}

function normalizeOptimizationMode(value, fallback = "MANUAL") {
  const mode = safeUpper(value || fallback);
  if (!SUPPORTED_OPTIMIZATION_MODES.has(mode)) {
    return fallback;
  }
  return mode;
}

function resolveDecisionOutcome(decision = {}) {
  const executed = Array.isArray(decision.executed) ? decision.executed : [];
  const rejected = Array.isArray(decision.rejected) ? decision.rejected : [];
  if (executed.length > 0) {
    return "HIT";
  }
  if (rejected.length > 0) {
    return "BLOCKED";
  }
  return "NO_POLICY";
}

function extractDecisionCost(decision = {}) {
  const executedSet = new Set(
    (Array.isArray(decision.executed) ? decision.executed : []).map((item) => String(item || ""))
  );
  let cost = 0;
  for (const item of Array.isArray(decision.projected) ? decision.projected : []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const policyId = String(item.policy_id || "");
    if (!policyId || !executedSet.has(policyId)) {
      continue;
    }
    cost += toFiniteNumber(item.estimated_cost, 0);
  }
  return roundMoney(cost);
}

function computeRelativeLift(treatmentValue, controlValue) {
  const treatment = toFiniteNumber(treatmentValue, 0);
  const control = toFiniteNumber(controlValue, 0);
  if (Math.abs(control) < 0.0001) {
    if (Math.abs(treatment) < 0.0001) {
      return 0;
    }
    return treatment > 0 ? 1 : -1;
  }
  return (treatment - control) / Math.abs(control);
}

function createDefaultConfig(merchantId) {
  return {
    version: EXPERIMENT_VERSION,
    merchantId,
    experimentId: DEFAULT_EXPERIMENT_ID,
    enabled: false,
    trafficPercent: 20,
    targetEvent: "USER_ENTER_SHOP",
    optimizationMode: "MANUAL",
    objective: "MERCHANT_LONG_TERM_VALUE_30D",
    primaryMetrics: [
      "MerchantRevenueUplift30",
      "MerchantProfitUplift30",
      "UpliftHitRate30"
    ],
    ownerControl: {
      canAdjustTraffic: true,
      canPause: true,
      canRollback: true
    },
    guardrails: {
      ...DEFAULT_GUARDRAILS
    },
    status: "DRAFT",
    updatedAt: null,
    updatedBy: null,
    lastRollbackAt: null,
    lastRollbackBy: null,
    lastRollbackReason: null
  };
}

function createGroupAccumulator() {
  return {
    decisionCount: 0,
    hitCount: 0,
    blockedCount: 0,
    noPolicyCount: 0,
    marketingCost: 0,
    paymentAttempts: 0,
    paymentPaidCount: 0,
    paymentFailedCount: 0,
    paymentPendingCount: 0,
    revenue: 0,
    refundAmount: 0
  };
}

function finalizeAccumulator(row = {}) {
  const decisionCount = Number(row.decisionCount || 0);
  const hitCount = Number(row.hitCount || 0);
  const blockedCount = Number(row.blockedCount || 0);
  const noPolicyCount = Number(row.noPolicyCount || 0);
  const paymentAttempts = Number(row.paymentAttempts || 0);
  const paymentPaidCount = Number(row.paymentPaidCount || 0);
  const paymentFailedCount = Number(row.paymentFailedCount || 0);
  const paymentPendingCount = Number(row.paymentPendingCount || 0);
  const hitRateDenominator = hitCount + blockedCount;
  const paymentSuccessDenominator = paymentPaidCount + paymentFailedCount;
  const revenue = roundMoney(row.revenue || 0);
  const refundAmount = roundMoney(row.refundAmount || 0);
  const netRevenue = roundMoney(revenue - refundAmount);
  const marketingCost = roundMoney(row.marketingCost || 0);
  return {
    decisionCount,
    hitCount,
    blockedCount,
    noPolicyCount,
    hitRate: hitRateDenominator > 0 ? roundRate(hitCount / hitRateDenominator) : 0,
    marketingCost,
    paymentAttempts,
    paymentPaidCount,
    paymentFailedCount,
    paymentPendingCount,
    paymentSuccessRate:
      paymentSuccessDenominator > 0 ? roundRate(paymentPaidCount / paymentSuccessDenominator) : 0,
    revenue,
    refundAmount,
    netRevenue,
    netProfitProxy: roundMoney(netRevenue - marketingCost)
  };
}

function resolveLatestEvaluatedAt(candidates = []) {
  let latestMs = 0;
  for (const value of candidates) {
    const ts = toTimestampMs(value);
    if (ts > latestMs) {
      latestMs = ts;
    }
  }
  if (latestMs <= 0) {
    return "1970-01-01T00:00:00.000Z";
  }
  return new Date(latestMs).toISOString();
}

function createExperimentService(db, { releaseGateService = null, now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
  }

  function ensureExperimentState() {
    const policyOs = ensurePolicyOsState(db);
    policyOs.experiments =
      policyOs.experiments && typeof policyOs.experiments === "object" ? policyOs.experiments : {};
    policyOs.experiments.configByMerchant =
      policyOs.experiments.configByMerchant &&
      typeof policyOs.experiments.configByMerchant === "object"
        ? policyOs.experiments.configByMerchant
        : {};
    policyOs.experiments.rollbackHistoryByMerchant =
      policyOs.experiments.rollbackHistoryByMerchant &&
      typeof policyOs.experiments.rollbackHistoryByMerchant === "object"
        ? policyOs.experiments.rollbackHistoryByMerchant
        : {};
    return policyOs.experiments;
  }

  function assertMerchant(merchantId) {
    const safeMerchantId = toString(merchantId);
    if (!safeMerchantId) {
      const error = new Error("merchantId is required");
      error.statusCode = 400;
      throw error;
    }
    if (!db.merchants || !db.merchants[safeMerchantId]) {
      const error = new Error("merchant not found");
      error.statusCode = 404;
      throw error;
    }
    return safeMerchantId;
  }

  function getConfig({ merchantId }) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureExperimentState();
    const defaults = createDefaultConfig(safeMerchantId);
    const saved = state.configByMerchant[safeMerchantId];
    if (!saved || typeof saved !== "object") {
      return defaults;
    }
    const next = {
      ...defaults,
      ...saved
    };
    next.version = EXPERIMENT_VERSION;
    next.merchantId = safeMerchantId;
    next.experimentId = toString(next.experimentId, DEFAULT_EXPERIMENT_ID);
    next.enabled = toBoolean(next.enabled, false);
    next.trafficPercent = normalizeTrafficPercent(next.trafficPercent, 20);
    next.targetEvent = normalizeEvent(next.targetEvent, "USER_ENTER_SHOP");
    next.optimizationMode = normalizeOptimizationMode(next.optimizationMode, "MANUAL");
    next.guardrails = {
      minPaymentSuccessRate30: clamp(
        toFiniteNumber(
          next.guardrails && next.guardrails.minPaymentSuccessRate30,
          DEFAULT_GUARDRAILS.minPaymentSuccessRate30
        ),
        0,
        1
      ),
      maxRiskLossProxy30: clamp(
        toFiniteNumber(
          next.guardrails && next.guardrails.maxRiskLossProxy30,
          DEFAULT_GUARDRAILS.maxRiskLossProxy30
        ),
        0,
        1
      ),
      maxSubsidyWasteProxy: clamp(
        toFiniteNumber(
          next.guardrails && next.guardrails.maxSubsidyWasteProxy,
          DEFAULT_GUARDRAILS.maxSubsidyWasteProxy
        ),
        0,
        1
      )
    };
    next.status =
      safeUpper(next.status) || (next.enabled && next.trafficPercent > 0 ? "RUNNING" : "PAUSED");
    return next;
  }

  function setConfig({ merchantId, operatorId = "", config = {} }) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureExperimentState();
    const previous = getConfig({ merchantId: safeMerchantId });
    const patch = config && typeof config === "object" ? config : {};
    const next = {
      ...previous
    };
    if (Object.prototype.hasOwnProperty.call(patch, "experimentId")) {
      next.experimentId = toString(patch.experimentId, previous.experimentId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      next.enabled = toBoolean(patch.enabled, previous.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "trafficPercent")) {
      next.trafficPercent = normalizeTrafficPercent(patch.trafficPercent, previous.trafficPercent);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "targetEvent")) {
      next.targetEvent = normalizeEvent(patch.targetEvent, previous.targetEvent);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "optimizationMode")) {
      next.optimizationMode = normalizeOptimizationMode(
        patch.optimizationMode,
        previous.optimizationMode
      );
    }
    if (patch.guardrails && typeof patch.guardrails === "object") {
      next.guardrails = {
        ...previous.guardrails,
        ...(Object.prototype.hasOwnProperty.call(patch.guardrails, "minPaymentSuccessRate30")
          ? {
              minPaymentSuccessRate30: clamp(
                toFiniteNumber(
                  patch.guardrails.minPaymentSuccessRate30,
                  previous.guardrails.minPaymentSuccessRate30
                ),
                0,
                1
              )
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch.guardrails, "maxRiskLossProxy30")
          ? {
              maxRiskLossProxy30: clamp(
                toFiniteNumber(
                  patch.guardrails.maxRiskLossProxy30,
                  previous.guardrails.maxRiskLossProxy30
                ),
                0,
                1
              )
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch.guardrails, "maxSubsidyWasteProxy")
          ? {
              maxSubsidyWasteProxy: clamp(
                toFiniteNumber(
                  patch.guardrails.maxSubsidyWasteProxy,
                  previous.guardrails.maxSubsidyWasteProxy
                ),
                0,
                1
              )
            }
          : {})
      };
    }
    next.status = next.enabled && next.trafficPercent > 0 ? "RUNNING" : "PAUSED";
    next.updatedAt = new Date(now()).toISOString();
    next.updatedBy = toString(operatorId, "system");
    state.configByMerchant[safeMerchantId] = next;
    db.save();
    return next;
  }

  function resolveVariant({ merchantId, experimentId, userId = "", eventId = "", trafficPercent = 0 }) {
    const seed = `${merchantId}|${experimentId}|${toString(userId, toString(eventId, "anonymous"))}`;
    const hash = crypto.createHash("sha1").update(seed).digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;
    return bucket < trafficPercent ? "TREATMENT" : "CONTROL";
  }

  function resolveRiskStatus({ merchantId, windowDays, config }) {
    if (!releaseGateService || typeof releaseGateService.getReleaseGateSnapshot !== "function") {
      return {
        status: "UNKNOWN",
        reasons: ["RELEASE_GATE_UNAVAILABLE"],
        kpis: null
      };
    }
    let snapshot = null;
    try {
      snapshot = releaseGateService.getReleaseGateSnapshot({ merchantId, windowDays });
    } catch {
      return {
        status: "UNKNOWN",
        reasons: ["RELEASE_GATE_FETCH_FAILED"],
        kpis: null
      };
    }
    const kpis = snapshot && snapshot.kpis && typeof snapshot.kpis === "object" ? snapshot.kpis : {};
    const reasons = [];
    if (toFiniteNumber(kpis.paymentSuccessRate30, 0) < config.guardrails.minPaymentSuccessRate30) {
      reasons.push("PAYMENT_SUCCESS_RATE_GUARDRAIL_BREACHED");
    }
    if (toFiniteNumber(kpis.riskLossProxy30, 0) > config.guardrails.maxRiskLossProxy30) {
      reasons.push("RISK_LOSS_PROXY_GUARDRAIL_BREACHED");
    }
    if (toFiniteNumber(kpis.SubsidyWasteProxy, 0) > config.guardrails.maxSubsidyWasteProxy) {
      reasons.push("SUBSIDY_WASTE_GUARDRAIL_BREACHED");
    }
    return {
      status: reasons.length > 0 ? "FAIL" : "PASS",
      reasons,
      kpis: {
        paymentSuccessRate30: toFiniteNumber(kpis.paymentSuccessRate30, 0),
        riskLossProxy30: toFiniteNumber(kpis.riskLossProxy30, 0),
        subsidyWasteProxy: toFiniteNumber(kpis.SubsidyWasteProxy, 0)
      }
    };
  }

  function getSnapshot({ merchantId, windowDays = DEFAULT_WINDOW_DAYS, event = "" } = {}) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureExperimentState();
    const config = getConfig({ merchantId: safeMerchantId });
    const safeWindowDays = toSafeWindowDays(windowDays);
    const safeEvent = toString(event) ? normalizeEvent(event, config.targetEvent) : config.targetEvent;
    const nowMs = now();
    const startMs = nowMs - safeWindowDays * DAY_MS;
    const effectiveTrafficPercent = config.enabled ? config.trafficPercent : 0;

    const decisions = Object.values((db.policyOs && db.policyOs.decisions) || {})
      .filter((item) => item && item.merchant_id === safeMerchantId)
      .filter((item) => safeUpper(item.mode) === "EXECUTE")
      .filter((item) => safeUpper(item.event) === safeEvent)
      .filter((item) => {
        const ts = toTimestampMs(item.created_at || item.createdAt);
        return ts > 0 && ts >= startMs && ts <= nowMs;
      });
    const payments = Object.values((db.paymentsByMerchant && db.paymentsByMerchant[safeMerchantId]) || {})
      .filter((item) => item && typeof item === "object")
      .filter((item) => {
        const ts = toTimestampMs(item.createdAt || item.updatedAt);
        return ts > 0 && ts >= startMs && ts <= nowMs;
      });

    const groups = {
      CONTROL: createGroupAccumulator(),
      TREATMENT: createGroupAccumulator()
    };

    for (const item of decisions) {
      const variant = resolveVariant({
        merchantId: safeMerchantId,
        experimentId: config.experimentId,
        userId: toString(item.user_id),
        eventId: toString(item.event_id),
        trafficPercent: effectiveTrafficPercent
      });
      const group = groups[variant];
      group.decisionCount += 1;
      const outcome = resolveDecisionOutcome(item);
      if (outcome === "HIT") {
        group.hitCount += 1;
      } else if (outcome === "BLOCKED") {
        group.blockedCount += 1;
      } else {
        group.noPolicyCount += 1;
      }
      group.marketingCost = roundMoney(group.marketingCost + extractDecisionCost(item));
    }

    for (const payment of payments) {
      const variant = resolveVariant({
        merchantId: safeMerchantId,
        experimentId: config.experimentId,
        userId: toString(payment.userId),
        eventId: toString(payment.paymentTxnId),
        trafficPercent: effectiveTrafficPercent
      });
      const group = groups[variant];
      const status = safeUpper(payment.status);
      if (!["PAID", "EXTERNAL_FAILED", "PENDING_EXTERNAL"].includes(status)) {
        continue;
      }
      group.paymentAttempts += 1;
      if (status === "PAID") {
        const orderAmount = Math.max(0, roundMoney(payment.orderAmount));
        const refunded = Math.max(
          0,
          Math.min(orderAmount, roundMoney(payment.refundedAmount || payment.refundAmount || 0))
        );
        group.paymentPaidCount += 1;
        group.revenue = roundMoney(group.revenue + orderAmount);
        group.refundAmount = roundMoney(group.refundAmount + refunded);
      } else if (status === "EXTERNAL_FAILED") {
        group.paymentFailedCount += 1;
      } else {
        group.paymentPendingCount += 1;
      }
    }

    const control = finalizeAccumulator(groups.CONTROL);
    const treatment = finalizeAccumulator(groups.TREATMENT);
    const rollbackHistory = Array.isArray(state.rollbackHistoryByMerchant[safeMerchantId])
      ? state.rollbackHistoryByMerchant[safeMerchantId]
      : [];
    const evaluatedAt = resolveLatestEvaluatedAt([
      config.updatedAt,
      config.lastRollbackAt,
      ...decisions.map((item) => item && (item.created_at || item.createdAt)),
      ...payments.map((item) => item && (item.createdAt || item.updatedAt))
    ]);

    return {
      version: EXPERIMENT_VERSION,
      merchantId: safeMerchantId,
      experimentId: config.experimentId,
      objective: config.objective,
      event: safeEvent,
      evaluatedAt,
      windowDays: safeWindowDays,
      config,
      groups: {
        control,
        treatment
      },
      uplift: {
        merchantRevenueUplift: roundRate(computeRelativeLift(treatment.netRevenue, control.netRevenue)),
        merchantProfitUplift: roundRate(
          computeRelativeLift(treatment.netProfitProxy, control.netProfitProxy)
        ),
        upliftHitRateLift: roundRate(treatment.hitRate - control.hitRate),
        paymentSuccessRateLift: roundRate(treatment.paymentSuccessRate - control.paymentSuccessRate)
      },
      risk: resolveRiskStatus({
        merchantId: safeMerchantId,
        windowDays: safeWindowDays,
        config
      }),
      rollback: {
        lastRollbackAt: config.lastRollbackAt || null,
        lastRollbackBy: config.lastRollbackBy || null,
        lastRollbackReason: config.lastRollbackReason || null,
        history: rollbackHistory.slice(0, 20)
      }
    };
  }

  function rollback({ merchantId, operatorId = "", reason = "" }) {
    const safeMerchantId = assertMerchant(merchantId);
    const state = ensureExperimentState();
    const previous = getConfig({ merchantId: safeMerchantId });
    const rollbackAt = new Date(now()).toISOString();
    const rollbackBy = toString(operatorId, "system");
    const rollbackReason = toString(reason, "manual rollback");
    const entry = {
      rollbackId: `rollback_${safeMerchantId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      merchantId: safeMerchantId,
      experimentId: previous.experimentId,
      reason: rollbackReason,
      operatorId: rollbackBy,
      rolledBackAt: rollbackAt,
      previousStatus: previous.status
    };
    if (!Array.isArray(state.rollbackHistoryByMerchant[safeMerchantId])) {
      state.rollbackHistoryByMerchant[safeMerchantId] = [];
    }
    state.rollbackHistoryByMerchant[safeMerchantId].unshift(entry);
    state.rollbackHistoryByMerchant[safeMerchantId] =
      state.rollbackHistoryByMerchant[safeMerchantId].slice(0, 50);

    const next = {
      ...previous,
      enabled: false,
      status: "ROLLED_BACK",
      lastRollbackAt: rollbackAt,
      lastRollbackBy: rollbackBy,
      lastRollbackReason: rollbackReason,
      updatedAt: rollbackAt,
      updatedBy: rollbackBy
    };
    state.configByMerchant[safeMerchantId] = next;
    db.save();
    return {
      version: EXPERIMENT_VERSION,
      merchantId: safeMerchantId,
      experimentId: next.experimentId,
      rollback: entry,
      config: next
    };
  }

  return {
    getConfig,
    setConfig,
    getSnapshot,
    rollback
  };
}

module.exports = {
  createExperimentService
};
