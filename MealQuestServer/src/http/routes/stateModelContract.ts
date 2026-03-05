const MODEL_CONTRACT_VERSION = "S040-SRV-02.v1";
const MODEL_CONTRACT_PUBLISHED_AT = "2026-03-05T00:00:00.000Z";
const OBJECTIVE_TARGET_METRIC = "MERCHANT_LONG_TERM_VALUE_30D";
const OBJECTIVE_WINDOW_DAYS = 30;
const REQUIRED_SIGNAL_FIELDS = [
  "upliftProbability",
  "churnProbability",
  "responseProbability",
  "expectedMerchantProfitLift30d",
];

function toFiniteTimestamp(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function resolveLatestTimestamp(items, candidateKeys = []) {
  const list = Array.isArray(items) ? items : [];
  let latest = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    for (const key of candidateKeys) {
      const ts = toFiniteTimestamp(item[key]);
      if (ts > latest) {
        latest = ts;
      }
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function listPolicies(scopedDb, merchantId) {
  const policies =
    scopedDb &&
    scopedDb.policyOs &&
    scopedDb.policyOs.policies &&
    typeof scopedDb.policyOs.policies === "object"
      ? Object.values(scopedDb.policyOs.policies)
      : [];
  return policies.filter(
    (item) =>
      item &&
      item.resource_scope &&
      item.resource_scope.merchant_id === merchantId &&
      String(item.status || "").toUpperCase() === "PUBLISHED"
  );
}

function hasRequiredModelSignals(policy) {
  const signals =
    policy && policy.decisionSignals && typeof policy.decisionSignals === "object"
      ? policy.decisionSignals
      : {};
  return REQUIRED_SIGNAL_FIELDS.every((field) => Number.isFinite(Number(signals[field])));
}

function buildMerchantCoverage({ merchantId, scopedDb }) {
  const policies = listPolicies(scopedDb, merchantId);
  const policiesWithModelSignals = policies.filter(hasRequiredModelSignals);
  const missingSignalPolicies = policies
    .filter((item) => !hasRequiredModelSignals(item))
    .map((item) => String(item.policy_id || item.policy_key || ""))
    .filter(Boolean);

  return {
    merchantId,
    publishedPolicyCount: policies.length,
    modelSignalReadyPolicyCount: policiesWithModelSignals.length,
    missingSignalPolicies,
    lastUpdatedAt: resolveLatestTimestamp(policies, ["updated_at", "published_at", "created_at"]),
  };
}

function buildStateModelContractSnapshot({ merchantId = "", scopedDb = null }) {
  const normalizedMerchantId = String(merchantId || "").trim();
  const hasMerchantScope = Boolean(normalizedMerchantId && scopedDb);
  return {
    version: MODEL_CONTRACT_VERSION,
    generatedAt: MODEL_CONTRACT_PUBLISHED_AT,
    objectiveContract: {
      targetMetric: OBJECTIVE_TARGET_METRIC,
      windowDays: OBJECTIVE_WINDOW_DAYS,
    },
    modelSignals: [
      {
        field: "upliftProbability",
        type: "number",
        range: [0, 1],
        defaultValue: 0.5,
        required: true,
        description: "营销动作产生正向增量收益的概率。",
      },
      {
        field: "churnProbability",
        type: "number",
        range: [0, 1],
        defaultValue: 0.15,
        required: true,
        description: "触达后用户流失风险概率。",
      },
      {
        field: "responseProbability",
        type: "number",
        range: [0, 1],
        defaultValue: 0.5,
        required: true,
        description: "用户对触达动作产生响应的概率。",
      },
      {
        field: "expectedMerchantProfitLift30d",
        type: "number",
        defaultValue: 1,
        required: true,
        description: "30 天窗口内预计商户净收益增量。",
      },
      {
        field: "expectedMerchantRevenueLift30d",
        type: "number",
        defaultValue: 1,
        required: true,
        description: "30 天窗口内预计商户收入增量。",
      },
      {
        field: "riskScore",
        type: "number",
        defaultValue: 0,
        required: true,
        description: "风险惩罚项。",
      },
      {
        field: "fatigueScore",
        type: "number",
        defaultValue: 0,
        required: true,
        description: "触达疲劳惩罚项。",
      },
      {
        field: "uncertainty",
        type: "number",
        range: [0, 1],
        defaultValue: 0.15,
        required: true,
        description: "模型不确定性估计。",
      },
    ],
    decisionFormula: {
      effectiveProbability: "upliftProbability * responseProbability * (1 - churnProbability)",
      expectedValueProxy:
        "effectiveProbability * expectedMerchantProfitLift30d - marketingCost - riskPenalty - fatiguePenalty",
    },
    merchantCoverage: hasMerchantScope
      ? buildMerchantCoverage({
          merchantId: normalizedMerchantId,
          scopedDb,
        })
      : null,
  };
}

module.exports = {
  MODEL_CONTRACT_VERSION,
  MODEL_CONTRACT_PUBLISHED_AT,
  buildStateModelContractSnapshot,
};
