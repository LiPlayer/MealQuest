const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRetentionSpec(merchantId) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "retention_dormant_winback_14d"
  );
  if (!template) {
    throw new Error("retention_dormant_winback_14d template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("retention_dormant_winback_14d default branch not found");
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

async function publishRetentionPolicy(app, merchantId) {
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "staff_owner",
    templateId: "retention_dormant_winback_14d",
    spec: createRetentionSpec(merchantId)
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
      name: "S140 Visibility Merchant",
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
}

function seedDormantHistory(app, merchantId, userId) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const row = {
    decision_id: `seed_retention_${userId}_d16`,
    merchant_id: merchantId,
    user_id: userId,
    event: "USER_ENTER_SHOP",
    event_id: `seed_evt_retention_${userId}_d16`,
    trace_id: `seed_trace_retention_${userId}_d16`,
    mode: "EXECUTE",
    created_at: new Date(now - 16 * day).toISOString(),
    selected: ["RET_DORMANT_WINBACK_14D_V1@v1"],
    executed: ["RET_DORMANT_WINBACK_14D_V1@v1"],
    rejected: [],
    explains: [],
    projected: [],
    storyCards: [],
    grants: []
  };
  app.db.policyOs = app.db.policyOs || {};
  app.db.policyOs.decisions = app.db.policyOs.decisions || {};
  app.db.policyOs.decisions[row.decision_id] = row;
}

async function postJson(baseUrl, path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
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

test("S140 visibility: retention hit/block is consistent across login, dashboard and customer state", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishRetentionPolicy(app, merchantId);
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
      code: "mini_s140_seed_user"
    });
    assert.equal(firstLogin.status, 200);
    const userId = String(firstLogin.data.profile.userId || "");
    assert.ok(userId);

    seedDormantHistory(app, merchantId, userId);

    const secondLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s140_hit_user"
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.data.isNewUser, false);
    assert.ok(secondLogin.data.retentionDecision);
    assert.equal(secondLogin.data.retentionDecision.outcome, "HIT");
    assert.ok(String(secondLogin.data.retentionDecision.decisionId || "").startsWith("decision_"));

    const dashboardHit = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboardHit.status, 200);
    assert.ok(Number(dashboardHit.data.retentionWinbackSummary.hitCount24h) >= 1);
    assert.ok(Number(dashboardHit.data.retentionWinbackSummary.reactivationRate24h) > 0);
    assert.equal(
      String(
        dashboardHit.data.retentionWinbackSummary.latestResults &&
          dashboardHit.data.retentionWinbackSummary.latestResults[0] &&
          dashboardHit.data.retentionWinbackSummary.latestResults[0].outcome
      ),
      "HIT"
    );

    const stateHit = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      secondLogin.data.token
    );
    assert.equal(stateHit.status, 200);
    const retentionHitCard = (stateHit.data.activities || []).find(
      (item) => String(item.tag || "") === "RETENTION"
    );
    assert.ok(retentionHitCard);
    assert.ok(String(retentionHitCard.title || "").includes("沉默召回奖励已发放"));

    const thirdLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s140_block_user"
    });
    assert.equal(thirdLogin.status, 200);
    assert.ok(thirdLogin.data.retentionDecision);
    assert.equal(thirdLogin.data.retentionDecision.outcome, "BLOCKED");
    assert.ok(String(thirdLogin.data.retentionDecision.reasonCode || "").includes("frequency"));

    const dashboardBlocked = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboardBlocked.status, 200);
    assert.ok(Number(dashboardBlocked.data.retentionWinbackSummary.blockedCount24h) >= 1);
    assert.equal(
      String(
        dashboardBlocked.data.retentionWinbackSummary.latestResults &&
          dashboardBlocked.data.retentionWinbackSummary.latestResults[0] &&
          dashboardBlocked.data.retentionWinbackSummary.latestResults[0].outcome
      ),
      "BLOCKED"
    );

    const stateBlocked = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      thirdLogin.data.token
    );
    assert.equal(stateBlocked.status, 200);
    const retentionBlockedCard = (stateBlocked.data.activities || []).find(
      (item) => String(item.tag || "") === "RETENTION"
    );
    assert.ok(retentionBlockedCard);
    assert.ok(String(retentionBlockedCard.title || "").includes("沉默召回奖励未发放"));
    assert.ok(String(retentionBlockedCard.desc || "").includes("原因"));
  } finally {
    await app.stop();
  }
});
