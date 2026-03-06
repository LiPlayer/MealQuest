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
      phone: "+8613900000001",
    }),
    verifyAlipayCode: async (code) => ({
      provider: "ALIPAY",
      subject: `alipay_${String(code || "")}`,
      unionId: null,
      phone: "+8613900000001",
    }),
  };
}

function seedMerchant(app, merchantId) {
  app.db.merchants[merchantId] = {
    merchantId,
    name: "S080 Feedback Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" },
    ],
  };
  if (!app.db.merchantUsers[merchantId]) {
    app.db.merchantUsers[merchantId] = {};
  }
  app.db.merchantUsers[merchantId].u_feedback_001 = {
    uid: "u_feedback_001",
    displayName: "Feedback User",
    wallet: { principal: 100, bonus: 10, silver: 5 },
    tags: ["REGULAR"],
    fragments: { spicy: 1, noodle: 0 },
    vouchers: [],
  };
}

async function getJson(baseUrl, path, token = "", headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  let data = null;
  if (res.status !== 304) {
    data = await res.json();
  }
  return {
    status: res.status,
    data,
    headers: res.headers,
  };
}

async function postJson(baseUrl, path, body, token = "") {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
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
  };
}

test("S080 feedback governance: customer create, manager transition, dual notifications and ETag work", async () => {
  const merchantId = "m_s080_feedback_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService(),
  });
  seedMerchant(app, merchantId);

  const ownerToken = issueToken(
    { role: "OWNER", merchantId, operatorId: "staff_owner" },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    { role: "MANAGER", merchantId, operatorId: "staff_manager" },
    TEST_JWT_SECRET
  );
  const customerToken = issueToken(
    { role: "CUSTOMER", merchantId, userId: "u_feedback_001" },
    TEST_JWT_SECRET
  );
  const outsiderOwnerToken = issueToken(
    { role: "OWNER", merchantId: "m_s080_feedback_other", operatorId: "staff_outside" },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createRes = await postJson(
      baseUrl,
      "/api/feedback/tickets",
      {
        merchantId,
        category: "PAYMENT",
        title: "支付后资产未到账",
        description: "顾客支付成功后未看到权益变更。",
        contact: "13800000000",
      },
      customerToken
    );
    assert.equal(createRes.status, 200);
    assert.equal(String(createRes.data.ticket.status), "OPEN");
    const ticketId = String(createRes.data.ticket.ticketId || "");
    assert.ok(ticketId);

    const ownerInbox = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(
        merchantId
      )}&category=FEEDBACK_TICKET&status=UNREAD`,
      ownerToken
    );
    assert.equal(ownerInbox.status, 200);
    assert.ok(Array.isArray(ownerInbox.data.items));
    assert.ok(ownerInbox.data.items.some((item) => String(item.related && item.related.ticketId) === ticketId));

    const listRes = await getJson(
      baseUrl,
      `/api/feedback/tickets?merchantId=${encodeURIComponent(merchantId)}&status=ALL`,
      customerToken
    );
    assert.equal(listRes.status, 200);
    assert.equal(Array.isArray(listRes.data.items), true);
    assert.equal(listRes.data.items.length, 1);
    const listEtag = listRes.headers.get("etag");
    assert.ok(listEtag);

    const list304 = await getJson(
      baseUrl,
      `/api/feedback/tickets?merchantId=${encodeURIComponent(merchantId)}&status=ALL`,
      customerToken,
      { "If-None-Match": listEtag }
    );
    assert.equal(list304.status, 304);

    const customerTransitionDenied = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "IN_PROGRESS",
        note: "顾客无权处理",
      },
      customerToken
    );
    assert.equal(customerTransitionDenied.status, 403);

    const managerTransition = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "IN_PROGRESS",
        note: "已开始排查",
      },
      managerToken
    );
    assert.equal(managerTransition.status, 200);
    assert.equal(String(managerTransition.data.ticket.status), "IN_PROGRESS");

    const customerInbox = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(
        merchantId
      )}&category=FEEDBACK_TICKET&status=UNREAD`,
      customerToken
    );
    assert.equal(customerInbox.status, 200);
    assert.ok(customerInbox.data.items.some((item) => String(item.related && item.related.ticketId) === ticketId));

    const resolved = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "RESOLVED",
        note: "已修复并完成补偿",
      },
      ownerToken
    );
    assert.equal(resolved.status, 200);
    assert.equal(String(resolved.data.ticket.status), "RESOLVED");

    const closed = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "CLOSED",
        note: "顾客确认已恢复",
      },
      ownerToken
    );
    assert.equal(closed.status, 200);
    assert.equal(String(closed.data.ticket.status), "CLOSED");

    const detailRes = await getJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}?merchantId=${encodeURIComponent(merchantId)}`,
      customerToken
    );
    assert.equal(detailRes.status, 200);
    assert.equal(String(detailRes.data.ticket.status), "CLOSED");
    assert.ok(Array.isArray(detailRes.data.ticket.timeline));
    assert.ok(detailRes.data.ticket.timeline.length >= 4);

    const summaryRes = await getJson(
      baseUrl,
      `/api/feedback/summary?merchantId=${encodeURIComponent(merchantId)}&windowHours=168`,
      ownerToken
    );
    assert.equal(summaryRes.status, 200);
    assert.equal(Number(summaryRes.data.totals.tickets), 1);
    const closedCount = (summaryRes.data.byStatus || []).find(
      (item) => String(item.status) === "CLOSED"
    );
    assert.ok(closedCount);
    assert.equal(Number(closedCount.count), 1);
    const summaryEtag = summaryRes.headers.get("etag");
    assert.ok(summaryEtag);

    const summary304 = await getJson(
      baseUrl,
      `/api/feedback/summary?merchantId=${encodeURIComponent(merchantId)}&windowHours=168`,
      ownerToken,
      { "If-None-Match": summaryEtag }
    );
    assert.equal(summary304.status, 304);

    const outsiderDenied = await getJson(
      baseUrl,
      `/api/feedback/summary?merchantId=${encodeURIComponent(merchantId)}`,
      outsiderOwnerToken
    );
    assert.equal(outsiderDenied.status, 403);
    assert.equal(String(outsiderDenied.data.error), "merchant scope denied");
  } finally {
    await app.stop();
  }
});

test("S080 feedback governance: invalid transition is blocked with 409", async () => {
  const merchantId = "m_s080_feedback_002";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService(),
  });
  seedMerchant(app, merchantId);

  const managerToken = issueToken(
    { role: "MANAGER", merchantId, operatorId: "staff_manager" },
    TEST_JWT_SECRET
  );
  const customerToken = issueToken(
    { role: "CUSTOMER", merchantId, userId: "u_feedback_001" },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createRes = await postJson(
      baseUrl,
      "/api/feedback/tickets",
      {
        merchantId,
        category: "ACCOUNT",
        title: "账号异常",
        description: "登录后页面显示异常",
      },
      customerToken
    );
    assert.equal(createRes.status, 200);
    const ticketId = String(createRes.data.ticket.ticketId || "");
    assert.ok(ticketId);

    const invalidTransition = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "RESOLVED",
        note: "跳过处理中直接完成",
      },
      managerToken
    );
    assert.equal(invalidTransition.status, 409);
    assert.ok(String(invalidTransition.data.error).includes("invalid status transition"));
  } finally {
    await app.stop();
  }
});

test("S080 feedback governance: tenant policy rate limit can throttle feedback operations", async () => {
  const merchantId = "m_s080_feedback_003";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService(),
    defaultTenantPolicy: {
      limits: {
        FEEDBACK_CREATE: 1,
        FEEDBACK_QUERY: 1,
        FEEDBACK_TRANSITION: 1,
        FEEDBACK_SUMMARY_QUERY: 1,
      },
    },
  });
  seedMerchant(app, merchantId);

  const customerToken = issueToken(
    { role: "CUSTOMER", merchantId, userId: "u_feedback_001" },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    { role: "MANAGER", merchantId, operatorId: "staff_manager" },
    TEST_JWT_SECRET
  );
  const ownerToken = issueToken(
    { role: "OWNER", merchantId, operatorId: "staff_owner" },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createFirst = await postJson(
      baseUrl,
      "/api/feedback/tickets",
      {
        merchantId,
        category: "OTHER",
        title: "反馈一",
        description: "第一条反馈",
      },
      customerToken
    );
    assert.equal(createFirst.status, 200);
    const ticketId = String(createFirst.data.ticket.ticketId || "");
    assert.ok(ticketId);

    const createSecond = await postJson(
      baseUrl,
      "/api/feedback/tickets",
      {
        merchantId,
        category: "OTHER",
        title: "反馈二",
        description: "第二条反馈",
      },
      customerToken
    );
    assert.equal(createSecond.status, 429);
    assert.equal(String(createSecond.data.code), "TENANT_RATE_LIMITED");

    const queryFirst = await getJson(
      baseUrl,
      `/api/feedback/tickets?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(queryFirst.status, 200);

    const querySecond = await getJson(
      baseUrl,
      `/api/feedback/tickets?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(querySecond.status, 429);
    assert.equal(String(querySecond.data.code), "TENANT_RATE_LIMITED");

    const transitionFirst = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "IN_PROGRESS",
      },
      managerToken
    );
    assert.equal(transitionFirst.status, 200);

    const transitionSecond = await postJson(
      baseUrl,
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}/transition`,
      {
        merchantId,
        toStatus: "RESOLVED",
      },
      managerToken
    );
    assert.equal(transitionSecond.status, 429);
    assert.equal(String(transitionSecond.data.code), "TENANT_RATE_LIMITED");

    const summaryFirst = await getJson(
      baseUrl,
      `/api/feedback/summary?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(summaryFirst.status, 200);

    const summarySecond = await getJson(
      baseUrl,
      `/api/feedback/summary?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(summarySecond.status, 429);
    assert.equal(String(summarySecond.data.code), "TENANT_RATE_LIMITED");
  } finally {
    await app.stop();
  }
});
