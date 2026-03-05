const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer: createAppServerInternal } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";
const activeApps = new Set();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPolicySpecFromTemplate({
  merchantId,
  templateId = "acquisition_welcome_gift",
  branchId = "DEFAULT",
  policyPatch = {}
}) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === templateId
  );
  if (!template) {
    throw new Error("template not found");
  }
  const branch = (template.branches || []).find(
    (item) => item && item.branchId === branchId
  );
  if (!branch) {
    throw new Error("branch not found");
  }

  const baseSpec = deepClone(branch.policySpec || {});
  return {
    spec: {
      ...baseSpec,
      ...deepClone(policyPatch || {}),
      policy_key:
        (policyPatch && policyPatch.policy_key) ||
        `${templateId}.${String(branchId || "default").toLowerCase()}`,
      resource_scope: {
        merchant_id: merchantId
      },
      governance: {
        approval_required: true,
        approval_level: "OWNER",
        approval_token_ttl_sec: 3600,
        ...(baseSpec.governance || {}),
        ...((policyPatch && policyPatch.governance) || {})
      },
      story: {
        schema_version: "story.v1",
        templateId,
        narrative: baseSpec.name || template.name || "Policy template",
        assets: [],
        triggers: Array.isArray(baseSpec.triggers)
          ? baseSpec.triggers
            .map((item) => String(item && item.event ? item.event : "").trim())
            .filter(Boolean)
          : []
      }
    }
  };
}

function ensureS110Fixtures(db) {
  const nowIso = new Date().toISOString();
  if (!db.merchants || typeof db.merchants !== "object") {
    db.merchants = {};
  }
  if (!db.merchantUsers || typeof db.merchantUsers !== "object") {
    db.merchantUsers = {};
  }
  if (!db.paymentsByMerchant || typeof db.paymentsByMerchant !== "object") {
    db.paymentsByMerchant = {};
  }
  if (!db.invoicesByMerchant || typeof db.invoicesByMerchant !== "object") {
    db.invoicesByMerchant = {};
  }
  if (!db.strategyConfigs || typeof db.strategyConfigs !== "object") {
    db.strategyConfigs = {};
  }

  db.merchants.m_store_001 = db.merchants.m_store_001 || {
    merchantId: "m_store_001",
    name: "Fixture Merchant",
    killSwitchEnabled: false,
    budgetCap: 300,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" },
    ],
    onboardedAt: nowIso,
  };
  db.merchantUsers.m_store_001 = db.merchantUsers.m_store_001 || {};
  db.paymentsByMerchant.m_store_001 = db.paymentsByMerchant.m_store_001 || {};
  db.invoicesByMerchant.m_store_001 = db.invoicesByMerchant.m_store_001 || {};
  db.strategyConfigs.m_store_001 = db.strategyConfigs.m_store_001 || {};
  db.strategyConfigs.m_store_001.acquisition_welcome_gift =
    db.strategyConfigs.m_store_001.acquisition_welcome_gift || {
      templateId: "acquisition_welcome_gift",
      branchId: "DEFAULT",
      status: "ACTIVE",
      lastProposalId: null,
      lastPolicyId: null,
      updatedAt: nowIso,
    };
}

function createAppServer(options = {}) {
  const app = createAppServerInternal(options);
  ensureS110Fixtures(app.db);
  activeApps.add(app);
  return app;
}

test.after(async () => {
  const apps = Array.from(activeApps);
  activeApps.clear();
  for (const app of apps) {
    if (!app || typeof app.stop !== "function") {
      continue;
    }
    try {
      await app.stop();
    } catch {
      // ignore teardown errors
    }
  }
});

