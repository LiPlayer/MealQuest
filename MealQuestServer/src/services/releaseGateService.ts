const DAY_MS = 24 * 60 * 60 * 1000;
const RELEASE_GATE_VERSION = "S090-SRV-01.v1";
const CUSTOMER_STABILITY_VERSION = "S090-SRV-02.v1";
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TREND_WINDOW_DAYS = 7;

const DEFAULT_THRESHOLDS = {
  longTermValueIndexMin: 1,
  paymentSuccessRateMin: 0.995,
  riskLossProxyMax: 0.003,
  subsidyWasteProxyMax: 0.6,
  profitTrendDeltaMin: 0,
  compliance: {
    invoiceCoverageMin: 0.98,
    privacySuccessRateMin: 0.98
  },
  dataSufficiency: {
    minPaidOrders30: 20,
    minDecisions30: 20,
    minPaidOrdersTrendWindow: 5,
    minDecisionsTrendWindow: 5
  }
};

const DEFAULT_WEIGHTS = {
  profitUplift: 0.5,
  revenueUplift: 0.25,
  upliftHitRate: 0.15,
  retention: 0.1,
  subsidyWaste: 0.15
};

const PRIVACY_AUDIT_ACTIONS = new Set(["PRIVACY_EXPORT", "PRIVACY_DELETE", "PRIVACY_CANCEL"]);
const CUSTOMER_STABILITY_REASON_MESSAGES = {
  PAYMENT_SUCCESS_RATE_BELOW_THRESHOLD: "支付成功率波动，可能影响下单体验",
  PAYMENT_NO_SAMPLE: "支付样本不足，稳定性持续观察中",
  INVOICE_COVERAGE_BELOW_THRESHOLD: "账票覆盖率波动，请留意开票状态",
  INVOICE_NO_PAID_SAMPLE: "账票样本不足，稳定性持续观察中",
  PRIVACY_SUCCESS_RATE_BELOW_THRESHOLD: "隐私流程成功率波动，请稍后重试或联系客服",
  PRIVACY_NO_SAMPLE: "隐私流程样本不足，稳定性持续观察中"
};

function toTimestampMs(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function toSafeWindowDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WINDOW_DAYS;
  }
  return Math.min(90, Math.max(7, Math.floor(parsed)));
}

function safeUpper(input) {
  return String(input || "").trim().toUpperCase();
}

function toGateStatus({ failed = false, review = false }) {
  if (failed) {
    return "FAIL";
  }
  if (review) {
    return "REVIEW";
  }
  return "PASS";
}

function mergeThresholds(base, override = {}) {
  const next = {
    ...base,
    ...override,
    compliance: {
      ...(base.compliance || {}),
      ...((override && override.compliance) || {})
    },
    dataSufficiency: {
      ...(base.dataSufficiency || {}),
      ...((override && override.dataSufficiency) || {})
    }
  };
  return {
    longTermValueIndexMin: toFiniteNumber(next.longTermValueIndexMin, DEFAULT_THRESHOLDS.longTermValueIndexMin),
    paymentSuccessRateMin: toFiniteNumber(next.paymentSuccessRateMin, DEFAULT_THRESHOLDS.paymentSuccessRateMin),
    riskLossProxyMax: toFiniteNumber(next.riskLossProxyMax, DEFAULT_THRESHOLDS.riskLossProxyMax),
    subsidyWasteProxyMax: toFiniteNumber(
      next.subsidyWasteProxyMax,
      DEFAULT_THRESHOLDS.subsidyWasteProxyMax
    ),
    profitTrendDeltaMin: toFiniteNumber(next.profitTrendDeltaMin, DEFAULT_THRESHOLDS.profitTrendDeltaMin),
    compliance: {
      invoiceCoverageMin: toFiniteNumber(
        next.compliance.invoiceCoverageMin,
        DEFAULT_THRESHOLDS.compliance.invoiceCoverageMin
      ),
      privacySuccessRateMin: toFiniteNumber(
        next.compliance.privacySuccessRateMin,
        DEFAULT_THRESHOLDS.compliance.privacySuccessRateMin
      )
    },
    dataSufficiency: {
      minPaidOrders30: Math.max(
        1,
        Math.floor(
          toFiniteNumber(
            next.dataSufficiency.minPaidOrders30,
            DEFAULT_THRESHOLDS.dataSufficiency.minPaidOrders30
          )
        )
      ),
      minDecisions30: Math.max(
        1,
        Math.floor(
          toFiniteNumber(
            next.dataSufficiency.minDecisions30,
            DEFAULT_THRESHOLDS.dataSufficiency.minDecisions30
          )
        )
      ),
      minPaidOrdersTrendWindow: Math.max(
        1,
        Math.floor(
          toFiniteNumber(
            next.dataSufficiency.minPaidOrdersTrendWindow,
            DEFAULT_THRESHOLDS.dataSufficiency.minPaidOrdersTrendWindow
          )
        )
      ),
      minDecisionsTrendWindow: Math.max(
        1,
        Math.floor(
          toFiniteNumber(
            next.dataSufficiency.minDecisionsTrendWindow,
            DEFAULT_THRESHOLDS.dataSufficiency.minDecisionsTrendWindow
          )
        )
      )
    }
  };
}

