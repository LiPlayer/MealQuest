const STATE_CONTRACT_VERSION = "S040-SRV-01.v1";
const STATE_CONTRACT_PUBLISHED_AT = "2026-03-05T00:00:00.000Z";

const OBJECTIVE = "LONG_TERM_VALUE_MAXIMIZATION";
const PROXY_METRICS = [
  "MerchantProfitUplift30",
  "MerchantRevenueUplift30",
  "UpliftHitRate30",
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

function countPublishedPolicies(scopedDb, merchantId) {
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

function listDecisions(scopedDb, merchantId) {
  const decisions =
    scopedDb &&
    scopedDb.policyOs &&
    scopedDb.policyOs.decisions &&
    typeof scopedDb.policyOs.decisions === "object"
      ? Object.values(scopedDb.policyOs.decisions)
      : [];
  return decisions.filter((item) => item && item.merchant_id === merchantId);
}

function listAuditLogs(scopedDb, merchantId) {
  const rows = Array.isArray(scopedDb && scopedDb.auditLogs) ? scopedDb.auditLogs : [];
  return rows.filter((item) => item && item.merchantId === merchantId);
}

function buildMerchantCoverage({ merchantId, scopedDb }) {
  const users = Object.values((scopedDb.merchantUsers && scopedDb.merchantUsers[merchantId]) || {});
  const payments = Object.values((scopedDb.paymentsByMerchant && scopedDb.paymentsByMerchant[merchantId]) || {});
  const invoices = Object.values((scopedDb.invoicesByMerchant && scopedDb.invoicesByMerchant[merchantId]) || {});
  const strategyConfigs = Object.values((scopedDb.strategyConfigs && scopedDb.strategyConfigs[merchantId]) || {});
  const publishedPolicies = countPublishedPolicies(scopedDb, merchantId);
  const decisions = listDecisions(scopedDb, merchantId);
  const auditLogs = listAuditLogs(scopedDb, merchantId);

  const customerRecords = users.length;
  const orderRecords = payments.length;
  const marketingRecords = strategyConfigs.length + publishedPolicies.length + decisions.length;
  const behaviorRecords = auditLogs.length;

  const domains = {
    customer: {
      records: customerRecords,
      lastUpdatedAt: resolveLatestTimestamp(users, [
        "updatedAt",
        "lastLoginAt",
        "createdAt",
        "onboardedAt",
      ]),
    },
    order: {
      records: orderRecords,
      invoiceRecords: invoices.length,
      lastUpdatedAt: resolveLatestTimestamp([...payments, ...invoices], [
        "updatedAt",
        "createdAt",
        "issuedAt",
        "timestamp",
      ]),
    },
    marketing: {
      records: marketingRecords,
      strategyConfigRecords: strategyConfigs.length,
      publishedPolicyRecords: publishedPolicies.length,
      decisionRecords: decisions.length,
      lastUpdatedAt: resolveLatestTimestamp(
        [...strategyConfigs, ...publishedPolicies, ...decisions],
        ["updatedAt", "published_at", "created_at", "createdAt"]
      ),
    },
    behavior: {
      records: behaviorRecords,
      lastUpdatedAt: resolveLatestTimestamp(auditLogs, ["timestamp", "createdAt"]),
    },
  };

  const missingDomains = Object.entries(domains)
    .filter(([, value]) => Number(value.records || 0) === 0)
    .map(([key]) => key);

  const eventCoverage = [...new Set(decisions.map((item) => String(item.event || "").trim()).filter(Boolean))]
    .sort()
    .slice(0, 20);

  return {
    merchantId,
    domains,
    missingDomains,
    eventCoverage,
  };
}

function buildStateContractSnapshot({ merchantId = "", scopedDb = null }) {
  const normalizedMerchantId = String(merchantId || "").trim();
  const hasMerchantScope = Boolean(normalizedMerchantId && scopedDb);
  return {
    version: STATE_CONTRACT_VERSION,
    generatedAt: STATE_CONTRACT_PUBLISHED_AT,
    objective: OBJECTIVE,
    proxyMetrics: [...PROXY_METRICS],
    dataDomains: {
      customer: {
        sources: ["merchantUsers"],
        primaryKey: ["merchantId", "userId"],
        requiredFields: ["uid", "wallet", "tags", "vouchers"],
      },
      order: {
        sources: ["paymentsByMerchant", "invoicesByMerchant"],
        primaryKey: ["merchantId", "paymentTxnId"],
        requiredFields: ["paymentTxnId", "status", "orderAmount", "createdAt"],
      },
      marketing: {
        sources: ["strategyConfigs", "policyOs.policies", "policyOs.decisions"],
        primaryKey: ["merchantId", "policyId|decisionId|templateId"],
        requiredFields: ["event", "outcome", "policy_id", "created_at"],
      },
      behavior: {
        sources: ["auditLogs"],
        primaryKey: ["merchantId", "auditId"],
        requiredFields: ["action", "status", "timestamp"],
      },
    },
    events: [
      {
        event: "USER_ENTER_SHOP",
        source: "auth/customer/wechat-login | auth/customer/alipay-login",
        domain: "behavior",
      },
      {
        event: "PAYMENT_VERIFY",
        source: "payment/verify",
        domain: "order",
      },
      {
        event: "PAYMENT_REFUND",
        source: "payment/refund",
        domain: "order",
      },
      {
        event: "POLICY_EXECUTE",
        source: "policyos/decision/execute",
        domain: "marketing",
      },
    ],
    merchantCoverage: hasMerchantScope
      ? buildMerchantCoverage({
          merchantId: normalizedMerchantId,
          scopedDb,
        })
      : null,
  };
}

module.exports = {
  buildStateContractSnapshot,
  STATE_CONTRACT_VERSION,
  STATE_CONTRACT_PUBLISHED_AT,
};