async function postJson(baseUrl, targetPath, body, headers = {}) {
  const res = await fetch(`${baseUrl}${targetPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    data: await res.json()
  };
}

async function getJson(baseUrl, targetPath, headers = {}) {
  const res = await fetch(`${baseUrl}${targetPath}`, { headers });
  return {
    status: res.status,
    data: await res.json()
  };
}

function operatorIdForRole(role) {
  if (role === "OWNER") {
    return "staff_owner";
  }
  if (role === "MANAGER") {
    return "staff_manager";
  }
  if (role === "CLERK") {
    return "staff_clerk";
  }
  return undefined;
}

async function mockLogin(role, options = {}) {
  const merchantId = options.merchantId || "m_store_001";
  const userId = options.userId || "u_fixture_001";
  return issueToken(
    {
      role,
      merchantId,
      userId: role === "CUSTOMER" ? userId : undefined,
      operatorId: operatorIdForRole(role)
    },
    TEST_JWT_SECRET
  );
}

async function publishPolicyDraft({ baseUrl, merchantId, ownerToken, spec }) {
  const createDraft = await postJson(
    baseUrl,
    "/api/policyos/drafts",
    {
      merchantId,
      spec,
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(createDraft.status, 200);
  assert.ok(createDraft.data.draft_id);

  const draftId = String(createDraft.data.draft_id);
  const submit = await postJson(
    baseUrl,
    `/api/policyos/drafts/${encodeURIComponent(draftId)}/submit`,
    { merchantId },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(submit.status, 200);
  assert.equal(submit.data.status, "SUBMITTED");

  const approve = await postJson(
    baseUrl,
    `/api/policyos/drafts/${encodeURIComponent(draftId)}/approve`,
    { merchantId },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(approve.status, 200);
  assert.ok(approve.data.approvalId);

  const publish = await postJson(
    baseUrl,
    `/api/policyos/drafts/${encodeURIComponent(draftId)}/publish`,
    {
      merchantId,
      approvalId: approve.data.approvalId,
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(publish.status, 200);
  assert.equal(publish.data.policy.status, "PUBLISHED");
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

test("customer login auto executes welcome decision and surfaces consistent merchant/customer view", async () => {
  const app = createAppServer({
    persist: false,
    socialAuthService: createFakeSocialAuthService()
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  const ownerToken = await mockLogin("OWNER", { merchantId: "m_store_001" });
  const { spec } = createPolicySpecFromTemplate({
    merchantId: "m_store_001",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT",
    policyPatch: {
      policy_key: "acquisition_welcome_auto_login_hit",
    },
  });
  await publishPolicyDraft({
    baseUrl,
    merchantId: "m_store_001",
    ownerToken,
    spec,
  });

  const customerLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
    merchantId: "m_store_001",
    code: "mini_code_welcome_hit",
  });
  assert.equal(customerLogin.status, 200);
  assert.equal(customerLogin.data.isNewUser, true);
  assert.equal(customerLogin.data.welcomeDecision.event, "USER_ENTER_SHOP");
  assert.equal(customerLogin.data.welcomeDecision.outcome, "HIT");
  assert.ok(String(customerLogin.data.welcomeDecision.decisionId || "").length > 0);
  assert.ok(String(customerLogin.data.welcomeDecision.traceId || "").length > 0);

  const dashboard = await getJson(
    baseUrl,
    "/api/merchant/dashboard?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.hitCount24h, 1);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.blockedCount24h, 0);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.latestResults[0].event, "USER_ENTER_SHOP");
  assert.equal(dashboard.data.acquisitionWelcomeSummary.latestResults[0].outcome, "HIT");

  const state = await getJson(
    baseUrl,
    `/api/state?merchantId=m_store_001&userId=${encodeURIComponent(customerLogin.data.profile.userId)}`,
    { Authorization: `Bearer ${customerLogin.data.token}` }
  );
  assert.equal(state.status, 200);
  assert.equal(Array.isArray(state.data.activities), true);
  assert.equal(state.data.activities[0].tag, "WELCOME");
  assert.ok(String(state.data.activities[0].title).includes("已发放"));
});

test("customer login blocked welcome decision is visible with reason in merchant/customer views", async () => {
  const app = createAppServer({
    persist: false,
    socialAuthService: createFakeSocialAuthService()
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  const ownerToken = await mockLogin("OWNER", { merchantId: "m_store_001" });
  const { spec } = createPolicySpecFromTemplate({
    merchantId: "m_store_001",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT",
    policyPatch: {
      policy_key: "acquisition_welcome_auto_login_blocked",
      constraints: [
        {
          plugin: "kill_switch_v1",
          params: {}
        },
        {
          plugin: "budget_guard_v1",
          params: {
            cap: 120,
            cost_per_hit: 6
          }
        },
        {
          plugin: "frequency_cap_v1",
          params: {
            daily: 1,
            window_sec: 86400
          }
        },
        {
          plugin: "anti_fraud_hook_v1",
          params: {
            max_risk_score: -1
          }
        }
      ],
    },
  });
  await publishPolicyDraft({
    baseUrl,
    merchantId: "m_store_001",
    ownerToken,
    spec,
  });

  const customerLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
    merchantId: "m_store_001",
    code: "mini_code_welcome_blocked",
  });
  assert.equal(customerLogin.status, 200);
  assert.equal(customerLogin.data.welcomeDecision.event, "USER_ENTER_SHOP");
  assert.equal(customerLogin.data.welcomeDecision.outcome, "BLOCKED");
  assert.ok(String(customerLogin.data.welcomeDecision.reasonCode || "").length > 0);

  const dashboard = await getJson(
    baseUrl,
    "/api/merchant/dashboard?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.hitCount24h, 0);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.blockedCount24h, 1);
  assert.equal(dashboard.data.acquisitionWelcomeSummary.latestResults[0].event, "USER_ENTER_SHOP");
  assert.equal(dashboard.data.acquisitionWelcomeSummary.latestResults[0].outcome, "BLOCKED");
  assert.ok(
    String(dashboard.data.acquisitionWelcomeSummary.latestResults[0].reasonCode || "").length > 0
  );

  const state = await getJson(
    baseUrl,
    `/api/state?merchantId=m_store_001&userId=${encodeURIComponent(customerLogin.data.profile.userId)}`,
    { Authorization: `Bearer ${customerLogin.data.token}` }
  );
  assert.equal(state.status, 200);
  assert.equal(Array.isArray(state.data.activities), true);
  assert.equal(state.data.activities[0].tag, "WELCOME");
  assert.ok(String(state.data.activities[0].title).includes("未发放"));
});