function mergeWeights(base, override = {}) {
  const next = {
    ...base,
    ...override
  };
  return {
    profitUplift: toFiniteNumber(next.profitUplift, DEFAULT_WEIGHTS.profitUplift),
    revenueUplift: toFiniteNumber(next.revenueUplift, DEFAULT_WEIGHTS.revenueUplift),
    upliftHitRate: toFiniteNumber(next.upliftHitRate, DEFAULT_WEIGHTS.upliftHitRate),
    retention: toFiniteNumber(next.retention, DEFAULT_WEIGHTS.retention),
    subsidyWaste: toFiniteNumber(next.subsidyWaste, DEFAULT_WEIGHTS.subsidyWaste)
  };
}

function createPaymentSummary() {
  return {
    attempts: 0,
    paidCount: 0,
    failedCount: 0,
    pendingCount: 0,
    gmvPaid: 0,
    refundAmount: 0,
    netRevenue: 0,
    successRate: 0,
    pendingRate: 0,
    paidTxnIds: []
  };
}

function summarizePaymentsForRange({ payments = [], startMs, endMs }) {
  const summary = createPaymentSummary();
  const rows = Array.isArray(payments) ? payments : [];
  for (const payment of rows) {
    if (!payment || typeof payment !== "object") {
      continue;
    }
    const createdAtMs = toTimestampMs(payment.createdAt);
    if (createdAtMs <= 0 || createdAtMs < startMs || createdAtMs >= endMs) {
      continue;
    }
    const status = safeUpper(payment.status);
    if (!["PAID", "EXTERNAL_FAILED", "PENDING_EXTERNAL"].includes(status)) {
      continue;
    }
    summary.attempts += 1;
    if (status === "PAID") {
      const orderAmount = Math.max(0, roundMoney(payment.orderAmount));
      const refundedAmount = Math.max(
        0,
        Math.min(orderAmount, roundMoney(payment.refundedAmount || payment.refundAmount || 0))
      );
      summary.paidCount += 1;
      summary.gmvPaid = roundMoney(summary.gmvPaid + orderAmount);
      summary.refundAmount = roundMoney(summary.refundAmount + refundedAmount);
      if (payment.paymentTxnId) {
        summary.paidTxnIds.push(String(payment.paymentTxnId));
      }
    } else if (status === "EXTERNAL_FAILED") {
      summary.failedCount += 1;
    } else if (status === "PENDING_EXTERNAL") {
      summary.pendingCount += 1;
    }
  }
  summary.netRevenue = roundMoney(summary.gmvPaid - summary.refundAmount);
  const terminal = summary.paidCount + summary.failedCount;
  summary.successRate = terminal > 0 ? roundRate(summary.paidCount / terminal) : 0;
  summary.pendingRate = summary.attempts > 0 ? roundRate(summary.pendingCount / summary.attempts) : 0;
  return summary;
}

