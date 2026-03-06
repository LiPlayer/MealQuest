const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function seedMerchant(app, merchantId = "m_s110_http_001") {
  app.db.merchants[merchantId] = {
    merchantId,
    name: "S110 HTTP Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  app.db.merchantUsers = app.db.merchantUsers || {};
  app.db.merchantUsers[merchantId] = app.db.merchantUsers[merchantId] || {
    u_001: {
      uid: "u_001",
      displayName: "Customer 001",
      wallet: {
        principal: 0,
        bonus: 0,
        silver: 0
      },
      tags: [],
      fragments: {},
      vouchers: []
    }
  };
  app.db.paymentsByMerchant = app.db.paymentsByMerchant || {};
  app.db.paymentsByMerchant[merchantId] = app.db.paymentsByMerchant[merchantId] || {};
}

async function fetchJson({
  baseUrl,
  path,
  method = "GET",
  token = "",
  body = null,
  headers = {}
}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let data = null;
  if (response.status !== 304) {
    data = await response.json();
  }
  return {
    status: response.status,
    data,
    headers: response.headers
  };
}

test("S110 http: owner can set config, manager can read, and GET supports ETag", async () => {
  const merchantId = "m_s110_http_cfg_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedMerchant(app, merchantId);
  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "owner_001"
    },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    {
      role: "MANAGER",
      merchantId,
      operatorId: "manager_001"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const updated = await fetchJson({
      baseUrl,
      path: "/api/policyos/experiments/config",
      method: "PUT",
      token: ownerToken,
      body: {
        merchantId,
        enabled: true,
        trafficPercent: 40,
        targetEvent: "USER_ENTER_SHOP",
        optimizationMode: "MANUAL"
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.enabled, true);
    assert.equal(updated.data.trafficPercent, 40);

    const queried = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/config?merchantId=${encodeURIComponent(merchantId)}`,
      token: managerToken
    });
    assert.equal(queried.status, 200);
    assert.equal(queried.data.enabled, true);
    const etag = queried.headers.get("etag");
    assert.ok(etag);

    const notModified = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/config?merchantId=${encodeURIComponent(merchantId)}`,
      token: managerToken,
      headers: {
        "If-None-Match": etag
      }
    });
    assert.equal(notModified.status, 304);
  } finally {
    await app.stop();
  }
});

test("S110 http: role and scope control for config and rollback", async () => {
  const merchantId = "m_s110_http_acl_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedMerchant(app, merchantId);
  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "owner_001"
    },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    {
      role: "MANAGER",
      merchantId,
      operatorId: "manager_001"
    },
    TEST_JWT_SECRET
  );
  const otherOwnerToken = issueToken(
    {
      role: "OWNER",
      merchantId: "m_other",
      operatorId: "owner_other"
    },
    TEST_JWT_SECRET
  );
  const customerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId,
      userId: "u_001"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const managerWriteDenied = await fetchJson({
      baseUrl,
      path: "/api/policyos/experiments/config",
      method: "PUT",
      token: managerToken,
      body: {
        merchantId,
        enabled: true
      }
    });
    assert.equal(managerWriteDenied.status, 403);

    const customerReadDenied = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/config?merchantId=${encodeURIComponent(merchantId)}`,
      token: customerToken
    });
    assert.equal(customerReadDenied.status, 403);

    const scopeDenied = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/config?merchantId=${encodeURIComponent(merchantId)}`,
      token: otherOwnerToken
    });
    assert.equal(scopeDenied.status, 403);

    const ownerRollback = await fetchJson({
      baseUrl,
      path: "/api/policyos/experiments/rollback",
      method: "POST",
      token: ownerToken,
      body: {
        merchantId,
        reason: "ops rollback"
      }
    });
    assert.equal(ownerRollback.status, 200);
    assert.equal(ownerRollback.data.config.status, "ROLLED_BACK");
    assert.equal(ownerRollback.data.config.enabled, false);
  } finally {
    await app.stop();
  }
});

test("S110 http: metrics endpoint supports tenant limit and etag", async () => {
  const merchantId = "m_s110_http_metrics_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedMerchant(app, merchantId);
  app.db.paymentsByMerchant[merchantId].pay_001 = {
    paymentTxnId: "pay_001",
    merchantId,
    userId: "u_001",
    status: "PAID",
    orderAmount: 100,
    refundedAmount: 0,
    createdAt: new Date().toISOString()
  };
  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "owner_001"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const first = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/metrics?merchantId=${encodeURIComponent(merchantId)}`,
      token: ownerToken
    });
    assert.equal(first.status, 200);
    assert.equal(first.data.version, "S110-SRV-01.v1");
    assert.ok(first.data.groups && first.data.groups.control && first.data.groups.treatment);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const cached = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/metrics?merchantId=${encodeURIComponent(merchantId)}`,
      token: ownerToken,
      headers: {
        "If-None-Match": etag
      }
    });
    assert.equal(cached.status, 304);

    app.tenantPolicyManager.setMerchantPolicy(merchantId, {
      limits: {
        EXPERIMENT_METRICS_QUERY: 1
      }
    });
    const allowed = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/metrics?merchantId=${encodeURIComponent(merchantId)}&windowDays=30`,
      token: ownerToken
    });
    assert.equal(allowed.status, 200);

    const limited = await fetchJson({
      baseUrl,
      path: `/api/policyos/experiments/metrics?merchantId=${encodeURIComponent(merchantId)}&windowDays=30`,
      token: ownerToken
    });
    assert.equal(limited.status, 429);
    assert.equal(String(limited.data.code), "TENANT_RATE_LIMITED");
  } finally {
    await app.stop();
  }
});

