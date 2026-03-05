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

function seedMerchant(app, merchantId = "m_store_001") {
  if (!app.db.merchants[merchantId]) {
    app.db.merchants[merchantId] = {
      merchantId,
      name: "S050 Notification Merchant",
      killSwitchEnabled: false,
      budgetCap: 500,
      budgetUsed: 0,
      staff: [
        { uid: "staff_owner", role: "OWNER" },
        { uid: "staff_manager", role: "MANAGER" },
        { uid: "staff_clerk", role: "CLERK" }
      ]
    };
  }
  if (!app.db.merchantUsers[merchantId] || typeof app.db.merchantUsers[merchantId] !== "object") {
    app.db.merchantUsers[merchantId] = {};
  }
  if (!app.db.merchantUsers[merchantId].u_notify_001) {
    app.db.merchantUsers[merchantId].u_notify_001 = {
      uid: "u_notify_001",
      displayName: "Notify User",
      wallet: { principal: 100, bonus: 20, silver: 10 },
      tags: ["REGULAR"],
      fragments: { spicy: 0, noodle: 1 },
      vouchers: []
    };
  }
}

function createAcquisitionSpec(merchantId, policyKey = "ACQ_NOTIFY_S050_V1") {
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
    policy_key: policyKey,
    name: "S050 Notify Policy",
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

async function postJson(baseUrl, path, body, token = "") {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    data: await res.json()
  };
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

test("S050 notifications: draft submit emits owner approval todo and supports read flow", async () => {
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
  const managerToken = issueToken(
    {
      role: "MANAGER",
      merchantId,
      operatorId: "staff_manager"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createDraft = await postJson(
      baseUrl,
      "/api/policyos/drafts",
      {
        merchantId,
        spec: createAcquisitionSpec(merchantId, "ACQ_NOTIFY_S050_APPROVAL_V1")
      },
      managerToken
    );
    assert.equal(createDraft.status, 200);

    const submit = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/submit`,
      { merchantId },
      managerToken
    );
    assert.equal(submit.status, 200);
    assert.equal(submit.data.status, "SUBMITTED");

    const ownerUnread = await getJson(
      baseUrl,
      `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(ownerUnread.status, 200);
    assert.ok(ownerUnread.data.totalUnread >= 1);
    const approvalCategory = (ownerUnread.data.byCategory || []).find(
      (item) => item.category === "APPROVAL_TODO"
    );
    assert.ok(approvalCategory);
    assert.ok(approvalCategory.unreadCount >= 1);

    const ownerInbox = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(merchantId)}&category=APPROVAL_TODO&status=UNREAD`,
      ownerToken
    );
    assert.equal(ownerInbox.status, 200);
    assert.ok(Array.isArray(ownerInbox.data.items));
    assert.ok(ownerInbox.data.items.length >= 1);
    assert.equal(ownerInbox.data.items[0].category, "APPROVAL_TODO");
    assert.equal(ownerInbox.data.items[0].status, "UNREAD");

    const managerUnread = await getJson(
      baseUrl,
      `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(managerUnread.status, 200);
    assert.equal(managerUnread.data.totalUnread, 0);

    const readAll = await postJson(
      baseUrl,
      "/api/notifications/read",
      { merchantId, markAll: true },
      ownerToken
    );
    assert.equal(readAll.status, 200);
    assert.ok(readAll.data.updatedCount >= 1);

    const ownerUnreadAfter = await getJson(
      baseUrl,
      `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(ownerUnreadAfter.status, 200);
    assert.equal(ownerUnreadAfter.data.totalUnread, 0);
  } finally {
    await app.stop();
  }
});

test("S050 notifications: decision execute emits staff/customer result notifications", async () => {
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
  const customerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId,
      userId: "u_notify_001"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createDraft = await postJson(
      baseUrl,
      "/api/policyos/drafts",
      {
        merchantId,
        spec: createAcquisitionSpec(merchantId, "ACQ_NOTIFY_S050_EXECUTE_V1")
      },
      ownerToken
    );
    assert.equal(createDraft.status, 200);

    const submit = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/submit`,
      { merchantId },
      ownerToken
    );
    assert.equal(submit.status, 200);

    const approve = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/approve`,
      { merchantId },
      ownerToken
    );
    assert.equal(approve.status, 200);
    assert.ok(approve.data.approvalId);

    const publish = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/publish`,
      {
        merchantId,
        approvalId: approve.data.approvalId
      },
      ownerToken
    );
    assert.equal(publish.status, 200);
    assert.equal(publish.data.policy.status, "PUBLISHED");

    const execute = await postJson(
      baseUrl,
      "/api/policyos/decision/execute",
      {
        merchantId,
        userId: "u_notify_001",
        event: "USER_ENTER_SHOP",
        confirmed: true
      },
      ownerToken
    );
    assert.equal(execute.status, 200);
    assert.ok(execute.data.decision_id);

    const ownerExecutionInbox = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(merchantId)}&category=EXECUTION_RESULT&status=UNREAD`,
      ownerToken
    );
    assert.equal(ownerExecutionInbox.status, 200);
    assert.ok(ownerExecutionInbox.data.items.length >= 1);
    assert.equal(ownerExecutionInbox.data.items[0].category, "EXECUTION_RESULT");

    const customerExecutionInbox = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(merchantId)}&category=EXECUTION_RESULT&status=UNREAD`,
      customerToken
    );
    assert.equal(customerExecutionInbox.status, 200);
    assert.ok(customerExecutionInbox.data.items.length >= 1);
    assert.equal(customerExecutionInbox.data.items[0].recipientType, "CUSTOMER_USER");

    const readCustomer = await postJson(
      baseUrl,
      "/api/notifications/read",
      {
        merchantId,
        markAll: true
      },
      customerToken
    );
    assert.equal(readCustomer.status, 200);
    assert.ok(readCustomer.data.updatedCount >= 1);

    const customerUnread = await getJson(
      baseUrl,
      `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
      customerToken
    );
    assert.equal(customerUnread.status, 200);
    assert.equal(customerUnread.data.totalUnread, 0);

    const ownerUnread = await getJson(
      baseUrl,
      `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(ownerUnread.status, 200);
    assert.ok(ownerUnread.data.totalUnread >= 1);
  } finally {
    await app.stop();
  }
});

test("S050 notifications: scope and recipient identity checks are enforced", async () => {
  const merchantId = "m_store_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  seedMerchant(app, "m_bistro");
  const customerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId,
      userId: "u_notify_001"
    },
    TEST_JWT_SECRET
  );
  const invalidCustomerToken = issueToken(
    {
      role: "CUSTOMER",
      merchantId
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const wrongScope = await getJson(
      baseUrl,
      "/api/notifications/inbox?merchantId=m_bistro",
      customerToken
    );
    assert.equal(wrongScope.status, 403);
    assert.equal(wrongScope.data.error, "merchant scope denied");

    const missingRecipient = await getJson(
      baseUrl,
      `/api/notifications/inbox?merchantId=${encodeURIComponent(merchantId)}`,
      invalidCustomerToken
    );
    assert.equal(missingRecipient.status, 400);
    assert.equal(missingRecipient.data.error, "recipient identity is required");
  } finally {
    await app.stop();
  }
});