function summarizeInvoicesForRange({ invoices = [], paidTxnIds = [], startMs, endMs }) {
  const rows = Array.isArray(invoices) ? invoices : [];
  const paidSet = new Set((Array.isArray(paidTxnIds) ? paidTxnIds : []).map((item) => String(item)));
  const coveredTxnIds = new Set();
  for (const invoice of rows) {
    if (!invoice || typeof invoice !== "object") {
      continue;
    }
    const issuedAtMs = toTimestampMs(invoice.issuedAt || invoice.createdAt);
    if (issuedAtMs <= 0 || issuedAtMs < startMs || issuedAtMs >= endMs) {
      continue;
    }
    const paymentTxnId = String(invoice.paymentTxnId || "").trim();
    if (!paymentTxnId || !paidSet.has(paymentTxnId)) {
      continue;
    }
    coveredTxnIds.add(paymentTxnId);
  }
  const paidCount = paidSet.size;
  const coveredCount = coveredTxnIds.size;
  const coverageRate = paidCount > 0 ? roundRate(coveredCount / paidCount) : 0;
  return {
    paidCount,
    coveredCount,
    coverageRate
  };
}

function extractProjectedCost(decision = {}) {
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

function isRetentionPolicy(policy = {}) {
  const policyKey = safeUpper(policy.policy_key || policy.policyKey);
  const category = safeUpper(
    policy &&
      policy.strategyMeta &&
      typeof policy.strategyMeta === "object"
      ? policy.strategyMeta.category
      : ""
  );
  if (policyKey.startsWith("RET_")) {
    return true;
  }
  return category === "RETENTION";
}

function summarizeDecisionsForRange({ decisions = [], policiesById = {}, startMs, endMs }) {
  const rows = Array.isArray(decisions) ? decisions : [];
  const policyMap =
    policiesById && typeof policiesById === "object"
      ? policiesById
      : {};
  const summary = {
    total: 0,
    hitCount: 0,
    blockedCount: 0,
    noPolicyCount: 0,
    marketingCost: 0,
    retentionAttempts: 0,
    retentionHits: 0,
    retentionBlocked: 0
  };

  for (const decision of rows) {
    if (!decision || typeof decision !== "object") {
      continue;
    }
    const createdAtMs = toTimestampMs(decision.created_at || decision.createdAt);
    if (createdAtMs <= 0 || createdAtMs < startMs || createdAtMs >= endMs) {
      continue;
    }

    summary.total += 1;
    const executed = Array.isArray(decision.executed) ? decision.executed : [];
    const rejected = Array.isArray(decision.rejected) ? decision.rejected : [];
    if (executed.length > 0) {
      summary.hitCount += 1;
    } else if (rejected.length > 0) {
      summary.blockedCount += 1;
    } else {
      summary.noPolicyCount += 1;
    }
    summary.marketingCost = roundMoney(summary.marketingCost + extractProjectedCost(decision));

    const retentionExecutedIds = executed.filter((policyId) =>
      isRetentionPolicy(policyMap[String(policyId || "")] || {})
    );
    const retentionRejectedIds = rejected
      .map((item) => (item && typeof item === "object" ? item.policyId : ""))
      .filter((policyId) => isRetentionPolicy(policyMap[String(policyId || "")] || {}));
    const retentionRelated = retentionExecutedIds.length > 0 || retentionRejectedIds.length > 0;
    if (!retentionRelated) {
      continue;
    }
    summary.retentionAttempts += 1;
    if (retentionExecutedIds.length > 0) {
      summary.retentionHits += 1;
    } else if (retentionRejectedIds.length > 0) {
      summary.retentionBlocked += 1;
    }
  }

  return summary;
}

function summarizePrivacyAuditForRange({ auditRows = [], startMs, endMs }) {
  const rows = Array.isArray(auditRows) ? auditRows : [];
  let total = 0;
  let success = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const ts = toTimestampMs(row.timestamp || row.createdAt);
    if (ts <= 0 || ts < startMs || ts >= endMs) {
      continue;
    }
    const action = safeUpper(row.action);
    if (!PRIVACY_AUDIT_ACTIONS.has(action)) {
      continue;
    }
    total += 1;
    if (safeUpper(row.status) === "SUCCESS") {
      success += 1;
    } else {
      failed += 1;
    }
  }
  return {
    total,
    success,
    failed,
    successRate: total > 0 ? roundRate(success / total) : 0
  };
}

