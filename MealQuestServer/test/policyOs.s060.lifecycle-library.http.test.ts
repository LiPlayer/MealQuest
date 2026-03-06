const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

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

function seedMerchant(app, merchantId, name = "S060 Lifecycle Merchant") {
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

async function getJson(baseUrl, path, token, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {}),
      ...extraHeaders
    }
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return {
    status: res.status,
    data,
    headers: res.headers
  };
}

async function postJson(baseUrl, path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return {
    status: res.status,
    data,
    headers: res.headers
  };
}

test("S060 strategy library: owner can list five stages and enable engagement with idempotency", async () => {
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
    const before = await getJson(
      baseUrl,
      `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(before.status, 200);
    assert.equal(Array.isArray(before.data.items), true);
    assert.equal(before.data.items.length, 5);
    const engagementItem = before.data.items.find(
      (item) => item && String(item.stage) === "ENGAGEMENT"
    );
    assert.ok(engagementItem);
    assert.equal(String(engagementItem.templateId), "engagement_daily_task_loop");

    const enableFirst = await postJson(
      baseUrl,
      "/api/merchant/strategy-library/engagement_daily_task_loop/enable",
      { merchantId },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(enableFirst.status, 200);
    assert.equal(String(enableFirst.data.stage), "ENGAGEMENT");
    assert.equal(Boolean(enableFirst.data.hasPublishedPolicy), true);
    assert.equal(Boolean(enableFirst.data.alreadyEnabled), false);
    assert.ok(String(enableFirst.data.policyId || "").startsWith("ENG_DAILY_TASK_LOOP_V1@v"));

    const enableSecond = await postJson(
      baseUrl,
      "/api/merchant/strategy-library/engagement_daily_task_loop/enable",
      { merchantId },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(enableSecond.status, 200);
    assert.equal(Boolean(enableSecond.data.alreadyEnabled), true);
    assert.equal(String(enableSecond.data.policyId || ""), String(enableFirst.data.policyId || ""));

    const firstLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s060_engage_user"
    });
    assert.equal(firstLogin.status, 200);
    assert.equal(Boolean(firstLogin.data.isNewUser), true);

    const secondLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId,
      code: "mini_s060_engage_user"
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(Boolean(secondLogin.data.isNewUser), false);

    const dashboard = await getJson(
      baseUrl,
      `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.data.engagementSummary);
    assert.ok(Number(dashboard.data.engagementSummary.hitCount24h) >= 1);
    assert.equal(
      String(
        dashboard.data.engagementSummary.latestResults &&
          dashboard.data.engagementSummary.latestResults[0] &&
          dashboard.data.engagementSummary.latestResults[0].outcome
      ),
      "HIT"
    );
  } finally {
    await app.stop();
  }
});

test("S060 strategy library: role/scope guard and ETag cache work", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  seedMerchant(app, "m_bistro", "S060 Bistro");

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
  const clerkToken = issueToken(
    {
      role: "CLERK",
      merchantId,
      operatorId: "staff_clerk"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const managerList = await getJson(
      baseUrl,
      `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(managerList.status, 200);
    const etag = String(managerList.headers.get("etag") || "");
    assert.ok(etag.length > 0);

    const notModified = await getJson(
      baseUrl,
      `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken,
      { "If-None-Match": etag }
    );
    assert.equal(notModified.status, 304);
    assert.equal(notModified.data, null);

    const clerkList = await getJson(
      baseUrl,
      `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
      clerkToken
    );
    assert.equal(clerkList.status, 200);

    const scopeDenied = await getJson(
      baseUrl,
      "/api/merchant/strategy-library?merchantId=m_bistro",
      ownerToken
    );
    assert.equal(scopeDenied.status, 403);
    assert.equal(scopeDenied.data.error, "merchant scope denied");

    const managerEnableDenied = await postJson(
      baseUrl,
      "/api/merchant/strategy-library/engagement_daily_task_loop/enable",
      { merchantId },
      {
        Authorization: `Bearer ${managerToken}`
      }
    );
    assert.equal(managerEnableDenied.status, 403);

    const unsupportedTemplate = await postJson(
      baseUrl,
      "/api/merchant/strategy-library/not_supported_template/enable",
      { merchantId },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(unsupportedTemplate.status, 400);
    assert.ok(String(unsupportedTemplate.data.error || "").includes("unsupported lifecycle template"));
  } finally {
    await app.stop();
  }
});
