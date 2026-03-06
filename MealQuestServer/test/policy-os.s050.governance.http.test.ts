const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeSocialAuthService() {
  return {
    verifyWeChatMiniAppCode: async (code) => ({
      provider: "WECHAT_MINIAPP",
      subject: `wxmini_${String(code || "")}`,
      unionId: null,
      phone: "+8613900000001"
    }),
    verifyAlipayCode: async (code) => ({
      provider: "ALIPAY",
      subject: `alipay_${String(code || "")}`,
      unionId: null,
      phone: "+8613900000001"
    }),
  };
}

function seedMerchant(app, merchantId, name = "S050 Governance Merchant") {
  if (!app.db.merchants[merchantId]) {
    app.db.merchants[merchantId] = {
      merchantId,
      name,
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
}

function createAcquisitionSpec(merchantId, keySuffix) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "acquisition_welcome_gift"
  );
  if (!template) {
    throw new Error("acquisition_welcome_gift template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("acquisition_welcome_gift default branch not found");
  }
  const base = deepClone(branch.policySpec || {});
  return {
    ...base,
    policy_key: `ACQ_S050_GOV_${String(keySuffix || "DEFAULT").toUpperCase()}`,
    name: `S050 Governance ${String(keySuffix || "Default")}`,
    resource_scope: {
      merchant_id: merchantId
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600,
      ...deepClone((base && base.governance) || {})
    }
  };
}

function createDraftByStatus({ policyOsService, merchantId, status, keySuffix }) {
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "staff_owner",
    templateId: "acquisition_welcome_gift",
    spec: createAcquisitionSpec(merchantId, keySuffix)
  });
  if (status === "DRAFT") {
    return draft;
  }
  policyOsService.submitDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner"
  });
  if (status === "SUBMITTED") {
    return draft;
  }
  const approval = policyOsService.approveDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner",
    approvalLevel: "OWNER"
  });
  if (status === "APPROVED") {
    return draft;
  }
  policyOsService.publishDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner",
    approvalId: approval.approvalId
  });
  return draft;
}

function seedGovernanceDecisions(app, merchantId) {
  app.db.policyOs = app.db.policyOs || {};
  app.db.policyOs.decisions = app.db.policyOs.decisions || {};
  const now = Date.now();
  const rows = [
    {
      decision_id: "decision_s050_hit",
      trace_id: "trace_s050_hit",
      merchant_id: merchantId,
      user_id: "u_s050_1",
      event: "USER_ENTER_SHOP",
      mode: "EXECUTE",
      created_at: new Date(now - 5 * 60 * 1000).toISOString(),
      executed: ["ACQ_S050_GOV_PUBLISHED@v1"],
      selected: ["ACQ_S050_GOV_PUBLISHED@v1"],
      rejected: []
    },
    {
      decision_id: "decision_s050_blocked",
      trace_id: "trace_s050_blocked",
      merchant_id: merchantId,
      user_id: "u_s050_2",
      event: "PAYMENT_VERIFY",
      mode: "EXECUTE",
      created_at: new Date(now - 4 * 60 * 1000).toISOString(),
      executed: [],
      selected: [],
      rejected: [
        {
          policyId: "ACQ_S050_GOV_PUBLISHED@v1",
          reason: "blocked:budget_guard"
        }
      ]
    },
    {
      decision_id: "decision_s050_none",
      trace_id: "trace_s050_none",
      merchant_id: merchantId,
      user_id: "u_s050_3",
      event: "USER_ENTER_SHOP",
      mode: "EXECUTE",
      created_at: new Date(now - 3 * 60 * 1000).toISOString(),
      executed: [],
      selected: [],
      rejected: []
    }
  ];
  for (const row of rows) {
    app.db.policyOs.decisions[row.decision_id] = row;
  }
}

function seedGovernanceAudits(app, merchantId) {
  if (!Array.isArray(app.db.auditLogs)) {
    app.db.auditLogs = [];
  }
  const now = Date.now();
  app.db.auditLogs.push(
    {
      merchantId,
      action: "POLICY_EXECUTE",
      status: "SUCCESS",
      timestamp: new Date(now - 5 * 60 * 1000).toISOString()
    },
    {
      merchantId,
      action: "POLICY_EXECUTE",
      status: "BLOCKED",
      timestamp: new Date(now - 4 * 60 * 1000).toISOString()
    },
    {
      merchantId,
      action: "POLICY_EXECUTE",
      status: "FAILED",
      timestamp: new Date(now - 3 * 60 * 1000).toISOString()
    }
  );
}