function computeUplift(currentValue, previousValue) {
  const current = toFiniteNumber(currentValue, 0);
  const previous = toFiniteNumber(previousValue, 0);
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }
    return current > 0 ? 1 : -1;
  }
  return (current - previous) / Math.abs(previous);
}

function resolveLatestEvaluatedAt(rows = []) {
  let latestMs = 0;
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidates = [
      row.updatedAt,
      row.onboardedAt,
      row.createdAt,
      row.created_at,
      row.issuedAt,
      row.timestamp
    ];
    for (const value of candidates) {
      const ts = toTimestampMs(value);
      if (ts > latestMs) {
        latestMs = ts;
      }
    }
  }
  return latestMs > 0 ? new Date(latestMs).toISOString() : "1970-01-01T00:00:00.000Z";
}

function normalizeGateConfig({
  defaultThresholds = DEFAULT_THRESHOLDS,
  defaultWeights = DEFAULT_WEIGHTS,
  merchantPolicy = {},
  overrideThresholds = {},
  overrideWeights = {}
}) {
  const merchantReleaseGate =
    merchantPolicy &&
    merchantPolicy.releaseGate &&
    typeof merchantPolicy.releaseGate === "object"
      ? merchantPolicy.releaseGate
      : {};
  const merchantThresholds =
    merchantReleaseGate.thresholds && typeof merchantReleaseGate.thresholds === "object"
      ? merchantReleaseGate.thresholds
      : {};
  const merchantWeights =
    merchantReleaseGate.weights && typeof merchantReleaseGate.weights === "object"
      ? merchantReleaseGate.weights
      : {};
  return {
    thresholds: mergeThresholds(defaultThresholds, {
      ...merchantThresholds,
      ...overrideThresholds
    }),
    weights: mergeWeights(defaultWeights, {
      ...merchantWeights,
      ...overrideWeights
    })
  };
}

function evaluateBusinessGate({
  thresholds,
  dataSufficiencyReady,
  longTermValueIndex,
  profitTrendDelta
}) {
  const reasons = [];
  let failed = false;
  let review = false;
  if (!dataSufficiencyReady) {
    review = true;
    reasons.push("INSUFFICIENT_SAMPLE");
  }
  if (longTermValueIndex < thresholds.longTermValueIndexMin) {
    failed = true;
    reasons.push("LTV_INDEX_BELOW_THRESHOLD");
  }
  if (profitTrendDelta < thresholds.profitTrendDeltaMin) {
    failed = true;
    reasons.push("PROFIT_TREND_NOT_IMPROVING");
  }
  return {
    status: toGateStatus({ failed, review }),
    reasons
  };
}

function evaluateTechnicalGate({ thresholds, paymentsSummary }) {
  const reasons = [];
  let failed = false;
  let review = false;
  if (paymentsSummary.attempts <= 0) {
    review = true;
    reasons.push("PAYMENT_NO_SAMPLE");
  } else if (paymentsSummary.successRate < thresholds.paymentSuccessRateMin) {
    failed = true;
    reasons.push("PAYMENT_SUCCESS_RATE_BELOW_THRESHOLD");
  }
  return {
    status: toGateStatus({ failed, review }),
    reasons
  };
}

