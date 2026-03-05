const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createActivationSpec(merchantId) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "activation_checkin_streak_recovery"
  );
  if (!template) {
    throw new Error("activation_checkin_streak_recovery template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("activation_checkin_streak_recovery default branch not found");
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

async function publishActivationPolicy(app, merchantId) {
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "staff_owner",
    templateId: "activation_checkin_streak_recovery",
    spec: createActivationSpec(merchantId)
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
      name: "S120 Visibility Merchant",
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
}

function seedHistoricalCheckins(app, merchantId, userId) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rows = [
    {
      decision_id: `seed_decision_${userId}_d10`,
      merchant_id: merchantId,
      user_id: userId,
      event: "USER_ENTER_SHOP",
      event_id: `seed_evt_${userId}_d10`,
      trace_id: `seed_trace_${userId}_d10`,
      mode: "EXECUTE",
      created_at: new Date(now - 10 * day).toISOString(),
      selected: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      executed: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      rejected: [],
      explains: [],
      projected: [],
      storyCards: [],
      grants: []
    },
    {
      decision_id: `seed_decision_${userId}_d2`,
      merchant_id: merchantId,
      user_id: userId,
      event: "USER_ENTER_SHOP",
      event_id: `seed_evt_${userId}_d2`,
      trace_id: `seed_trace_${userId}_d2`,
      mode: "EXECUTE",
      created_at: new Date(now - 2 * day).toISOString(),
      selected: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      executed: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      rejected: [],
      explains: [],
      projected: [],
      storyCards: [],
      grants: []
    },
    {
      decision_id: `seed_decision_${userId}_d1`,
      merchant_id: merchantId,
      user_id: userId,
      event: "USER_ENTER_SHOP",
      event_id: `seed_evt_${userId}_d1`,
      trace_id: `seed_trace_${userId}_d1`,
      mode: "EXECUTE",
      created_at: new Date(now - day).toISOString(),
      selected: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      executed: ["ACT_CHECKIN_STREAK_RECOVERY_V1@v1"],
      rejected: [],
      explains: [],
      projected: [],
      storyCards: [],
      grants: []
    }
  ];
  app.db.policyOs = app.db.policyOs || {};
  app.db.policyOs.decisions = app.db.policyOs.decisions || {};
  for (const row of rows) {
    app.db.policyOs.decisions[row.decision_id] = row;
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

test("S120 visibility: activation hit is consistent across login, dashboard and customer state", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishActivationPolicy(app, merchantId);
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
      code: "mini_s120_seed_user"
    });
    assert.equal(firstLogin.status, 200);
    const userId = String(firstLogin.data.profile.userId || "");
    assert.ok(userId);

    seedHistoricalCheckins(app, merchantId, userId);

    const secondLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s120_hit_user"
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.data.isNewUser, false);
    assert.ok(secondLogin.data.activationDecision);
    assert.equal(secondLogin.data.activationDecision.outcome, "HIT");
    assert.ok(String(secondLogin.data.activationDecision.decisionId || "").startsWith("decision_"));

    const dashboard = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboard.status, 200);
    assert.ok(Number(dashboard.data.activationRecoverySummary.hitCount24h) >= 1);
    assert.equal(
      String(
        dashboard.data.activationRecoverySummary.latestResults &&
          dashboard.data.activationRecoverySummary.latestResults[0] &&
          dashboard.data.activationRecoverySummary.latestResults[0].outcome
      ),
      "HIT"
    );

    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      secondLogin.data.token
    );
    assert.equal(state.status, 200);
    const activationCard = (state.data.activities || []).find(
      (item) => String(item.tag || "") === "ACTIVATION"
    );
    assert.ok(activationCard);
    assert.ok(String(activationCard.title || "").includes("连签激活奖励已到账"));
  } finally {
    await app.stop();
  }
});

test("S120 visibility: repeated login is blocked by frequency cap and reason is visible", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishActivationPolicy(app, merchantId);
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
      code: "mini_s120_seed_user_repeat"
    });
    assert.equal(firstLogin.status, 200);
    const userId = String(firstLogin.data.profile.userId || "");
    assert.ok(userId);

    seedHistoricalCheckins(app, merchantId, userId);

    const hitLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s120_hit_user_repeat"
    });
    assert.equal(hitLogin.status, 200);
    assert.equal(hitLogin.data.activationDecision.outcome, "HIT");

    const blockedLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s120_block_user_repeat"
    });
    assert.equal(blockedLogin.status, 200);
    assert.equal(blockedLogin.data.activationDecision.outcome, "BLOCKED");
    assert.ok(String(blockedLogin.data.activationDecision.reasonCode || "").includes("frequency"));

    const dashboard = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboard.status, 200);
    assert.ok(Number(dashboard.data.activationRecoverySummary.blockedCount24h) >= 1);
    assert.equal(
      String(
        dashboard.data.activationRecoverySummary.latestResults &&
          dashboard.data.activationRecoverySummary.latestResults[0] &&
          dashboard.data.activationRecoverySummary.latestResults[0].outcome
      ),
      "BLOCKED"
    );

    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      blockedLogin.data.token
    );
    assert.equal(state.status, 200);
    const activationCard = (state.data.activities || []).find(
      (item) => String(item.tag || "") === "ACTIVATION"
    );
    assert.ok(activationCard);
    assert.ok(String(activationCard.title || "").includes("连签激活奖励未发放"));
    assert.ok(String(activationCard.desc || "").includes("原因"));
  } finally {
    await app.stop();
  }
});