async function getJson(baseUrl, path, token, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
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

test("S050 governance overview: returns closure metrics and supports ETag", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "SUBMITTED",
    keySuffix: "submitted"
  });
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "APPROVED",
    keySuffix: "approved"
  });
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "PUBLISHED",
    keySuffix: "published"
  });
  seedGovernanceDecisions(app, merchantId);
  seedGovernanceAudits(app, merchantId);
  app.db.merchants[merchantId].killSwitchEnabled = true;

  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "staff_owner"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const first = await getJson(
      baseUrl,
      `/api/policyos/governance/overview?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(first.status, 200);
    assert.equal(first.data.pendingApprovalCount, 1);
    assert.equal(first.data.approvedAwaitPublishCount, 1);
    assert.ok(first.data.activePolicyCount >= 1);
    assert.equal(first.data.killSwitchEnabled, true);
    assert.equal(first.data.decision24h.hit, 1);
    assert.equal(first.data.decision24h.blocked, 1);
    assert.equal(first.data.decision24h.noPolicy, 1);
    assert.equal(first.data.audit24h.success, 1);
    assert.equal(first.data.audit24h.blocked, 1);
    assert.equal(first.data.audit24h.failed, 1);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const second = await getJson(
      baseUrl,
      `/api/policyos/governance/overview?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken,
      { "If-None-Match": etag }
    );
    assert.equal(second.status, 304);
  } finally {
    await app.stop();
  }
});

test("S050 governance approvals: supports status filter and role/scope checks", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  seedMerchant(app, "m_bistro", "Bistro");
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "SUBMITTED",
    keySuffix: "submitted"
  });
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "APPROVED",
    keySuffix: "approved"
  });
  createDraftByStatus({
    policyOsService,
    merchantId,
    status: "PUBLISHED",
    keySuffix: "published"
  });

  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "staff_owner"
    },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    {
      role: "MANAGER",
      merchantId,
      operatorId: "staff_manager"
    },
    TEST_JWT_SECRET
  );
  const customerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId,
      userId: "u_s050"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const submittedOnly = await getJson(
      baseUrl,
      `/api/policyos/governance/approvals?merchantId=${encodeURIComponent(merchantId)}&status=SUBMITTED&limit=10`,
      managerToken
    );
    assert.equal(submittedOnly.status, 200);
    assert.equal(submittedOnly.data.items.length, 1);
    assert.equal(submittedOnly.data.items[0].status, "SUBMITTED");
    assert.ok(submittedOnly.data.items[0].policyKey);

    const allRows = await getJson(
      baseUrl,
      `/api/policyos/governance/approvals?merchantId=${encodeURIComponent(merchantId)}&status=ALL&limit=10`,
      ownerToken
    );
    assert.equal(allRows.status, 200);
    assert.equal(allRows.data.items.length, 3);

    const wrongScope = await getJson(
      baseUrl,
      "/api/policyos/governance/approvals?merchantId=m_bistro&status=ALL",
      ownerToken
    );
    assert.equal(wrongScope.status, 403);
    assert.equal(wrongScope.data.error, "merchant scope denied");

    const deniedByRole = await getJson(
      baseUrl,
      `/api/policyos/governance/approvals?merchantId=${encodeURIComponent(merchantId)}&status=ALL`,
      customerToken
    );
    assert.equal(deniedByRole.status, 403);
  } finally {
    await app.stop();
  }
});

test("S050 governance replays: supports outcome/event filter", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  seedGovernanceDecisions(app, merchantId);
  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId,
      operatorId: "staff_owner"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const blocked = await getJson(
      baseUrl,
      `/api/policyos/governance/replays?merchantId=${encodeURIComponent(merchantId)}&outcome=BLOCKED&mode=EXECUTE`,
      ownerToken
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.data.items.length, 1);
    assert.equal(blocked.data.items[0].outcome, "BLOCKED");
    assert.equal(blocked.data.items[0].event, "PAYMENT_VERIFY");
    assert.ok(blocked.data.items[0].reasonCodes.includes("blocked:budget_guard"));

    const enterShop = await getJson(
      baseUrl,
      `/api/policyos/governance/replays?merchantId=${encodeURIComponent(merchantId)}&event=USER_ENTER_SHOP&outcome=ALL&mode=EXECUTE`,
      ownerToken
    );
    assert.equal(enterShop.status, 200);
    assert.equal(enterShop.data.items.length, 2);
    assert.ok(enterShop.data.items.every((item) => item.event === "USER_ENTER_SHOP"));

    const invalidOutcome = await getJson(
      baseUrl,
      `/api/policyos/governance/replays?merchantId=${encodeURIComponent(merchantId)}&outcome=INVALID`,
      ownerToken
    );
    assert.equal(invalidOutcome.status, 400);
    assert.equal(invalidOutcome.data.error, "invalid outcome");
  } finally {
    await app.stop();
  }
});