function evaluateRiskGate({ thresholds, paymentsSummary, subsidyWasteProxy }) {
  const reasons = [];
  let failed = false;
  let review = false;
  if (paymentsSummary.gmvPaid <= 0) {
    review = true;
    reasons.push("RISK_NO_GMV_SAMPLE");
  } else {
    const riskLossProxy = paymentsSummary.gmvPaid > 0
      ? roundRate(paymentsSummary.refundAmount / paymentsSummary.gmvPaid)
      : 0;
    if (riskLossProxy > thresholds.riskLossProxyMax) {
      failed = true;
      reasons.push("RISK_LOSS_PROXY_EXCEEDED");
    }
  }
  if (subsidyWasteProxy > thresholds.subsidyWasteProxyMax) {
    failed = true;
    reasons.push("SUBSIDY_WASTE_PROXY_EXCEEDED");
  }
  return {
    status: toGateStatus({ failed, review }),
    reasons
  };
}

function evaluateComplianceGate({
  thresholds,
  invoiceCoverage,
  privacySummary
}) {
  const reasons = [];
  let failed = false;
  let review = false;
  if (invoiceCoverage.paidCount <= 0) {
    review = true;
    reasons.push("INVOICE_NO_PAID_SAMPLE");
  } else if (invoiceCoverage.coverageRate < thresholds.compliance.invoiceCoverageMin) {
    failed = true;
    reasons.push("INVOICE_COVERAGE_BELOW_THRESHOLD");
  }

  if (privacySummary.total <= 0) {
    review = true;
    reasons.push("PRIVACY_NO_SAMPLE");
  } else if (privacySummary.successRate < thresholds.compliance.privacySuccessRateMin) {
    failed = true;
    reasons.push("PRIVACY_SUCCESS_RATE_BELOW_THRESHOLD");
  }

  return {
    status: toGateStatus({ failed, review }),
    reasons
  };
}

function buildDataSufficiency({
  thresholds,
  currentPayments,
  currentDecisions,
  recent7Payments,
  previous7Payments,
  recent7Decisions,
  previous7Decisions
}) {
  const observed = {
    paidOrders30: currentPayments.paidCount,
    decisions30: currentDecisions.total,
    paidOrdersRecent7: recent7Payments.paidCount,
    paidOrdersPrevious7: previous7Payments.paidCount,
    decisionsRecent7: recent7Decisions.total,
    decisionsPrevious7: previous7Decisions.total
  };
  const reasons = [];
  if (observed.paidOrders30 < thresholds.dataSufficiency.minPaidOrders30) {
    reasons.push("PAID_ORDERS_30_INSUFFICIENT");
  }
  if (observed.decisions30 < thresholds.dataSufficiency.minDecisions30) {
    reasons.push("DECISIONS_30_INSUFFICIENT");
  }
  if (observed.paidOrdersRecent7 < thresholds.dataSufficiency.minPaidOrdersTrendWindow) {
    reasons.push("PAID_ORDERS_RECENT_7_INSUFFICIENT");
  }
  if (observed.paidOrdersPrevious7 < thresholds.dataSufficiency.minPaidOrdersTrendWindow) {
    reasons.push("PAID_ORDERS_PREVIOUS_7_INSUFFICIENT");
  }
  if (observed.decisionsRecent7 < thresholds.dataSufficiency.minDecisionsTrendWindow) {
    reasons.push("DECISIONS_RECENT_7_INSUFFICIENT");
  }
  if (observed.decisionsPrevious7 < thresholds.dataSufficiency.minDecisionsTrendWindow) {
    reasons.push("DECISIONS_PREVIOUS_7_INSUFFICIENT");
  }
  return {
    ready: reasons.length === 0,
    requirements: {
      minPaidOrders30: thresholds.dataSufficiency.minPaidOrders30,
      minDecisions30: thresholds.dataSufficiency.minDecisions30,
      minPaidOrdersTrendWindow: thresholds.dataSufficiency.minPaidOrdersTrendWindow,
      minDecisionsTrendWindow: thresholds.dataSufficiency.minDecisionsTrendWindow
    },
    observed,
    reasons
  };
}

