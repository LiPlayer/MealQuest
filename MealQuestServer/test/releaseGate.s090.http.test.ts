const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoDaysAgo(daysAgo) {
  return new Date(Date.now() - Math.max(0, Number(daysAgo) || 0) * DAY_MS).toISOString();
}

function ensureMerchant(app, merchantId) {
  if (!app.db.merchants[merchantId]) {
    app.db.merchants[merchantId] = {
      merchantId,
      name: `Merchant ${merchantId}`,
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0,
      staff: [
        { uid: "owner_001", role: "OWNER" },
        { uid: "manager_001", role: "MANAGER" },
        { uid: "clerk_001", role: "CLERK" }
      ]
    };
  }
  app.db.paymentsByMerchant = app.db.paymentsByMerchant || {};
  app.db.paymentsByMerchant[merchantId] = app.db.paymentsByMerchant[merchantId] || {};
  app.db.invoicesByMerchant = app.db.invoicesByMerchant || {};
  app.db.invoicesByMerchant[merchantId] = app.db.invoicesByMerchant[merchantId] || {};
  app.db.auditLogs = Array.isArray(app.db.auditLogs) ? app.db.auditLogs : [];
  app.db.policyOs = app.db.policyOs || {};
  app.db.policyOs.policies = app.db.policyOs.policies || {};
  app.db.policyOs.decisions = app.db.policyOs.decisions || {};
}

function addPaidPayment(app, merchantId, idx, daysAgo, orderAmount, refundedAmount = 0) {
  const paymentTxnId = `pay_${merchantId}_${idx}`;
  app.db.paymentsByMerchant[merchantId][paymentTxnId] = {
    paymentTxnId,
    merchantId,
    userId: "u_test_001",
    status: "PAID",
    orderAmount,
    refundedAmount,
    createdAt: toIsoDaysAgo(daysAgo)
  };
  app.db.invoicesByMerchant[merchantId][`inv_${paymentTxnId}`] = {
    invoiceNo: `inv_${paymentTxnId}`,
    merchantId,
    userId: "u_test_001",
    paymentTxnId,
    amount: orderAmount,
    issuedAt: toIsoDaysAgo(Math.max(0, daysAgo - 1))
  };
}

function addFailedPayment(app, merchantId, idx, daysAgo, orderAmount) {
  const paymentTxnId = `pay_failed_${merchantId}_${idx}`;
  app.db.paymentsByMerchant[merchantId][paymentTxnId] = {
    paymentTxnId,
    merchantId,
    userId: "u_test_001",
    status: "EXTERNAL_FAILED",
    orderAmount,
    createdAt: toIsoDaysAgo(daysAgo)
  };
}

function addDecision({
  app,
  merchantId,
  decisionId,
  daysAgo,
  mode = "EXECUTE",
  policyId,
  hit = true
}) {
  app.db.policyOs.decisions[decisionId] = {
    decision_id: decisionId,
    merchant_id: merchantId,
    user_id: "u_test_001",
    event: "USER_ENTER_SHOP",
    mode,
    created_at: toIsoDaysAgo(daysAgo),
    executed: hit ? [policyId] : [],
    rejected: hit ? [] : [{ policyId, reason: "constraint:budget_cap" }],
    projected: [{ policy_id: policyId, estimated_cost: 2, estimated_budget_cost: 2 }],
    explains: []
  };
}

