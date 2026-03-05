const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWelcomeSpec(merchantId) {
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

async function publishWelcomePolicy(app, merchantId) {
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "staff_owner",
    templateId: "acquisition_welcome_gift",
    spec: createWelcomeSpec(merchantId)
  });
  policyOsService.submitDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner"
  });
  const approval = policyOsService.approveDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner"
  });
  policyOsService.publishDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "staff_owner",
    approvalId: approval.approvalId
  });
}

function seedMerchant(app, merchantId) {
  if (!app.db.merchants[merchantId]) {
    app.db.merchants[merchantId] = {
      merchantId,
      name: "S110 Visibility Merchant",
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
}

async function postJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    data: await res.json()
  };
}

async function getJson(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : {}
  });
  return {
    status: res.status,
    data: await res.json()
  };
}

test("S110 visibility: first bind hit is consistent across login, dashboard and customer state", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishWelcomePolicy(app, merchantId);
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
    const login = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s110_hit_1"
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.isNewUser, true);
    assert.equal(login.data.welcomeDecision.outcome, "HIT");
    assert.ok(String(login.data.welcomeDecision.decisionId || "").startsWith("decision_"));

    const dashboard = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboard.status, 200);
    assert.ok(Number(dashboard.data.acquisitionWelcomeSummary.hitCount24h) >= 1);
    assert.equal(
      String(
        dashboard.data.acquisitionWelcomeSummary.latestResults &&
          dashboard.data.acquisitionWelcomeSummary.latestResults[0] &&
          dashboard.data.acquisitionWelcomeSummary.latestResults[0].outcome
      ),
      "HIT"
    );

    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(
        login.data.profile.userId
      )}`,
      login.data.token
    );
    assert.equal(state.status, 200);
    const welcomeCard = (state.data.activities || []).find((item) => String(item.tag || "") === "WELCOME");
    assert.ok(welcomeCard);
    assert.ok(String(welcomeCard.title || "").includes("欢迎权益已发放"));
  } finally {
    await app.stop();
  }
});

test("S110 visibility: repeated bind is blocked and reason is visible on both merchant and customer sides", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishWelcomePolicy(app, merchantId);
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
    const firstLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s110_block_first"
    });
    assert.equal(firstLogin.status, 200);
    assert.equal(firstLogin.data.welcomeDecision.outcome, "HIT");

    const secondLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s110_block_second"
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.data.isNewUser, false);
    assert.equal(secondLogin.data.welcomeDecision.outcome, "BLOCKED");
    assert.ok(String(secondLogin.data.welcomeDecision.reasonCode || "").length > 0);

    const dashboard = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboard.status, 200);
    assert.ok(Number(dashboard.data.acquisitionWelcomeSummary.blockedCount24h) >= 1);
    assert.equal(
      String(
        dashboard.data.acquisitionWelcomeSummary.latestResults &&
          dashboard.data.acquisitionWelcomeSummary.latestResults[0] &&
          dashboard.data.acquisitionWelcomeSummary.latestResults[0].outcome
      ),
      "BLOCKED"
    );

    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(
        secondLogin.data.profile.userId
      )}`,
      secondLogin.data.token
    );
    assert.equal(state.status, 200);
    const welcomeCard = (state.data.activities || []).find((item) => String(item.tag || "") === "WELCOME");
    assert.ok(welcomeCard);
    assert.ok(String(welcomeCard.title || "").includes("欢迎权益未发放"));
    assert.ok(String(welcomeCard.desc || "").includes("原因"));
  } finally {
    await app.stop();
  }
});