function resolveCustomerStabilityLevel({ technicalGate = {}, complianceGate = {} } = {}) {
  const technicalStatus = safeUpper(technicalGate.status);
  const complianceStatus = safeUpper(complianceGate.status);
  if (technicalStatus === "FAIL" || complianceStatus === "FAIL") {
    return {
      level: "UNSTABLE",
      label: "服务波动",
      summary: "服务存在波动，建议稍后重试。"
    };
  }
  if (technicalStatus === "REVIEW" || complianceStatus === "REVIEW") {
    return {
      level: "WATCH",
      label: "需留意",
      summary: "服务状态需留意，部分能力可能短时波动。"
    };
  }
  return {
    level: "STABLE",
    label: "稳定",
    summary: "当前服务稳定，可放心使用。"
  };
}

function toCustomerReason(reasonCode) {
  const code = safeUpper(reasonCode);
  if (!code) {
    return null;
  }
  return {
    code,
    message:
      CUSTOMER_STABILITY_REASON_MESSAGES[code] || "服务状态存在波动，请稍后重试。"
  };
}

function toCustomerStabilitySnapshot(releaseGateSnapshot = {}) {
  const gates =
    releaseGateSnapshot &&
    releaseGateSnapshot.gates &&
    typeof releaseGateSnapshot.gates === "object"
      ? releaseGateSnapshot.gates
      : {};
  const technicalGate =
    gates.technicalGate && typeof gates.technicalGate === "object"
      ? gates.technicalGate
      : { status: "REVIEW", reasons: ["PAYMENT_NO_SAMPLE"] };
  const complianceGate =
    gates.complianceGate && typeof gates.complianceGate === "object"
      ? gates.complianceGate
      : { status: "REVIEW", reasons: ["INVOICE_NO_PAID_SAMPLE", "PRIVACY_NO_SAMPLE"] };
  const level = resolveCustomerStabilityLevel({
    technicalGate,
    complianceGate
  });
  const reasons = Array.from(
    new Set(
      []
        .concat(Array.isArray(technicalGate.reasons) ? technicalGate.reasons : [])
        .concat(Array.isArray(complianceGate.reasons) ? complianceGate.reasons : [])
    )
  )
    .map((reason) => toCustomerReason(reason))
    .filter(Boolean);

  return {
    version: CUSTOMER_STABILITY_VERSION,
    merchantId: String(releaseGateSnapshot.merchantId || "").trim(),
    objective: "LONG_TERM_VALUE_MAXIMIZATION",
    evaluatedAt: String(releaseGateSnapshot.evaluatedAt || new Date().toISOString()),
    windowDays: Number(releaseGateSnapshot.windowDays || DEFAULT_WINDOW_DAYS),
    stabilityLevel: level.level,
    stabilityLabel: level.label,
    summary: level.summary,
    drivers: [
      {
        code: "TECHNICAL_GATE",
        label: "支付与核心链路",
        status: safeUpper(technicalGate.status) || "REVIEW"
      },
      {
        code: "COMPLIANCE_GATE",
        label: "隐私与账票合规",
        status: safeUpper(complianceGate.status) || "REVIEW"
      }
    ],
    reasons
  };
}