function seedGoScenario(app, merchantId) {
  ensureMerchant(app, merchantId);
  const retentionPolicyId = `policy_ret_${merchantId}`;
  const revenuePolicyId = `policy_rev_${merchantId}`;
  app.db.policyOs.policies[retentionPolicyId] = {
    policy_id: retentionPolicyId,
    policy_key: "RET_DORMANT_WINBACK_14D_V1",
    status: "PUBLISHED",
    resource_scope: { merchant_id: merchantId },
    strategyMeta: { category: "RETENTION" }
  };
  app.db.policyOs.policies[revenuePolicyId] = {
    policy_id: revenuePolicyId,
    policy_key: "REV_ADDON_UPSELL_SLOW_ITEM_V1",
    status: "PUBLISHED",
    resource_scope: { merchant_id: merchantId },
    strategyMeta: { category: "EXPANSION" }
  };

  const recentDays = [1, 2, 3, 4, 5, 6, 7];
  const previousDays = [8, 9, 10, 11, 12, 13, 14];
  const otherCurrentDays = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const previousWindowDays = [
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
    43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54
  ];

  let paymentIndex = 0;
  for (const day of recentDays) {
    paymentIndex += 1;
    addPaidPayment(app, merchantId, paymentIndex, day, 120, 0);
  }
  for (const day of previousDays) {
    paymentIndex += 1;
    addPaidPayment(app, merchantId, paymentIndex, day, 100, 0);
  }
  for (const day of otherCurrentDays) {
    paymentIndex += 1;
    addPaidPayment(app, merchantId, paymentIndex, day, 110, 0);
  }
  for (const day of previousWindowDays) {
    paymentIndex += 1;
    addPaidPayment(app, merchantId, paymentIndex, day, 80, 0);
  }

  const currentDecisionDays = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
  ];
  const previousDecisionDays = [
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
    43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54
  ];

  let decisionIndex = 0;
  for (let i = 0; i < currentDecisionDays.length; i += 1) {
    decisionIndex += 1;
    const useRetention = i < 10;
    const hit = i < 16;
    addDecision({
      app,
      merchantId,
      decisionId: `decision_cur_${merchantId}_${decisionIndex}`,
      daysAgo: currentDecisionDays[i],
      policyId: useRetention ? retentionPolicyId : revenuePolicyId,
      hit
    });
  }
  for (let i = 0; i < previousDecisionDays.length; i += 1) {
    decisionIndex += 1;
    const hit = i < 10;
    addDecision({
      app,
      merchantId,
      decisionId: `decision_prev_${merchantId}_${decisionIndex}`,
      daysAgo: previousDecisionDays[i],
      policyId: i % 2 === 0 ? retentionPolicyId : revenuePolicyId,
      hit
    });
  }

  app.db.auditLogs.push(
    {
      auditId: `audit_privacy_1_${merchantId}`,
      timestamp: toIsoDaysAgo(2),
      merchantId,
      action: "PRIVACY_EXPORT",
      status: "SUCCESS",
      role: "OWNER",
      operatorId: "owner_001",
      details: {}
    },
    {
      auditId: `audit_privacy_2_${merchantId}`,
      timestamp: toIsoDaysAgo(5),
      merchantId,
      action: "PRIVACY_CANCEL",
      status: "SUCCESS",
      role: "OWNER",
      operatorId: "owner_001",
      details: {}
    }
  );
}

function seedNeedsReviewScenario(app, merchantId) {
  ensureMerchant(app, merchantId);
  const revenuePolicyId = `policy_review_${merchantId}`;
  app.db.policyOs.policies[revenuePolicyId] = {
    policy_id: revenuePolicyId,
    policy_key: "REV_ADDON_UPSELL_SLOW_ITEM_V1",
    status: "PUBLISHED",
    resource_scope: { merchant_id: merchantId },
    strategyMeta: { category: "EXPANSION" }
  };

  addPaidPayment(app, merchantId, 1, 2, 88, 0);
  addPaidPayment(app, merchantId, 2, 8, 72, 0);
  addPaidPayment(app, merchantId, 3, 36, 60, 0);

  addDecision({
    app,
    merchantId,
    decisionId: `decision_review_1_${merchantId}`,
    daysAgo: 2,
    policyId: revenuePolicyId,
    hit: true
  });
  addDecision({
    app,
    merchantId,
    decisionId: `decision_review_2_${merchantId}`,
    daysAgo: 8,
    policyId: revenuePolicyId,
    hit: false
  });

  app.db.auditLogs.push({
    auditId: `audit_review_1_${merchantId}`,
    timestamp: toIsoDaysAgo(3),
    merchantId,
    action: "PRIVACY_EXPORT",
    status: "SUCCESS",
    role: "OWNER",
    operatorId: "owner_001",
    details: {}
  });
}

function seedNoGoScenario(app, merchantId) {
  seedGoScenario(app, merchantId);
  addFailedPayment(app, merchantId, 1, 3, 120);
}

async function getJson(baseUrl, path, token = "", headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
  let data = null;
  if (res.status !== 304) {
    data = await res.json();
  }
  return {
    status: res.status,
    data,
    headers: res.headers
  };
}

