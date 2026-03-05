const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRevenueSpec(merchantId) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "revenue_addon_upsell_slow_item"
  );
  if (!template) {
    throw new Error("revenue_addon_upsell_slow_item template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("revenue_addon_upsell_slow_item default branch not found");
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

async function publishRevenuePolicy(app, merchantId) {
  const { policyOsService } = app.services.getServicesForMerchant(merchantId);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "staff_owner",
    templateId: "revenue_addon_upsell_slow_item",
    spec: createRevenueSpec(merchantId)
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
      name: "S130 Visibility Merchant",
      killSwitchEnabled: false,
      budgetCap: 1000,
      budgetUsed: 0
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
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

async function putJson(baseUrl, path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
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

test("S130 merchant config API: owner can get/set/recommend revenue strategy config", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
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
    const getBefore = await getJson(
      baseUrl,
      `/api/merchant/strategy-config/revenue?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(getBefore.status, 200);
    assert.equal(getBefore.data.templateId, "revenue_addon_upsell_slow_item");

    const setConfig = await putJson(
      baseUrl,
      "/api/merchant/strategy-config/revenue",
      {
        merchantId,
        config: {
          minOrderAmount: 35,
          voucherValue: 7,
          voucherCost: 2,
          budgetCap: 180,
          frequencyWindowSec: 86400,
          frequencyMaxHits: 1,
          inventorySku: "slow_item_pool_configured",
          inventoryMaxUnits: 200
        }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(setConfig.status, 200);
    assert.equal(setConfig.data.hasPublishedPolicy, true);
    assert.ok(String(setConfig.data.policyId || "").startsWith("REV_ADDON_UPSELL_SLOW_ITEM_V1@v"));

    const getAfter = await getJson(
      baseUrl,
      `/api/merchant/strategy-config/revenue?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(getAfter.status, 200);
    assert.equal(Number(getAfter.data.config.minOrderAmount), 35);
    assert.equal(String(getAfter.data.config.inventorySku), "slow_item_pool_configured");

    const recommendation = await postJson(
      baseUrl,
      "/api/merchant/strategy-config/revenue/recommend",
      { merchantId },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(recommendation.status, 200);
    assert.equal(recommendation.data.strategyId, "REV_ADDON_UPSELL_SLOW_ITEM_V1");
    assert.ok(Array.isArray(recommendation.data.rationale));
    assert.ok(recommendation.data.rationale.length > 0);
  } finally {
    await app.stop();
  }
});

test("S130 visibility: payment revenue hit/block is consistent across payment response, dashboard and customer state", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  await publishRevenuePolicy(app, merchantId);
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
      code: "mini_s130_revenue_user"
    });
    assert.equal(login.status, 200);
    const userId = String(login.data.profile.userId || "");
    assert.ok(userId);
    app.db.merchantUsers[merchantId][userId].wallet.principal = 500;

    const firstPay = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId,
        userId,
        orderAmount: 60
      },
      {
        Authorization: `Bearer ${login.data.token}`,
        "Idempotency-Key": "s130_revenue_hit_pay_1"
      }
    );
    assert.equal(firstPay.status, 200);
    assert.equal(firstPay.data.status, "PAID");
    assert.ok(firstPay.data.revenueDecision);
    assert.equal(Array.isArray(firstPay.data.revenueDecision.executed), true);
    assert.equal(firstPay.data.revenueDecision.executed.length, 1);

    const dashboardHit = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboardHit.status, 200);
    assert.ok(Number(dashboardHit.data.revenueUpsellSummary.hitCount24h) >= 1);
    assert.equal(
      String(
        dashboardHit.data.revenueUpsellSummary.latestResults &&
          dashboardHit.data.revenueUpsellSummary.latestResults[0] &&
          dashboardHit.data.revenueUpsellSummary.latestResults[0].outcome
      ),
      "HIT"
    );

    const stateHit = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      login.data.token
    );
    assert.equal(stateHit.status, 200);
    const revenueHitCard = (stateHit.data.activities || []).find(
      (item) => String(item.tag || "") === "REVENUE"
    );
    assert.ok(revenueHitCard);
    assert.ok(String(revenueHitCard.title || "").includes("加购激励已发放"));

    const secondPay = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId,
        userId,
        orderAmount: 60
      },
      {
        Authorization: `Bearer ${login.data.token}`,
        "Idempotency-Key": "s130_revenue_block_pay_2"
      }
    );
    assert.equal(secondPay.status, 200);
    assert.equal(secondPay.data.status, "PAID");
    assert.ok(secondPay.data.revenueDecision);
    assert.equal(secondPay.data.revenueDecision.executed.length, 0);
    assert.ok(
      secondPay.data.revenueDecision.rejected.some((item) =>
        String(item.reason || "").includes("frequency")
      )
    );

    const dashboardBlocked = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboardBlocked.status, 200);
    assert.ok(Number(dashboardBlocked.data.revenueUpsellSummary.blockedCount24h) >= 1);
    assert.equal(
      String(
        dashboardBlocked.data.revenueUpsellSummary.latestResults &&
          dashboardBlocked.data.revenueUpsellSummary.latestResults[0] &&
          dashboardBlocked.data.revenueUpsellSummary.latestResults[0].outcome
      ),
      "BLOCKED"
    );

    const stateBlocked = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}&userId=${encodeURIComponent(userId)}`,
      login.data.token
    );
    assert.equal(stateBlocked.status, 200);
    const revenueBlockedCard = (stateBlocked.data.activities || []).find(
      (item) => String(item.tag || "") === "REVENUE"
    );
    assert.ok(revenueBlockedCard);
    assert.ok(String(revenueBlockedCard.title || "").includes("加购激励未发放"));
    assert.ok(String(revenueBlockedCard.desc || "").includes("原因"));
  } finally {
    await app.stop();
  }
});