function createReleaseGateService(db, options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const globalThresholds =
    options && options.thresholds && typeof options.thresholds === "object"
      ? options.thresholds
      : {};
  const globalWeights =
    options && options.weights && typeof options.weights === "object"
      ? options.weights
      : {};

  function getReleaseGateSnapshot({ merchantId, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
    const safeMerchantId = String(merchantId || "").trim();
    if (!safeMerchantId) {
      throw new Error("merchantId is required");
    }
    const merchant = db.merchants && db.merchants[safeMerchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const safeWindowDays = toSafeWindowDays(windowDays);
    const safeTrendWindowDays = DEFAULT_TREND_WINDOW_DAYS;
    const nowMs = now();
    const currentStartMs = nowMs - safeWindowDays * DAY_MS;
    const previousStartMs = nowMs - safeWindowDays * 2 * DAY_MS;
    const recent7StartMs = nowMs - safeTrendWindowDays * DAY_MS;
    const previous7StartMs = nowMs - safeTrendWindowDays * 2 * DAY_MS;

    const merchantPolicy =
      db.tenantPolicies &&
      typeof db.tenantPolicies === "object" &&
      db.tenantPolicies[safeMerchantId] &&
      typeof db.tenantPolicies[safeMerchantId] === "object"
        ? db.tenantPolicies[safeMerchantId]
        : {};
    const normalizedConfig = normalizeGateConfig({
      merchantPolicy,
      overrideThresholds: globalThresholds,
      overrideWeights: globalWeights
    });
    const thresholds = normalizedConfig.thresholds;
    const weights = normalizedConfig.weights;

    const payments = Object.values((db.paymentsByMerchant && db.paymentsByMerchant[safeMerchantId]) || {});
    const decisions = Object.values(
      (db.policyOs && db.policyOs.decisions && db.policyOs.decisions) || {}
    ).filter((item) => item && item.merchant_id === safeMerchantId);
    const policiesById = (db.policyOs && db.policyOs.policies) || {};
    const invoices = Object.values((db.invoicesByMerchant && db.invoicesByMerchant[safeMerchantId]) || {});
    const auditRows = (Array.isArray(db.auditLogs) ? db.auditLogs : []).filter(
      (item) => item && item.merchantId === safeMerchantId
    );

    const currentPayments = summarizePaymentsForRange({
      payments,
      startMs: currentStartMs,
      endMs: nowMs
    });
    const previousPayments = summarizePaymentsForRange({
      payments,
      startMs: previousStartMs,
      endMs: currentStartMs
    });
    const recent7Payments = summarizePaymentsForRange({
      payments,
      startMs: recent7StartMs,
      endMs: nowMs
    });
    const previous7Payments = summarizePaymentsForRange({
      payments,
      startMs: previous7StartMs,
      endMs: recent7StartMs
    });

    const currentDecisions = summarizeDecisionsForRange({
      decisions,
      policiesById,
      startMs: currentStartMs,
      endMs: nowMs
    });
    const previousDecisions = summarizeDecisionsForRange({
      decisions,
      policiesById,
      startMs: previousStartMs,
      endMs: currentStartMs
    });
    const recent7Decisions = summarizeDecisionsForRange({
      decisions,
      policiesById,
      startMs: recent7StartMs,
      endMs: nowMs
    });
    const previous7Decisions = summarizeDecisionsForRange({
      decisions,
      policiesById,
      startMs: previous7StartMs,
      endMs: recent7StartMs
    });

    const currentNetProfit30 = roundMoney(currentPayments.netRevenue - currentDecisions.marketingCost);
    const previousNetProfit30 = roundMoney(previousPayments.netRevenue - previousDecisions.marketingCost);
    const currentNetProfitRecent7 = roundMoney(
      recent7Payments.netRevenue - recent7Decisions.marketingCost
    );
    const previousNetProfit7 = roundMoney(
      previous7Payments.netRevenue - previous7Decisions.marketingCost
    );

    const merchantProfitUplift30 = roundRate(computeUplift(currentNetProfit30, previousNetProfit30));
    const merchantRevenueUplift30 = roundRate(
      computeUplift(currentPayments.netRevenue, previousPayments.netRevenue)
    );
    const decisionAttempts30 = currentDecisions.hitCount + currentDecisions.blockedCount;
    const upliftHitRate30 =
      decisionAttempts30 > 0 ? roundRate(currentDecisions.hitCount / decisionAttempts30) : 0;
    const subsidyWasteProxy = roundRate(clamp(1 - upliftHitRate30, 0, 1));
    const retention30 =
      currentDecisions.retentionAttempts > 0
        ? roundRate(currentDecisions.retentionHits / currentDecisions.retentionAttempts)
        : 0;
    const profitTrendDelta7 = roundMoney(currentNetProfitRecent7 - previousNetProfit7);

    const longTermValueIndexRaw =
      1 +
      weights.profitUplift * clamp(merchantProfitUplift30, -1, 1) +
      weights.revenueUplift * clamp(merchantRevenueUplift30, -1, 1) +
      weights.upliftHitRate * (upliftHitRate30 - 0.5) +
      weights.retention * (retention30 - 0.5) -
      weights.subsidyWaste * (subsidyWasteProxy - 0.5);
    const longTermValueIndex = roundRate(clamp(longTermValueIndexRaw, 0, 3));

    const riskLossProxy30 =
      currentPayments.gmvPaid > 0 ? roundRate(currentPayments.refundAmount / currentPayments.gmvPaid) : 0;

    const invoiceCoverage30 = summarizeInvoicesForRange({
      invoices,
      paidTxnIds: currentPayments.paidTxnIds,
      startMs: currentStartMs,
      endMs: nowMs
    });
    const privacySummary30 = summarizePrivacyAuditForRange({
      auditRows,
      startMs: currentStartMs,
      endMs: nowMs
    });

    const dataSufficiency = buildDataSufficiency({
      thresholds,
      currentPayments,
      currentDecisions,
      recent7Payments,
      previous7Payments,
      recent7Decisions,
      previous7Decisions
    });

    const businessGate = evaluateBusinessGate({
      thresholds,
      dataSufficiencyReady: dataSufficiency.ready,
      longTermValueIndex,
      profitTrendDelta: profitTrendDelta7
    });
    const technicalGate = evaluateTechnicalGate({
      thresholds,
      paymentsSummary: currentPayments
    });
    const riskGate = evaluateRiskGate({
      thresholds,
      paymentsSummary: currentPayments,
      subsidyWasteProxy
    });
    const complianceGate = evaluateComplianceGate({
      thresholds,
      invoiceCoverage: invoiceCoverage30,
      privacySummary: privacySummary30
    });

    const gateItems = [businessGate, technicalGate, riskGate, complianceGate];
    const hasFail = gateItems.some((item) => item.status === "FAIL");
    const hasReview = gateItems.some((item) => item.status === "REVIEW");
    const finalStatus = hasFail
      ? "NO_GO"
      : !dataSufficiency.ready || hasReview
        ? "NEEDS_REVIEW"
        : "GO";
    const finalReasons = [
      ...new Set(
        gateItems
          .flatMap((item) => (Array.isArray(item.reasons) ? item.reasons : []))
          .concat(dataSufficiency.ready ? [] : dataSufficiency.reasons)
      )
    ];

    const evaluatedAt = resolveLatestEvaluatedAt([
      merchant,
      ...payments,
      ...decisions,
      ...invoices,
      ...auditRows
    ]);

    return {
      version: RELEASE_GATE_VERSION,
      merchantId: safeMerchantId,
      objective: "LONG_TERM_VALUE_MAXIMIZATION",
      evaluatedAt,
      windowDays: safeWindowDays,
      trendWindowDays: safeTrendWindowDays,
      kpis: {
        MerchantNetProfit30: currentNetProfit30,
        LongTermValueIndex: longTermValueIndex,
        MerchantProfitUplift30: merchantProfitUplift30,
        MerchantRevenueUplift30: merchantRevenueUplift30,
        UpliftHitRate30: upliftHitRate30,
        Retention30: retention30,
        SubsidyWasteProxy: subsidyWasteProxy,
        PlatformCost30: 0,
        PlatformCost30Observed: false,
        paymentSuccessRate30: currentPayments.successRate,
        riskLossProxy30
      },
      gates: {
        businessGate,
        technicalGate,
        riskGate,
        complianceGate
      },
      dataSufficiency,
      supportingMetrics: {
        invoiceCoverage30: invoiceCoverage30.coverageRate,
        privacySuccessRate30: privacySummary30.successRate,
        marketingCost30: currentDecisions.marketingCost,
        profitTrendDelta7
      },
      config: {
        thresholds,
        weights
      },
      finalDecision: {
        status: finalStatus,
        reasons: finalReasons
      }
    };
  }

  function getCustomerStabilitySnapshot({ merchantId, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
    const releaseGateSnapshot = getReleaseGateSnapshot({ merchantId, windowDays });
    return toCustomerStabilitySnapshot(releaseGateSnapshot);
  }

  return {
    getReleaseGateSnapshot,
    getCustomerStabilitySnapshot
  };
}

module.exports = {
  createReleaseGateService
};