test("S090 release gate: returns GO snapshot and supports ETag 304", async () => {
  const merchantId = "m_s090_go_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedGoScenario(app, merchantId);
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
    const first = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(first.status, 200);
    assert.equal(String(first.data.version), "S090-SRV-01.v1");
    assert.equal(String(first.data.merchantId), merchantId);
    assert.equal(String(first.data.finalDecision.status), "GO");
    assert.ok(first.data.kpis.LongTermValueIndex >= 1);
    assert.ok(first.data.kpis.paymentSuccessRate30 >= 0.995);
    assert.equal(String(first.data.gates.businessGate.status), "PASS");
    assert.equal(String(first.data.gates.technicalGate.status), "PASS");
    assert.equal(String(first.data.gates.riskGate.status), "PASS");
    assert.equal(String(first.data.gates.complianceGate.status), "PASS");

    const etag = first.headers.get("etag");
    assert.ok(etag);

    const second = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken,
      {
        "If-None-Match": etag
      }
    );
    assert.equal(second.status, 304);
  } finally {
    await app.stop();
  }
});

test("S090 release gate: returns NEEDS_REVIEW when data is insufficient", async () => {
  const merchantId = "m_s090_review_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedNeedsReviewScenario(app, merchantId);
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
    const result = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(result.status, 200);
    assert.equal(String(result.data.finalDecision.status), "NEEDS_REVIEW");
    assert.equal(Boolean(result.data.dataSufficiency.ready), false);
    assert.ok(Array.isArray(result.data.dataSufficiency.reasons));
    assert.ok(result.data.dataSufficiency.reasons.length > 0);
  } finally {
    await app.stop();
  }
});

test("S090 release gate: returns NO_GO when technical gate is below threshold", async () => {
  const merchantId = "m_s090_nogo_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedNoGoScenario(app, merchantId);
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
    const result = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(result.status, 200);
    assert.equal(String(result.data.finalDecision.status), "NO_GO");
    assert.equal(String(result.data.gates.technicalGate.status), "FAIL");
    assert.ok(
      Array.isArray(result.data.gates.technicalGate.reasons) &&
        result.data.gates.technicalGate.reasons.includes("PAYMENT_SUCCESS_RATE_BELOW_THRESHOLD")
    );
  } finally {
    await app.stop();
  }
});

test("S090 release gate: enforces role, scope and tenant limit", async () => {
  const merchantId = "m_s090_acl_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  seedGoScenario(app, merchantId);

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
  const clerkToken = issueToken(
    {
      role: "CLERK",
      merchantId,
      operatorId: "clerk_001"
    },
    TEST_JWT_SECRET
  );
  const customerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId,
      userId: "u_test_001"
    },
    TEST_JWT_SECRET
  );
  const globalOwnerToken = issueToken(
    {
      role: "OWNER",
      operatorId: "owner_global"
    },
    TEST_JWT_SECRET
  );

  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const managerOk = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(managerOk.status, 200);

    const clerkDenied = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      clerkToken
    );
    assert.equal(clerkDenied.status, 403);

    const customerDenied = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      customerToken
    );
    assert.equal(customerDenied.status, 403);

    const scopeDenied = await getJson(
      baseUrl,
      "/api/state/release-gate?merchantId=m_other_store",
      ownerToken
    );
    assert.equal(scopeDenied.status, 403);

    const missingMerchant = await getJson(
      baseUrl,
      "/api/state/release-gate",
      globalOwnerToken
    );
    assert.equal(missingMerchant.status, 400);

    const notFound = await getJson(
      baseUrl,
      "/api/state/release-gate?merchantId=m_not_found",
      globalOwnerToken
    );
    assert.equal(notFound.status, 404);

    app.tenantPolicyManager.setMerchantPolicy(merchantId, {
      limits: {
        KPI_RELEASE_GATE_QUERY: 1
      }
    });
    const first = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(first.status, 200);

    const second = await getJson(
      baseUrl,
      `/api/state/release-gate?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(second.status, 429);
    assert.equal(String(second.data.code), "TENANT_RATE_LIMITED");
  } finally {
    await app.stop();
  }
});
