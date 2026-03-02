const WRITE_OPERATIONS = new Set([
  "PAYMENT_VERIFY",
  "PAYMENT_REFUND",
  "KILL_SWITCH_SET",
  "POLICY_DRAFT_CREATE",
  "POLICY_DRAFT_SUBMIT",
  "POLICY_DRAFT_APPROVE",
  "POLICY_PUBLISH",
  "POLICY_PAUSE",
  "POLICY_RESUME",
  "POLICY_EVALUATE",
  "POLICY_EXECUTE"
]);

const REALTIME_OPERATIONS = new Set(["WS_CONNECT", "WS_STATUS_QUERY"]);

function toPositiveInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.floor(num);
}

function normalizeLimit(limit) {
  if (limit === null || limit === undefined) {
    return null;
  }
  if (typeof limit === "number" || typeof limit === "string") {
    const normalized = toPositiveInt(limit);
    if (!normalized) {
      return null;
    }
    return {
      limit: normalized,
      windowMs: 60 * 1000
    };
  }
  if (typeof limit === "object") {
    const normalizedLimit = toPositiveInt(limit.limit);
    const normalizedWindow = toPositiveInt(limit.windowMs);
    if (!normalizedLimit || !normalizedWindow) {
      return null;
    }
    return {
      limit: normalizedLimit,
      windowMs: normalizedWindow
    };
  }
  return null;
}

function clonePolicy(input = {}) {
  return {
    ...input,
    limits: {
      ...((input && input.limits) || {})
    }
  };
}

function mergePolicies(basePolicy = {}, overridePolicy = {}) {
  return {
    ...basePolicy,
    ...overridePolicy,
    limits: {
      ...((basePolicy && basePolicy.limits) || {}),
      ...((overridePolicy && overridePolicy.limits) || {})
    }
  };
}

function createTenantPolicyManager({
  tenantPolicyMap = {},
  defaultTenantPolicy = {},
  now = () => Date.now()
} = {}) {
  const tenantPolicies = new Map(
    Object.entries(tenantPolicyMap || {}).map(([merchantId, policy]) => [
      merchantId,
      clonePolicy(policy)
    ])
  );
  const normalizedDefaultPolicy = clonePolicy(defaultTenantPolicy);
  const rateCounters = new Map();

  function getPolicy(merchantId) {
    const tenantPolicy = merchantId ? tenantPolicies.get(merchantId) : null;
    return mergePolicies(normalizedDefaultPolicy, tenantPolicy || {});
  }

  function setMerchantPolicy(merchantId, policyPatch = {}) {
    if (!merchantId) {
      throw new Error("merchantId is required");
    }
    const previous = clonePolicy(tenantPolicies.get(merchantId) || {});
    const next = mergePolicies(previous, clonePolicy(policyPatch));
    tenantPolicies.set(merchantId, next);
    return next;
  }

  function evaluate({ merchantId, operation }) {
    if (!merchantId || !operation) {
      return { allowed: true };
    }
    const op = String(operation).trim().toUpperCase();
    const policy = getPolicy(merchantId);

    if (WRITE_OPERATIONS.has(op) && policy.writeEnabled === false) {
      return {
        allowed: false,
        statusCode: 403,
        code: "TENANT_WRITE_DISABLED",
        reason: "merchant is read-only during migration"
      };
    }

    if (REALTIME_OPERATIONS.has(op) && policy.wsEnabled === false) {
      return {
        allowed: false,
        statusCode: 403,
        code: "TENANT_REALTIME_DISABLED",
        reason: "merchant realtime channel is disabled during migration"
      };
    }

    const limit = normalizeLimit(policy.limits && policy.limits[op]);
    if (!limit) {
      return { allowed: true };
    }

    const key = `${merchantId}|${op}`;
    const ts = now();
    let counter = rateCounters.get(key);
    if (!counter || ts >= counter.windowStartMs + limit.windowMs) {
      counter = {
        windowStartMs: ts,
        count: 0
      };
    }

    if (counter.count >= limit.limit) {
      return {
        allowed: false,
        statusCode: 429,
        code: "TENANT_RATE_LIMITED",
        reason: `${op} quota exceeded for merchant ${merchantId}`
      };
    }

    counter.count += 1;
    rateCounters.set(key, counter);
    return { allowed: true };
  }

  return {
    evaluate,
    getPolicy,
    setMerchantPolicy
  };
}

module.exports = {
  createTenantPolicyManager
};
