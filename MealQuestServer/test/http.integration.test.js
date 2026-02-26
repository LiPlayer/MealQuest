const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

const { createAppServer: createAppServerInternal } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");
const { createInMemoryDb } = require("../src/store/inMemoryDb");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";
const activeApps = new Set();

function seedLegacyTestUsers(db) {
  if (!db || typeof db !== "object") {
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const ensureObjectMap = (key) => {
    if (!db[key] || typeof db[key] !== "object") {
      db[key] = {};
    }
    return db[key];
  };
  const ensureMerchantRecord = (merchantId, name, budgetCap) => {
    const merchants = ensureObjectMap("merchants");
    if (!merchants[merchantId]) {
      merchants[merchantId] = {
        merchantId,
        name,
        killSwitchEnabled: false,
        budgetCap,
        budgetUsed: 0,
        staff: [
          { uid: "staff_owner", role: "OWNER" },
          { uid: "staff_manager", role: "MANAGER" },
          { uid: "staff_clerk", role: "CLERK" },
        ],
        onboardedAt: nowIso,
      };
    }
  };
  const ensureMerchantBucket = (key, merchantId, defaultValue = {}) => {
    const map = ensureObjectMap(key);
    if (!map[merchantId] || typeof map[merchantId] !== "object") {
      map[merchantId] = defaultValue;
    }
    return map[merchantId];
  };

  ensureMerchantRecord("m_store_001", "Fixture Merchant", 300);
  ensureMerchantRecord("m_bistro", "Bistro Harbor", 220);

  const mStore = ensureMerchantBucket("merchantUsers", "m_store_001");
  ensureMerchantBucket("merchantUsers", "m_bistro");
  ensureMerchantBucket("paymentsByMerchant", "m_store_001");
  ensureMerchantBucket("paymentsByMerchant", "m_bistro");
  ensureMerchantBucket("invoicesByMerchant", "m_store_001");
  ensureMerchantBucket("invoicesByMerchant", "m_bistro");
  const strategyConfigs = ensureMerchantBucket("strategyConfigs", "m_store_001");
  ensureMerchantBucket("strategyConfigs", "m_bistro");
  ensureMerchantBucket("strategyChats", "m_store_001", {
    activeSessionId: null,
    sessions: {},
  });
  ensureMerchantBucket("strategyChats", "m_bistro", {
    activeSessionId: null,
    sessions: {},
  });
  ensureMerchantBucket("allianceConfigs", "m_store_001", {
    merchantId: "m_store_001",
    clusterId: "cluster_fixture_brand",
    stores: ["m_store_001", "m_bistro"],
    walletShared: false,
    tierShared: false,
    updatedAt: nowIso,
  });
  ensureMerchantBucket("allianceConfigs", "m_bistro", {
    merchantId: "m_bistro",
    clusterId: "cluster_fixture_brand",
    stores: ["m_store_001", "m_bistro"],
    walletShared: false,
    tierShared: false,
    updatedAt: nowIso,
  });

  if (!strategyConfigs.activation_contextual_drop) {
    strategyConfigs.activation_contextual_drop = {
      templateId: "activation_contextual_drop",
      branchId: "COMFORT",
      status: "ACTIVE",
      lastProposalId: "proposal_rainy",
      lastCampaignId: "campaign_rainy_hot_soup",
      updatedAt: nowIso,
    };
  }

  if (!Array.isArray(db.campaigns)) {
    db.campaigns = [];
  }
  if (!db.campaigns.find((item) => item && item.id === "campaign_welcome")) {
    db.campaigns.push({
      id: "campaign_welcome",
      merchantId: "m_store_001",
      name: "Welcome Campaign",
      status: "ACTIVE",
      priority: 20,
      trigger: { event: "USER_ENTER_SHOP" },
      conditions: [{ field: "isNewUser", op: "eq", value: true }],
      budget: { used: 0, cap: 80, costPerHit: 8 },
      action: {
        type: "STORY_CARD",
        story: {
          templateId: "tpl_welcome",
          narrative: "Welcome and claim your first voucher.",
          assets: [{ kind: "voucher", id: "voucher_welcome_noodle" }],
          triggers: ["tap_claim"],
        },
      },
    });
  }
  if (!Array.isArray(db.proposals)) {
    db.proposals = [];
  }
  if (!db.proposals.find((item) => item && item.id === "proposal_rainy")) {
    db.proposals.push({
      id: "proposal_rainy",
      merchantId: "m_store_001",
      status: "PENDING",
      title: "Rainy Day Promotion",
      createdAt: nowIso,
      suggestedCampaign: {
        id: "campaign_rainy_hot_soup",
        merchantId: "m_store_001",
        name: "Rainy Hot Soup Campaign",
        status: "ACTIVE",
        priority: 90,
        trigger: { event: "WEATHER_CHANGE" },
        conditions: [{ field: "weather", op: "eq", value: "RAIN" }],
        budget: { used: 0, cap: 60, costPerHit: 12 },
        action: {
          type: "STORY_CARD",
          story: {
            templateId: "tpl_rain",
            narrative: "A warm soup for rainy days.",
            assets: [{ kind: "voucher", id: "voucher_hot_soup" }],
            triggers: ["tap_pay"],
          },
        },
        ttlUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      },
    });
  }

  const partnerOrders = ensureObjectMap("partnerOrders");
  if (!partnerOrders.partner_coffee || typeof partnerOrders.partner_coffee !== "object") {
    partnerOrders.partner_coffee = {};
  }
  if (!partnerOrders.partner_coffee.ext_order_1001) {
    partnerOrders.partner_coffee.ext_order_1001 = {
      partnerId: "partner_coffee",
      orderId: "ext_order_1001",
      amount: 38,
      status: "PAID",
      paidAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    };
  }

  if (!mStore.u_fixture_001) {
    mStore.u_fixture_001 = {
      uid: "u_fixture_001",
      displayName: "Fixture User",
      wallet: { principal: 120, bonus: 36, silver: 88 },
      tags: ["REGULAR", "SPICY_LOVER"],
      fragments: { spicy: 2, noodle: 3 },
      vouchers: [
        {
          id: "voucher_soon",
          type: "ITEM_WARRANT",
          name: "Noodle Voucher",
          value: 18,
          minSpend: 0,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          id: "voucher_big",
          type: "NO_THRESHOLD_VOUCHER",
          name: "No Threshold Voucher",
          value: 30,
          minSpend: 20,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
  }
  if (!mStore.u_fixture_002) {
    mStore.u_fixture_002 = {
      uid: "u_fixture_002",
      displayName: "Fixture Friend",
      wallet: { principal: 40, bonus: 8, silver: 52 },
      tags: ["REGULAR"],
      fragments: { spicy: 0, noodle: 1 },
      vouchers: [],
    };
  }
  const mBistro = ensureMerchantBucket("merchantUsers", "m_bistro");
  if (!mBistro.u_fixture_001) {
    mBistro.u_fixture_001 = {
      uid: "u_fixture_001",
      displayName: "Fixture User",
      wallet: { principal: 80, bonus: 12, silver: 36 },
      tags: ["REGULAR"],
      fragments: { spicy: 1, noodle: 1 },
      vouchers: [
        {
          id: "bistro_voucher_soon",
          type: "ITEM_WARRANT",
          name: "Soup Voucher",
          value: 10,
          minSpend: 0,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
  }
}

function createAppServer(options = {}) {
  const app = createAppServerInternal(options);
  seedLegacyTestUsers(app.db);
  if (options.tenantDbMap && typeof options.tenantDbMap === "object") {
    for (const dbItem of Object.values(options.tenantDbMap)) {
      seedLegacyTestUsers(dbItem);
    }
  }
  activeApps.add(app);
  return app;
}

function getIssuedPhoneCode(app, phone) {
  const record =
    app &&
    app.db &&
    app.db.phoneLoginCodes &&
    app.db.phoneLoginCodes[String(phone || "").trim()];
  return record && record.code ? String(record.code) : "";
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
      // ignore teardown errors to keep test process from hanging
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

async function createStrategyProposalThroughChat(
  baseUrl,
  token,
  {
    merchantId = "m_store_001",
    content = "Please create a strategy proposal now."
  } = {}
) {
  const session = await postJson(
    baseUrl,
    "/api/merchant/strategy-chat/sessions",
    { merchantId },
    { Authorization: `Bearer ${token}` }
  );
  if (session.status !== 200 || !session.data.sessionId) {
    return {
      status: session.status,
      data: session.data
    };
  }

  const turn = await postJson(
    baseUrl,
    "/api/merchant/strategy-chat/messages",
    {
      merchantId,
      content
    },
    { Authorization: `Bearer ${token}` }
  );

  if (
    turn.status === 200 &&
    turn.data &&
    turn.data.status === "PENDING_REVIEW" &&
    turn.data.pendingReview
  ) {
    return {
      status: 200,
      data: {
        status: "PENDING",
        proposalId: turn.data.pendingReview.proposalId || null,
        campaignId: turn.data.pendingReview.campaignId || null,
        templateId: turn.data.pendingReview.templateId || null,
        branchId: turn.data.pendingReview.branchId || null,
        sessionId: session.data.sessionId,
        _rawChatTurn: turn.data
      }
    };
  }

  return {
    status: turn.status,
    data: {
      ...turn.data,
      sessionId: session.data.sessionId
    }
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

async function mockLogin(_baseUrl, role, options = {}) {
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

function createFakeSocialAuthServiceWithoutPhone() {
  return {
    verifyWeChatMiniAppCode: async (code) => ({
      provider: "WECHAT_MINIAPP",
      subject: `wxmini_${String(code || "")}`,
      unionId: null
    }),
    verifyAlipayCode: async (code) => ({
      provider: "ALIPAY",
      subject: `alipay_${String(code || "")}`,
      unionId: null
    }),
  };
}

function waitForWebSocketOpen(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timeout")), timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("websocket open failed"));
    };
  });
}

function waitForWebSocketMessage(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket message timeout")), timeoutMs);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      resolve(String(event.data || ""));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    };
  });
}

function signCallback(payload, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSnapshotBackedDbFactory(initialSnapshot = null) {
  let snapshot = initialSnapshot ? cloneJson(initialSnapshot) : null;
  return {
    createDb() {
      const db = createInMemoryDb(snapshot ? cloneJson(snapshot) : null);
      db.save = () => {
        snapshot = cloneJson(db.serialize());
      };
      db.save();
      return db;
    }
  };
}

function safeParseJson(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function extractAiUserPayload(messages) {
  if (!Array.isArray(messages)) {
    return {};
  }
  const user = messages.find((item) => item && item.role === "user");
  const parsed = safeParseJson(user && user.content);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function pickAiDecision(payload) {
  const intent = String(payload.intent || "").toLowerCase();
  const requestedTemplate = String(payload.templateId || "").trim();
  const requestedBranch = String(payload.branchId || "").trim();
  const isCoolingIntent =
    intent.includes("\u9ad8\u6e29") ||
    intent.includes("\u6e05\u51c9") ||
    intent.includes("temperature") ||
    intent.includes("weather");

  const templateId =
    requestedTemplate || (isCoolingIntent ? "activation_contextual_drop" : "activation_member_day");
  const branchId =
    requestedBranch ||
    (templateId === "activation_contextual_drop" ? "COOLING" : "ASSET_BOOM");

  return {
    templateId,
    branchId,
    title: "AI Strategy Proposal",
    rationale: "Mock AI response for integration testing.",
    confidence: 0.86,
    campaignPatch: {
      name: "AI Strategy Draft",
      priority: 82,
      budget: {
        cap: 180,
        used: 0,
        costPerHit: 9,
      },
    },
  };
}

function pickAiChatDecision(payload) {
  const message = String(payload.userMessage || "").toLowerCase();
  const approvedCount = Array.isArray(payload.approvedStrategies)
    ? payload.approvedStrategies.length
    : 0;

  const shouldDraft =
    message.includes("generate") ||
    message.includes("create") ||
    message.includes("draft") ||
    message.includes("strategy");
  const wantsExtreme =
    message.includes("extreme") ||
    message.includes("huge budget") ||
    message.includes("aggressive");

  if (!shouldDraft) {
    return {
      mode: "CHAT_REPLY",
      assistantMessage:
        approvedCount > 0
          ? `Noted. You already approved ${approvedCount} strategy(ies). Tell me what to optimize next.`
          : "Please share goal, budget, and time window. I can then draft a strategy.",
    };
  }

  const proposalBranch = approvedCount > 0 ? "COMFORT" : "COOLING";
  const proposalTitle = approvedCount > 0 ? "Second Wave Strategy" : "First Wave Strategy";

  return {
    mode: "PROPOSAL",
    assistantMessage: "I drafted a strategy proposal card. Please approve or reject now.",
    proposal: {
      templateId: "activation_contextual_drop",
      branchId: proposalBranch,
      title: proposalTitle,
      rationale: "Mock chat strategy proposal.",
      confidence: 0.81,
      campaignPatch: {
        name: proposalTitle,
        priority: wantsExtreme ? 999 : approvedCount > 0 ? 84 : 82,
        budget: {
          cap: wantsExtreme ? 9999 : approvedCount > 0 ? 140 : 120,
          used: 0,
          costPerHit: wantsExtreme ? 500 : 10,
        },
      },
    },
  };
}

async function startMockAiServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || !/\/chat\/completions$/.test(String(req.url || ""))) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk || "");
    });
    req.on("end", () => {
      const parsed = safeParseJson(body);
      if (!parsed || typeof parsed !== "object") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid json" }));
        return;
      }
      const payload = extractAiUserPayload(parsed.messages);
      const decision =
        payload && payload.task === "STRATEGY_CHAT"
          ? pickAiChatDecision(payload)
          : pickAiDecision(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "mock-chatcmpl-1",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(decision),
              },
              finish_reason: "stop",
            },
          ],
        }),
      );
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock ai server address unavailable");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("http flow: quote -> verify -> refund -> confirm proposal -> trigger", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const ownerToken = await mockLogin(baseUrl, "OWNER");

    const quote = await postJson(
      baseUrl,
      "/api/payment/quote",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 52
      },
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(quote.status, 200);
    assert.ok(quote.data.selectedVoucher);

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 52
      },
      {
        "Idempotency-Key": "pay_case_1",
        Authorization: `Bearer ${customerToken}`
      }
    );
    assert.equal(verify.status, 200);
    assert.ok(verify.data.paymentTxnId);

    const refund = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        paymentTxnId: verify.data.paymentTxnId,
        refundAmount: 20
      },
      {
        "Idempotency-Key": "refund_case_1",
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(refund.status, 200);
    assert.ok(refund.data.clawback);

    const confirm = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      {
        merchantId: "m_store_001",
        operatorId: "staff_owner"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(confirm.status, 200);
    assert.equal(confirm.data.status, "APPROVED");

    const trigger = await postJson(
      baseUrl,
      "/api/tca/trigger",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        event: "WEATHER_CHANGE",
        context: { weather: "RAIN" }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(trigger.status, 200);
    assert.ok(trigger.data.executed.includes("campaign_rainy_hot_soup"));
  } finally {
    await app.stop();
  }
});

test("rbac: clerk cannot confirm proposal, manager can refund", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const clerkToken = await mockLogin(baseUrl, "CLERK");
    const managerToken = await mockLogin(baseUrl, "MANAGER");

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 52 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rbac_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    const confirmByClerk = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    assert.equal(confirmByClerk.status, 403);
    assert.equal(confirmByClerk.data.error, "permission denied");

    const refundByManager = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        paymentTxnId: verify.data.paymentTxnId,
        refundAmount: 5
      },
      {
        Authorization: `Bearer ${managerToken}`,
        "Idempotency-Key": "rbac_refund_1"
      }
    );
    assert.equal(refundByManager.status, 200);
  } finally {
    await app.stop();
  }
});

test("websocket push receives payment event", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const ownerToken = await mockLogin(baseUrl, "OWNER");
    const wsUrl = `ws://127.0.0.1:${port}/ws?merchantId=m_store_001&token=${encodeURIComponent(ownerToken)}`;

    const ws = new WebSocket(wsUrl);
    await waitForWebSocketOpen(ws);

    const status = await getJson(baseUrl, "/api/ws/status?merchantId=m_store_001", {
      Authorization: `Bearer ${ownerToken}`
    });
    assert.equal(status.status, 200);
    assert.ok(status.data.onlineCount >= 1);

    const statusDeniedByScope = await getJson(
      baseUrl,
      "/api/ws/status?merchantId=m_bistro",
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(statusDeniedByScope.status, 403);
    assert.equal(statusDeniedByScope.data.error, "merchant scope denied");

    const messagePromise = waitForWebSocketMessage(ws);

    await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 30 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "ws_pay_1"
      }
    );

    const rawMessage = await messagePromise;
    const message = JSON.parse(rawMessage);
    assert.equal(message.type, "PAYMENT_VERIFIED");
    ws.close();
  } finally {
    await app.stop();
  }
});

test("protected endpoint rejects missing token", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await postJson(baseUrl, "/api/payment/quote", {
      merchantId: "m_store_001",
      userId: "u_fixture_001",
      orderAmount: 30
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.error, "Authorization Bearer token is required");
  } finally {
    await app.stop();
  }
});

test("customer wechat login binds phone as primary identity", async () => {
  const app = createAppServer({
    persist: false,
    socialAuthService: createFakeSocialAuthService()
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const firstLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId: "m_store_001",
      code: "mini_code_1"
    });
    assert.equal(firstLogin.status, 200);
    assert.equal(firstLogin.data.profile.role, "CUSTOMER");
    assert.equal(firstLogin.data.profile.merchantId, "m_store_001");
    assert.ok(firstLogin.data.profile.userId);
    assert.equal(firstLogin.data.profile.phone, "+8613900000001");
    assert.equal(firstLogin.data.isNewUser, true);

    const secondLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId: "m_store_001",
      code: "mini_code_2"
    });
    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.data.profile.userId, firstLogin.data.profile.userId);
    assert.equal(secondLogin.data.profile.phone, firstLogin.data.profile.phone);
    assert.equal(secondLogin.data.isNewUser, false);

    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=m_store_001&userId=${encodeURIComponent(firstLogin.data.profile.userId)}`,
      { Authorization: `Bearer ${firstLogin.data.token}` }
    );
    assert.equal(state.status, 200);
    assert.equal(state.data.user.uid, firstLogin.data.profile.userId);
  } finally {
    await app.stop();
  }
});

test("customer wechat login is rejected when provider phone is missing", async () => {
  const app = createAppServer({
    persist: false,
    socialAuthService: createFakeSocialAuthServiceWithoutPhone()
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const login = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId: "m_store_001",
      code: "mini_code_without_phone"
    });
    assert.equal(login.status, 400);
    assert.equal(login.data.error, "phone is required for customer login");
  } finally {
    await app.stop();
  }
});

test("customer alipay login merges to same account when phone is the same", async () => {
  const app = createAppServer({
    persist: false,
    socialAuthService: createFakeSocialAuthService()
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const wechatLogin = await postJson(baseUrl, "/api/auth/customer/wechat-login", {
      merchantId: "m_store_001",
      code: "mini_code_shared_phone"
    });
    assert.equal(wechatLogin.status, 200);
    assert.equal(wechatLogin.data.profile.phone, "+8613900000001");
    assert.ok(wechatLogin.data.profile.userId);

    const alipayLogin = await postJson(baseUrl, "/api/auth/customer/alipay-login", {
      merchantId: "m_store_001",
      code: "alipay_code_shared_phone"
    });
    assert.equal(alipayLogin.status, 200);
    assert.equal(alipayLogin.data.profile.phone, "+8613900000001");
    assert.equal(alipayLogin.data.profile.userId, wechatLogin.data.profile.userId);
    assert.equal(alipayLogin.data.isNewUser, false);
  } finally {
    await app.stop();
  }
});

test("merchant phone login issues owner token and enforces merchant scope", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const requestCode = await postJson(baseUrl, "/api/auth/merchant/request-code", {
      phone: "+8613900000000"
    });
    assert.equal(requestCode.status, 200);
    const ownerLoginCode = getIssuedPhoneCode(app, "+8613900000000");
    assert.ok(ownerLoginCode);

    const login = await postJson(baseUrl, "/api/auth/merchant/phone-login", {
      phone: "+8613900000000",
      code: ownerLoginCode,
      merchantId: "m_store_001",
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.profile.role, "OWNER");
    assert.equal(login.data.profile.merchantId, "m_store_001");
    assert.equal(login.data.profile.phone, "+8613900000000");

    const dashboard = await getJson(
      baseUrl,
      "/api/merchant/dashboard?merchantId=m_store_001",
      { Authorization: `Bearer ${login.data.token}` }
    );
    assert.equal(dashboard.status, 200);

    const deniedCrossMerchant = await getJson(
      baseUrl,
      "/api/merchant/dashboard?merchantId=m_bistro",
      { Authorization: `Bearer ${login.data.token}` }
    );
    assert.equal(deniedCrossMerchant.status, 403);
    assert.equal(deniedCrossMerchant.data.error, "merchant scope denied");

    const requestCodeUnknownMerchant = await postJson(baseUrl, "/api/auth/merchant/request-code", {
      phone: "+8613900000000",
    });
    assert.equal(requestCodeUnknownMerchant.status, 200);
    const unknownMerchantCode = getIssuedPhoneCode(app, "+8613900000000");
    assert.ok(unknownMerchantCode);
    const unknownMerchant = await postJson(baseUrl, "/api/auth/merchant/phone-login", {
      phone: "+8613900000000",
      code: unknownMerchantCode,
      merchantId: "m_not_exists"
    });
    assert.equal(unknownMerchant.status, 404);
    assert.equal(unknownMerchant.data.error, "merchant not found");

    const requestCodeNoScope = await postJson(baseUrl, "/api/auth/merchant/request-code", {
      phone: "+8613900000000"
    });
    assert.equal(requestCodeNoScope.status, 200);
    const noScopeCode = getIssuedPhoneCode(app, "+8613900000000");
    assert.ok(noScopeCode);
    const unscopedLogin = await postJson(baseUrl, "/api/auth/merchant/phone-login", {
      phone: "+8613900000000",
      code: noScopeCode
    });
    assert.equal(unscopedLogin.status, 200);
    assert.equal(unscopedLogin.data.profile.merchantId, null);
  } finally {
    await app.stop();
  }
});

test("merchant phone login resolves merchantId automatically by bound contact phone", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const bindPhone = "+8613911111111";
    const ownerToken = await mockLogin(baseUrl, "OWNER", { merchantId: "m_store_001" });
    const contractApply = await postJson(
      baseUrl,
      "/api/merchant/contract/apply",
      {
        merchantId: "m_store_001",
        companyName: "Auto Bind Co",
        licenseNo: "91310000MA1AUTOBIND01",
        settlementAccount: "6222020202020202",
        contactPhone: bindPhone,
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(contractApply.status, 200);

    const requestCode = await postJson(baseUrl, "/api/auth/merchant/request-code", {
      phone: bindPhone
    });
    assert.equal(requestCode.status, 200);
    const bindLoginCode = getIssuedPhoneCode(app, bindPhone);
    assert.ok(bindLoginCode);

    const login = await postJson(baseUrl, "/api/auth/merchant/phone-login", {
      phone: bindPhone,
      code: bindLoginCode,
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.profile.role, "OWNER");
    assert.equal(login.data.profile.merchantId, "m_store_001");
    assert.equal(login.data.profile.phone, bindPhone);

    const dashboard = await getJson(
      baseUrl,
      "/api/merchant/dashboard?merchantId=m_store_001",
      { Authorization: `Bearer ${login.data.token}` }
    );
    assert.equal(dashboard.status, 200);

    const deniedCrossMerchant = await getJson(
      baseUrl,
      "/api/merchant/dashboard?merchantId=m_bistro",
      { Authorization: `Bearer ${login.data.token}` }
    );
    assert.equal(deniedCrossMerchant.status, 403);
  } finally {
    await app.stop();
  }
});

test("merchant onboarding api allows custom store creation for end-to-end testing", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const merchantId = `m_custom_${Date.now()}`;

  try {
    const onboard = await postJson(baseUrl, "/api/merchant/onboard", {
      merchantId,
      name: "Custom Test Store",
      budgetCap: 420,
      ownerPhone: "+8613800000000"
    });
    assert.equal(onboard.status, 201);
    assert.equal(onboard.data.merchant.merchantId, merchantId);
    assert.equal(onboard.data.merchant.name, "Custom Test Store");
    assert.equal(Object.prototype.hasOwnProperty.call(onboard.data, "seededUsers"), false);

    const requestCode = await postJson(baseUrl, "/api/auth/merchant/request-code", {
      phone: "+8613800000000"
    });
    assert.equal(requestCode.status, 200);
    const onboardLoginCode = getIssuedPhoneCode(app, "+8613800000000");
    assert.ok(onboardLoginCode);

    const phoneLogin = await postJson(baseUrl, "/api/auth/merchant/phone-login", {
      phone: "+8613800000000",
      code: onboardLoginCode
    });
    assert.equal(phoneLogin.status, 200);
    assert.ok(phoneLogin.data.token);

    const contractApply = await postJson(
      baseUrl,
      "/api/merchant/contract/apply",
      {
        merchantId,
        companyName: "Custom Test Company",
        licenseNo: "91310000MA1TEST001",
        settlementAccount: "6222020202020202",
        contactPhone: "+8613800000000"
      },
      { Authorization: `Bearer ${phoneLogin.data.token}` }
    );
    assert.equal(contractApply.status, 200);
    assert.equal(contractApply.data.status, "PENDING_REVIEW");

    const contractStatus = await getJson(
      baseUrl,
      `/api/merchant/contract/status?merchantId=${encodeURIComponent(merchantId)}`,
      { Authorization: `Bearer ${phoneLogin.data.token}` }
    );
    assert.equal(contractStatus.status, 200);
    assert.equal(contractStatus.data.status, "PENDING_REVIEW");

    const duplicate = await postJson(baseUrl, "/api/merchant/onboard", {
      merchantId,
      name: "Custom Test Store"
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error, "merchant already exists");

    const ownerToken = await mockLogin(baseUrl, "OWNER", { merchantId });
    assert.ok(ownerToken);
    const state = await getJson(
      baseUrl,
      `/api/state?merchantId=${encodeURIComponent(merchantId)}`,
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(state.status, 200);
    assert.equal(state.data.merchant.merchantId, merchantId);
    assert.equal(state.data.merchant.name, "Custom Test Store");

    const catalog = await getJson(baseUrl, "/api/merchant/catalog");
    assert.equal(catalog.status, 200);
    assert.ok(catalog.data.items.some((item) => item.merchantId === merchantId));
  } finally {
    await app.stop();
  }
});

test("merchant onboarding is preserved across re-logins with persistence", async () => {
  const dbFactory = createSnapshotBackedDbFactory();
  const contactPhone = "+8613766667777";
  const merchantId = "m_persist_test_001";

  // Step 1: Onboard a new merchant
  const app1 = createAppServer({ db: dbFactory.createDb() });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  try {
    const onboard = await postJson(base1, "/api/merchant/onboard", {
      merchantId,
      name: "Persistence Store",
      budgetCap: 500,
      ownerPhone: contactPhone
    });
    assert.equal(onboard.status, 201);

    // SKIP contract application to verify that resolution works 
    // based ONLY on the onboarded data (Owner Phone).
  } finally {
    await app1.stop();
  }

  // Step 2: "Clear data" and "Re-login" - Start a fresh server instance with same DB snapshot
  const app2 = createAppServer({ db: dbFactory.createDb() });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    // Request login code
    const requestCode = await postJson(base2, "/api/auth/merchant/request-code", { phone: contactPhone });
    assert.equal(requestCode.status, 200);

    const code = getIssuedPhoneCode(app2, contactPhone);
    assert.ok(code);

    // Login - should resolve to the existing merchantId
    const login = await postJson(base2, "/api/auth/merchant/phone-login", {
      phone: contactPhone,
      code
    });

    assert.equal(login.status, 200);
    assert.ok(login.data.token);
    assert.equal(login.data.profile.merchantId, merchantId, "Login should automatically resolve to the existing merchantId");

    // Verify access to the store

    // Verify access to the store
    const dashboard = await getJson(base2, `/api/merchant/dashboard?merchantId=${merchantId}`, {
      Authorization: `Bearer ${login.data.token}`
    });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.data.merchantId, merchantId);
  } finally {
    await app2.stop();
  }
});

test("persistent mode keeps state across restarts", async () => {
  const dbFactory = createSnapshotBackedDbFactory();

  const app1 = createAppServer({ db: dbFactory.createDb() });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const customerToken = await mockLogin(base1, "CUSTOMER");
  const verify = await postJson(
    base1,
    "/api/payment/verify",
    {
      merchantId: "m_store_001",
      userId: "u_fixture_001",
      orderAmount: 52
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": "persist_pay_1"
    }
  );
  assert.equal(verify.status, 200);
  await app1.stop();

  const app2 = createAppServer({ db: dbFactory.createDb() });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const customerToken2 = await mockLogin(base2, "CUSTOMER");
    const stateRes = await fetch(
      `${base2}/api/state?merchantId=m_store_001&userId=u_fixture_001`,
      {
        headers: {
          Authorization: `Bearer ${customerToken2}`
        }
      }
    );
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.ok(stateData.user.wallet.principal <= 120);
    assert.ok(stateData.user.vouchers.some((item) => item.status === "USED"));
  } finally {
    await app2.stop();
  }
});

test("persistent mode keeps payment idempotency keys across restarts", async () => {
  const dbFactory = createSnapshotBackedDbFactory();

  const app1 = createAppServer({ db: dbFactory.createDb() });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const customerToken1 = await mockLogin(base1, "CUSTOMER");
  const firstVerify = await postJson(
    base1,
    "/api/payment/verify",
    {
      merchantId: "m_store_001",
      userId: "u_fixture_001",
      orderAmount: 41
    },
    {
      Authorization: `Bearer ${customerToken1}`,
      "Idempotency-Key": "persist_idem_verify_1"
    }
  );
  assert.equal(firstVerify.status, 200);
  assert.ok(firstVerify.data.paymentTxnId);
  await app1.stop();

  const app2 = createAppServer({ db: dbFactory.createDb() });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const customerToken2 = await mockLogin(base2, "CUSTOMER");
    const replayVerify = await postJson(
      base2,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 999
      },
      {
        Authorization: `Bearer ${customerToken2}`,
        "Idempotency-Key": "persist_idem_verify_1"
      }
    );
    assert.equal(replayVerify.status, 200);
    assert.equal(replayVerify.data.paymentTxnId, firstVerify.data.paymentTxnId);
  } finally {
    await app2.stop();
  }
});

test("persistent mode keeps tenant policy across restarts", async () => {
  const dbFactory = createSnapshotBackedDbFactory();

  const app1 = createAppServer({ db: dbFactory.createDb() });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const ownerToken = await mockLogin(base1, "OWNER");
  const policyUpdate = await postJson(
    base1,
    "/api/merchant/tenant-policy",
    {
      merchantId: "m_store_001",
      writeEnabled: false,
      limits: {
        PAYMENT_VERIFY: {
          limit: 1,
          windowMs: 60000
        }
      }
    },
    {
      Authorization: `Bearer ${ownerToken}`
    }
  );
  assert.equal(policyUpdate.status, 200);
  assert.equal(policyUpdate.data.policy.writeEnabled, false);
  await app1.stop();

  const app2 = createAppServer({ db: dbFactory.createDb() });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const ownerToken2 = await mockLogin(base2, "OWNER");
    const policyQuery = await getJson(
      base2,
      "/api/merchant/tenant-policy?merchantId=m_store_001",
      {
        Authorization: `Bearer ${ownerToken2}`
      }
    );
    assert.equal(policyQuery.status, 200);
    assert.equal(policyQuery.data.policy.writeEnabled, false);

    const customerToken2 = await mockLogin(base2, "CUSTOMER");
    const verifyBlocked = await postJson(
      base2,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 20
      },
      {
        Authorization: `Bearer ${customerToken2}`,
        "Idempotency-Key": "persist_policy_pay_1"
      }
    );
    assert.equal(verifyBlocked.status, 403);
    assert.equal(verifyBlocked.data.code, "TENANT_WRITE_DISABLED");
  } finally {
    await app2.stop();
  }
});

test("persistent mode keeps tenant dedicated route after cutover", async () => {
  const dbFactory = createSnapshotBackedDbFactory();

  const app1 = createAppServer({ db: dbFactory.createDb() });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const ownerToken = await mockLogin(base1, "OWNER", {
    merchantId: "m_store_001"
  });
  const cutover = await postJson(
    base1,
    "/api/merchant/migration/cutover",
    {
      merchantId: "m_store_001",
      note: "online cutover"
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(cutover.status, 200);
  assert.equal(cutover.data.dedicatedDbAttached, true);
  assert.ok(cutover.data.dedicatedDbFilePath);

  const customerToken = await mockLogin(base1, "CUSTOMER", {
    merchantId: "m_store_001",
    userId: "u_fixture_001"
  });
  const verifyAfterCutover = await postJson(
    base1,
    "/api/payment/verify",
    {
      merchantId: "m_store_001",
      userId: "u_fixture_001",
      orderAmount: 12
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": "cutover_persist_pay_1"
    }
  );
  assert.equal(verifyAfterCutover.status, 200);
  assert.equal(
    app1.db.paymentsByMerchant.m_store_001[verifyAfterCutover.data.paymentTxnId],
    undefined
  );
  assert.ok(
    app1.tenantRouter.getDbForMerchant("m_store_001").paymentsByMerchant.m_store_001[
    verifyAfterCutover.data.paymentTxnId
    ]
  );
  await app1.stop();

  const app2 = createAppServer({ db: dbFactory.createDb() });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const ownerToken2 = await mockLogin(base2, "OWNER", {
      merchantId: "m_store_001"
    });
    const status = await getJson(
      base2,
      "/api/merchant/migration/status?merchantId=m_store_001",
      { Authorization: `Bearer ${ownerToken2}` }
    );
    assert.equal(status.status, 200);
    assert.equal(status.data.dedicatedDbAttached, true);

    const customerToken2 = await mockLogin(base2, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const verifyAfterRestart = await postJson(
      base2,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 11
      },
      {
        Authorization: `Bearer ${customerToken2}`,
        "Idempotency-Key": "cutover_persist_pay_2"
      }
    );
    assert.equal(verifyAfterRestart.status, 200);
    assert.equal(
      app2.db.paymentsByMerchant.m_store_001[verifyAfterRestart.data.paymentTxnId],
      undefined
    );
    const dedicatedDb = app2.tenantRouter.getDbForMerchant("m_store_001");
    assert.notEqual(dedicatedDb, app2.db);
    assert.ok(
      dedicatedDb.paymentsByMerchant.m_store_001[verifyAfterRestart.data.paymentTxnId]
    );
  } finally {
    await app2.stop();
  }
});

test("migration rollback moves merchant traffic back to shared db", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });

    const cutover = await postJson(
      baseUrl,
      "/api/merchant/migration/cutover",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(cutover.status, 200);
    assert.equal(cutover.data.dedicatedDbAttached, true);

    const payOnDedicated = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 13
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rollback_cutover_pay_1"
      }
    );
    assert.equal(payOnDedicated.status, 200);
    assert.equal(
      app.db.paymentsByMerchant.m_store_001[payOnDedicated.data.paymentTxnId],
      undefined
    );

    const rollback = await postJson(
      baseUrl,
      "/api/merchant/migration/rollback",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(rollback.status, 200);
    assert.equal(rollback.data.dedicatedDbAttached, false);
    assert.equal(rollback.data.migration.phase, "ROLLBACK");

    const statusAfterRollback = await getJson(
      baseUrl,
      "/api/merchant/migration/status?merchantId=m_store_001",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(statusAfterRollback.status, 200);
    assert.equal(statusAfterRollback.data.dedicatedDbAttached, false);

    const payOnShared = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 14
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rollback_cutover_pay_2"
      }
    );
    assert.equal(payOnShared.status, 200);
    assert.ok(app.db.paymentsByMerchant.m_store_001[payOnShared.data.paymentTxnId]);
    assert.equal(app.tenantRouter.getDbForMerchant("m_store_001"), app.db);
  } finally {
    await app.stop();
  }
});

test("tenant isolation: same user id is scoped by merchant", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerFixtureToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const customerBistroToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_fixture_001"
    });
    const bistroOwnerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_bistro"
    });
    const seedBistroUser = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_bistro",
        userId: "u_fixture_001",
        orderAmount: 1
      },
      {
        Authorization: `Bearer ${customerBistroToken}`,
        "Idempotency-Key": "tenant_bistro_seed_pay_1"
      }
    );
    assert.equal(seedBistroUser.status, 200);

    const bistroStateBefore = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_fixture_001",
      { Authorization: `Bearer ${customerBistroToken}` }
    );
    assert.equal(bistroStateBefore.status, 200);
    const bistroPrincipalBefore = bistroStateBefore.data.user.wallet.principal;

    const fixtureVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 52
      },
      {
        Authorization: `Bearer ${customerFixtureToken}`,
        "Idempotency-Key": "tenant_fixture_pay_1"
      }
    );
    assert.equal(fixtureVerify.status, 200);

    const bistroStateAfter = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_fixture_001",
      { Authorization: `Bearer ${customerBistroToken}` }
    );
    assert.equal(bistroStateAfter.status, 200);
    assert.equal(bistroStateAfter.data.user.wallet.principal, bistroPrincipalBefore);

    const crossMerchantRefund = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_bistro",
        userId: "u_fixture_001",
        paymentTxnId: fixtureVerify.data.paymentTxnId,
        refundAmount: 5
      },
      {
        Authorization: `Bearer ${bistroOwnerToken}`,
        "Idempotency-Key": "tenant_cross_refund_1"
      }
    );
    assert.equal(crossMerchantRefund.status, 400);
    assert.equal(crossMerchantRefund.data.error, "payment not found");
  } finally {
    await app.stop();
  }
});

test("tenant router: routes merchant to dedicated db", async () => {
  const defaultDb = createInMemoryDb();
  const bistroDb = createInMemoryDb();
  seedLegacyTestUsers(defaultDb);
  seedLegacyTestUsers(bistroDb);
  bistroDb.merchantUsers.m_bistro.u_fixture_001 = {
    uid: "u_fixture_001",
    displayName: "Fixture User",
    wallet: { principal: 80, bonus: 0, silver: 0 },
    tags: ["REGULAR"],
    fragments: { spicy: 0, noodle: 0 },
    vouchers: [],
  };
  bistroDb.merchantUsers.m_bistro.u_fixture_001.wallet.principal = 999;

  const app = createAppServer({
    db: defaultDb,
    tenantDbMap: {
      m_bistro: bistroDb
    }
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const bistroCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_fixture_001"
    });

    const before = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_fixture_001",
      { Authorization: `Bearer ${bistroCustomer}` }
    );
    assert.equal(before.status, 200);
    assert.equal(before.data.user.wallet.principal, 999);

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_bistro",
        userId: "u_fixture_001",
        orderAmount: 20
      },
      {
        Authorization: `Bearer ${bistroCustomer}`,
        "Idempotency-Key": "tenant_router_bistro_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    assert.equal(defaultDb.merchantUsers.m_bistro.u_fixture_001.wallet.principal, 80);
    assert.ok(
      bistroDb.paymentsByMerchant.m_bistro[verify.data.paymentTxnId],
      "payment should be stored in dedicated bistro db"
    );
    assert.equal(
      defaultDb.paymentsByMerchant.m_bistro[verify.data.paymentTxnId],
      undefined
    );
  } finally {
    await app.stop();
  }
});

test("audit log records success and denied high-risk operations", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const clerkToken = await mockLogin(baseUrl, "CLERK");
    const ownerToken = await mockLogin(baseUrl, "OWNER");

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 25 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "audit_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    const deniedConfirm = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    assert.equal(deniedConfirm.status, 403);

    const killSwitch = await postJson(
      baseUrl,
      "/api/merchant/kill-switch",
      { merchantId: "m_store_001", enabled: true },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(killSwitch.status, 200);

    const logs = app.db.auditLogs.filter((item) => item.merchantId === "m_store_001");
    assert.ok(logs.some((item) => item.action === "PAYMENT_VERIFY" && item.status === "SUCCESS"));
    assert.ok(logs.some((item) => item.action === "PROPOSAL_CONFIRM" && item.status === "DENIED"));
    assert.ok(logs.some((item) => item.action === "KILL_SWITCH_SET" && item.status === "SUCCESS"));
  } finally {
    await app.stop();
  }
});

test("audit log endpoint supports pagination and denies customer access", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const clerkToken = await mockLogin(baseUrl, "CLERK");
    const ownerToken = await mockLogin(baseUrl, "OWNER");

    await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 21 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "audit_page_pay_1"
      }
    );
    await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    await postJson(
      baseUrl,
      "/api/merchant/kill-switch",
      { merchantId: "m_store_001", enabled: true },
      { Authorization: `Bearer ${ownerToken}` }
    );

    const firstPage = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_store_001&limit=2",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.data.items.length, 2);
    assert.equal(firstPage.data.pageInfo.limit, 2);
    assert.equal(typeof firstPage.data.pageInfo.hasMore, "boolean");
    assert.ok(firstPage.data.items[0].timestamp >= firstPage.data.items[1].timestamp);

    if (firstPage.data.pageInfo.hasMore) {
      const secondPage = await getJson(
        baseUrl,
        `/api/audit/logs?merchantId=m_store_001&limit=2&cursor=${encodeURIComponent(firstPage.data.pageInfo.nextCursor)}`,
        { Authorization: `Bearer ${ownerToken}` }
      );
      assert.equal(secondPage.status, 200);
      assert.ok(secondPage.data.items.length >= 1);
    }

    const deniedForCustomer = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_store_001&limit=2",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(deniedForCustomer.status, 403);
    assert.equal(deniedForCustomer.data.error, "permission denied");

    const deniedByScope = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_bistro&limit=2",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(deniedByScope.status, 403);
    assert.equal(deniedByScope.data.error, "merchant scope denied");

    const filtered = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_store_001&limit=10&action=KILL_SWITCH_SET&status=SUCCESS",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(filtered.status, 200);
    assert.ok(filtered.data.items.length >= 1);
    assert.ok(
      filtered.data.items.every(
        (item) => item.action === "KILL_SWITCH_SET" && item.status === "SUCCESS"
      )
    );
  } finally {
    await app.stop();
  }
});

test("tenant policy api: owner can update own merchant policy and scope is enforced", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });
    const managerToken = await mockLogin(baseUrl, "MANAGER", {
      merchantId: "m_store_001"
    });

    const updateByOwner = await postJson(
      baseUrl,
      "/api/merchant/tenant-policy",
      {
        merchantId: "m_store_001",
        writeEnabled: false,
        limits: {
          PAYMENT_VERIFY: {
            limit: 2,
            windowMs: 60000
          }
        }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(updateByOwner.status, 200);
    assert.equal(updateByOwner.data.policy.writeEnabled, false);
    assert.equal(updateByOwner.data.policy.limits.PAYMENT_VERIFY.limit, 2);

    const queryByOwner = await getJson(
      baseUrl,
      "/api/merchant/tenant-policy?merchantId=m_store_001",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(queryByOwner.status, 200);
    assert.equal(queryByOwner.data.policy.writeEnabled, false);

    const crossScopeDenied = await getJson(
      baseUrl,
      "/api/merchant/tenant-policy?merchantId=m_bistro",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(crossScopeDenied.status, 403);
    assert.equal(crossScopeDenied.data.error, "merchant scope denied");

    const managerDenied = await postJson(
      baseUrl,
      "/api/merchant/tenant-policy",
      {
        merchantId: "m_store_001",
        writeEnabled: true
      },
      { Authorization: `Bearer ${managerToken}` }
    );
    assert.equal(managerDenied.status, 403);
    assert.equal(managerDenied.data.error, "permission denied");
  } finally {
    await app.stop();
  }
});

test("migration runbook api: freeze/unfreeze updates policy and status", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });
    const managerToken = await mockLogin(baseUrl, "MANAGER", {
      merchantId: "m_store_001"
    });
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });

    const initialStatus = await getJson(
      baseUrl,
      "/api/merchant/migration/status?merchantId=m_store_001",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(initialStatus.status, 200);
    assert.equal(initialStatus.data.migration.phase, "IDLE");

    const freezeStep = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      {
        merchantId: "m_store_001",
        step: "FREEZE_WRITE",
        note: "prepare migration window"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(freezeStep.status, 200);
    assert.equal(freezeStep.data.migration.phase, "FROZEN");
    assert.equal(freezeStep.data.policy.writeEnabled, false);

    const verifyBlocked = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 10 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "migration_freeze_pay_1"
      }
    );
    assert.equal(verifyBlocked.status, 403);
    assert.equal(verifyBlocked.data.code, "TENANT_WRITE_DISABLED");

    const unfreezeStep = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      {
        merchantId: "m_store_001",
        step: "UNFREEZE_WRITE",
        note: "migration completed"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(unfreezeStep.status, 200);
    assert.equal(unfreezeStep.data.migration.phase, "RUNNING");
    assert.equal(unfreezeStep.data.policy.writeEnabled, true);

    const verifyRecovered = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 10 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "migration_unfreeze_pay_1"
      }
    );
    assert.equal(verifyRecovered.status, 200);

    const managerDenied = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      { merchantId: "m_store_001", step: "FREEZE_WRITE" },
      { Authorization: `Bearer ${managerToken}` }
    );
    assert.equal(managerDenied.status, 403);
    assert.equal(managerDenied.data.error, "permission denied");

    const crossScopePinned = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      { merchantId: "m_bistro", step: "FREEZE_WRITE" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(crossScopePinned.status, 200);
    assert.equal(crossScopePinned.data.merchantId, "m_store_001");
  } finally {
    await app.stop();
  }
});

test("tenant policy: read-only merchant blocks write operations", async () => {
  const app = createAppServer({
    persist: false,
    tenantPolicyMap: {
      m_store_001: {
        writeEnabled: false
      }
    }
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");

    const quote = await postJson(
      baseUrl,
      "/api/payment/quote",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 30 },
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(quote.status, 200);

    const verifyBlocked = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 30 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "policy_read_only_pay_1"
      }
    );
    assert.equal(verifyBlocked.status, 403);
    assert.equal(
      verifyBlocked.data.error,
      "merchant is read-only during migration"
    );
    assert.equal(verifyBlocked.data.code, "TENANT_WRITE_DISABLED");

    const blockedLog = app.db.auditLogs.find(
      (item) =>
        item.merchantId === "m_store_001" &&
        item.action === "PAYMENT_VERIFY" &&
        item.status === "BLOCKED"
    );
    assert.ok(blockedLog);
  } finally {
    await app.stop();
  }
});

test("tenant policy: per-merchant write rate limit returns 429", async () => {
  const app = createAppServer({
    persist: false,
    tenantPolicyMap: {
      m_store_001: {
        limits: {
          PAYMENT_VERIFY: {
            limit: 1,
            windowMs: 5 * 60 * 1000
          }
        }
      }
    }
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const fixtureCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const bistroCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_fixture_001"
    });

    const firstVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 10 },
      {
        Authorization: `Bearer ${fixtureCustomer}`,
        "Idempotency-Key": "policy_limit_pay_1"
      }
    );
    assert.equal(firstVerify.status, 200);

    const secondVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 9 },
      {
        Authorization: `Bearer ${fixtureCustomer}`,
        "Idempotency-Key": "policy_limit_pay_2"
      }
    );
    assert.equal(secondVerify.status, 429);
    assert.equal(secondVerify.data.code, "TENANT_RATE_LIMITED");

    const bistroVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_bistro", userId: "u_fixture_001", orderAmount: 8 },
      {
        Authorization: `Bearer ${bistroCustomer}`,
        "Idempotency-Key": "policy_limit_bistro_pay_1"
      }
    );
    assert.equal(bistroVerify.status, 200);
  } finally {
    await app.stop();
  }
});

test("external callback signature settles pending payment and enables invoice/refund", async () => {
  const callbackSecret = "test-callback-secret";
  const app = createAppServer({
    persist: false,
    paymentCallbackSecret: callbackSecret
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER");
    const ownerToken = await mockLogin(baseUrl, "OWNER");

    const verifyPending = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_store_001", userId: "u_fixture_001", orderAmount: 500 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "external_pending_pay_1"
      }
    );
    assert.equal(verifyPending.status, 200);
    assert.equal(verifyPending.data.status, "PENDING_EXTERNAL");
    assert.ok(verifyPending.data.externalPayment.paymentIntentId);

    const invoiceDeniedBeforeSettle = await postJson(
      baseUrl,
      "/api/invoice/issue",
      { merchantId: "m_store_001", paymentTxnId: verifyPending.data.paymentTxnId },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(invoiceDeniedBeforeSettle.status, 400);
    assert.equal(invoiceDeniedBeforeSettle.data.error, "payment is not settled");

    const invalidCallback = await postJson(
      baseUrl,
      "/api/payment/callback",
      {
        merchantId: "m_store_001",
        paymentTxnId: verifyPending.data.paymentTxnId,
        externalTxnId: "wxpay_1001",
        status: "SUCCESS",
        paidAmount: verifyPending.data.quote.payable,
        callbackId: "cb_invalid_1"
      },
      {
        "X-Payment-Signature": "invalid-signature"
      }
    );
    assert.equal(invalidCallback.status, 401);
    assert.equal(invalidCallback.data.error, "invalid callback signature");

    const callbackBody = {
      merchantId: "m_store_001",
      paymentTxnId: verifyPending.data.paymentTxnId,
      externalTxnId: "wxpay_1001",
      status: "SUCCESS",
      paidAmount: verifyPending.data.quote.payable,
      callbackId: "cb_ok_1"
    };
    const callback = await postJson(
      baseUrl,
      "/api/payment/callback",
      callbackBody,
      {
        "X-Payment-Signature": signCallback(callbackBody, callbackSecret)
      }
    );
    assert.equal(callback.status, 200);
    assert.equal(callback.data.status, "PAID");

    const invoiceIssued = await postJson(
      baseUrl,
      "/api/invoice/issue",
      {
        merchantId: "m_store_001",
        paymentTxnId: verifyPending.data.paymentTxnId,
        title: "MealQuest Invoice",
        taxNo: "91330100TEST",
        email: "user@example.com"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(invoiceIssued.status, 200);
    assert.ok(invoiceIssued.data.invoiceNo);

    const refundAfterSettle = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        paymentTxnId: verifyPending.data.paymentTxnId,
        refundAmount: 10
      },
      {
        Authorization: `Bearer ${ownerToken}`,
        "Idempotency-Key": "external_refund_after_callback_1"
      }
    );
    assert.equal(refundAfterSettle.status, 200);
  } finally {
    await app.stop();
  }
});

test("customer can query own payment ledger and invoices with strict scope", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 1
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "customer_center_pay_1"
      }
    );
    assert.equal(verify.status, 200);
    assert.equal(verify.data.status, "PAID");

    const issueInvoice = await postJson(
      baseUrl,
      "/api/invoice/issue",
      {
        merchantId: "m_store_001",
        paymentTxnId: verify.data.paymentTxnId,
        title: "Customer Center Invoice"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(issueInvoice.status, 200);
    assert.ok(issueInvoice.data.invoiceNo);

    const customerLedger = await getJson(
      baseUrl,
      "/api/payment/ledger?merchantId=m_store_001&limit=10",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerLedger.status, 200);
    assert.ok(Array.isArray(customerLedger.data.items));
    assert.ok(customerLedger.data.items.length >= 1);
    assert.ok(customerLedger.data.items.every((row) => row.userId === "u_fixture_001"));

    const customerInvoices = await getJson(
      baseUrl,
      "/api/invoice/list?merchantId=m_store_001&limit=10",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerInvoices.status, 200);
    assert.ok(Array.isArray(customerInvoices.data.items));
    assert.ok(customerInvoices.data.items.some((item) => item.invoiceNo === issueInvoice.data.invoiceNo));

    const customerInvoiceDeniedByUserScope = await getJson(
      baseUrl,
      "/api/invoice/list?merchantId=m_store_001&userId=u_fixture_002",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerInvoiceDeniedByUserScope.status, 403);
    assert.equal(customerInvoiceDeniedByUserScope.data.error, "user scope denied");

    const customerLedgerDeniedByMerchantScope = await getJson(
      baseUrl,
      "/api/payment/ledger?merchantId=m_bistro",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerLedgerDeniedByMerchantScope.status, 403);
    assert.equal(customerLedgerDeniedByMerchantScope.data.error, "merchant scope denied");
  } finally {
    await app.stop();
  }
});

test("privacy export and delete are owner-only and scoped", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", { merchantId: "m_store_001" });
    const managerToken = await mockLogin(baseUrl, "MANAGER", { merchantId: "m_store_001" });
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001",
    });

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 1,
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "privacy_seed_user_1",
      },
    );
    assert.equal(verify.status, 200);

    const managerDenied = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_store_001", userId: "u_fixture_001" },
      { Authorization: `Bearer ${managerToken}` }
    );
    assert.equal(managerDenied.status, 403);
    assert.equal(managerDenied.data.error, "permission denied");

    const exported = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_store_001", userId: "u_fixture_001" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(exported.status, 200);
    assert.equal(exported.data.user.uid, "u_fixture_001");

    const deleted = await postJson(
      baseUrl,
      "/api/privacy/delete-user",
      { merchantId: "m_store_001", userId: "u_fixture_001" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.deleted, true);

    const exportedAfterDelete = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_store_001", userId: "u_fixture_001" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(exportedAfterDelete.status, 200);
    assert.equal(exportedAfterDelete.data.user.isDeleted, true);
    assert.deepEqual(exportedAfterDelete.data.user.tags, []);
  } finally {
    await app.stop();
  }
});

test("customer can cancel account and keep transactional records anonymized", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 24
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "privacy_cancel_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    const cancel = await postJson(
      baseUrl,
      "/api/privacy/cancel-account",
      {
        merchantId: "m_store_001"
      },
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.deleted, true);
    assert.equal(
      cancel.data.anonymizedUserId,
      "DELETED_m_store_001_u_fixture_001"
    );

    const stateAfterCancel = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(stateAfterCancel.status, 404);
    assert.equal(stateAfterCancel.data.error, "user not found");

    const payment = app.db.paymentsByMerchant.m_store_001[verify.data.paymentTxnId];
    assert.equal(payment.userId, "DELETED_m_store_001_u_fixture_001");

    const ownerExportAfterCancel = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(ownerExportAfterCancel.status, 400);
    assert.equal(ownerExportAfterCancel.data.error, "user not found");

    const cancelAudit = app.db.auditLogs.find(
      (item) => item.action === "PRIVACY_CANCEL" && item.status === "SUCCESS"
    );
    assert.ok(cancelAudit);
  } finally {
    await app.stop();
  }
});

test("strategy chat supports proposal generation, confirm and campaign status control", async () => {
  const aiStub = await startMockAiServer();
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "openai_compatible",
      baseUrl: aiStub.baseUrl,
      model: "test-model",
      timeoutMs: 1500,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });

    const proposal = await createStrategyProposalThroughChat(baseUrl, ownerToken, {
      merchantId: "m_store_001",
      content: "Please create a cooling strategy proposal for high temperature campaign."
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "PENDING");
    assert.ok(proposal.data.proposalId);
    assert.ok(proposal.data.campaignId);
    assert.ok(proposal.data.sessionId);

    const confirm = await postJson(
      baseUrl,
      `/api/merchant/strategy-chat/proposals/${proposal.data.proposalId}/review`,
      {
        merchantId: "m_store_001",
        decision: "APPROVE"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(confirm.status, 200);
    assert.equal(confirm.data.status, "APPROVED");
    assert.equal(confirm.data.campaignId, proposal.data.campaignId);

    const pauseCampaign = await postJson(
      baseUrl,
      `/api/merchant/campaigns/${proposal.data.campaignId}/status`,
      {
        merchantId: "m_store_001",
        status: "PAUSED"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(pauseCampaign.status, 200);
    assert.equal(pauseCampaign.data.status, "PAUSED");

    const triggerWhenPaused = await postJson(
      baseUrl,
      "/api/tca/trigger",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        event: "APP_OPEN",
        context: {
          weather: "SUNNY",
          temperature: 35
        }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(triggerWhenPaused.status, 200);
    assert.equal(triggerWhenPaused.data.executed.includes(proposal.data.campaignId), false);

    const activateCampaign = await postJson(
      baseUrl,
      `/api/merchant/campaigns/${proposal.data.campaignId}/status`,
      {
        merchantId: "m_store_001",
        status: "ACTIVE"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(activateCampaign.status, 200);
    assert.equal(activateCampaign.data.status, "ACTIVE");

    const triggerWhenActive = await postJson(
      baseUrl,
      "/api/tca/trigger",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        event: "APP_OPEN",
        context: {
          weather: "SUNNY",
          temperature: 35
        }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(triggerWhenActive.status, 200);
    assert.ok(triggerWhenActive.data.executed.includes(proposal.data.campaignId));
  } finally {
    await app.stop();
    await stopServer(aiStub.server);
  }
});

test("strategy proposal supports intent-only AI generation", async () => {
  const aiStub = await startMockAiServer();
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "openai_compatible",
      baseUrl: aiStub.baseUrl,
      model: "test-model",
      timeoutMs: 1500,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });

    const proposal = await createStrategyProposalThroughChat(baseUrl, ownerToken, {
      merchantId: "m_store_001",
      content: "Please create a cooling voucher strategy draft for hot weather tomorrow."
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "PENDING");
    assert.ok(proposal.data.proposalId);
    assert.ok(proposal.data.templateId);
    assert.ok(proposal.data.branchId);
    assert.ok(proposal.data.campaignId);

    const state = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(state.status, 200);
    const createdProposal = (state.data.proposals || []).find(
      (item) => item.id === proposal.data.proposalId
    );
    assert.ok(createdProposal);
    assert.equal(createdProposal.strategyMeta.source, "AI_MODEL");
  } finally {
    await app.stop();
    await stopServer(aiStub.server);
  }
});

test("strategy proposal returns AI_UNAVAILABLE when remote ai is unavailable", async () => {
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "deepseek",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "deepseek-chat",
      apiKey: "test_key",
      timeoutMs: 200,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001",
    });
    const beforeState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(beforeState.status, 200);
    const beforeCount = Array.isArray(beforeState.data.proposals)
      ? beforeState.data.proposals.length
      : 0;

    const proposal = await createStrategyProposalThroughChat(baseUrl, ownerToken, {
      merchantId: "m_store_001",
      content: "请生成明天午市拉新策略，预算200内"
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "AI_UNAVAILABLE");
    assert.ok(proposal.data.reason);

    const afterState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(afterState.status, 200);
    const afterCount = Array.isArray(afterState.data.proposals)
      ? afterState.data.proposals.length
      : 0;
    assert.equal(afterCount, beforeCount);
  } finally {
    await app.stop();
  }
});

test("strategy proposal asks clarification when intent is ambiguous", async () => {
  const aiStub = await startMockAiServer();
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "openai_compatible",
      baseUrl: aiStub.baseUrl,
      model: "test-model",
      timeoutMs: 1500,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001",
    });
    const beforeState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(beforeState.status, 200);
    const beforeCount = Array.isArray(beforeState.data.proposals)
      ? beforeState.data.proposals.length
      : 0;

    const proposal = await createStrategyProposalThroughChat(baseUrl, ownerToken, {
      merchantId: "m_store_001",
      content: "搞活动"
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "CHAT_REPLY");
    assert.ok(Array.isArray(proposal.data.deltaMessages));
    assert.ok(proposal.data.deltaMessages.length >= 2);

    const afterState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(afterState.status, 200);
    const afterCount = Array.isArray(afterState.data.proposals)
      ? afterState.data.proposals.length
      : 0;
    assert.equal(afterCount, beforeCount);
  } finally {
    await app.stop();
    await stopServer(aiStub.server);
  }
});

test("strategy proposal is blocked by risk guardrail on extreme overrides", async () => {
  const aiStub = await startMockAiServer();
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "openai_compatible",
      baseUrl: aiStub.baseUrl,
      model: "test-model",
      timeoutMs: 1500,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001",
    });

    const proposal = await createStrategyProposalThroughChat(baseUrl, ownerToken, {
      merchantId: "m_store_001",
      content: "Create an extreme strategy draft with huge budget now"
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "BLOCKED");
    assert.ok(Array.isArray(proposal.data.reasons));
    assert.ok(proposal.data.reasons.length >= 1);
  } finally {
    await app.stop();
    await stopServer(aiStub.server);
  }
});

test("strategy chat supports multi-turn proposal drafting, immediate review, and new session reset", async () => {
  const aiStub = await startMockAiServer();
  const app = createAppServer({
    persist: false,
    aiStrategyOptions: {
      provider: "openai_compatible",
      baseUrl: aiStub.baseUrl,
      model: "test-model",
      timeoutMs: 1500,
    },
  });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001",
    });

    const createSession = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/sessions",
      {
        merchantId: "m_store_001",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(createSession.status, 200);
    assert.ok(createSession.data.sessionId);
    assert.equal(createSession.data.pendingReview, null);
    assert.ok(Array.isArray(createSession.data.pendingReviews));
    assert.equal(createSession.data.pendingReviews.length, 0);
    assert.ok(Number(createSession.data.messageCount) >= 1);
    const sessionId = createSession.data.sessionId;

    const firstPage = await getJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages?merchantId=m_store_001&limit=5",
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(firstPage.status, 200);
    assert.ok(Array.isArray(firstPage.data.items));
    assert.ok(firstPage.data.items.length >= 1);

    const turn1 = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages",
      {
        merchantId: "m_store_001",
        content: "We need to improve afternoon traffic.",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(turn1.status, 200);
    assert.equal(turn1.data.status, "CHAT_REPLY");
    assert.equal(turn1.data.sessionId, sessionId);

    const turn2 = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages",
      {
        merchantId: "m_store_001",
        content: "Please create a strategy proposal now.",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(turn2.status, 200);
    assert.equal(turn2.data.status, "PENDING_REVIEW");
    assert.ok(turn2.data.pendingReview);
    assert.ok(turn2.data.pendingReview.proposalId);
    const firstProposalId = turn2.data.pendingReview.proposalId;

    const blockedByReview = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages",
      {
        merchantId: "m_store_001",
        content: "Create one more before review.",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(blockedByReview.status, 200);
    assert.equal(blockedByReview.data.status, "REVIEW_REQUIRED");
    assert.equal(blockedByReview.data.pendingReview.proposalId, firstProposalId);

    const reject = await postJson(
      baseUrl,
      `/api/merchant/strategy-chat/proposals/${encodeURIComponent(firstProposalId)}/review`,
      {
        merchantId: "m_store_001",
        decision: "REJECT",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(reject.status, 200);
    assert.equal(reject.data.status, "REJECTED");
    assert.equal(reject.data.pendingReview, null);

    const turn3 = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages",
      {
        merchantId: "m_store_001",
        content: "Create another strategy draft.",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(turn3.status, 200);
    assert.equal(turn3.data.status, "PENDING_REVIEW");
    assert.ok(turn3.data.pendingReview);
    const secondProposalId = turn3.data.pendingReview.proposalId;

    const approve = await postJson(
      baseUrl,
      `/api/merchant/strategy-chat/proposals/${encodeURIComponent(secondProposalId)}/review`,
      {
        merchantId: "m_store_001",
        decision: "APPROVE",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(approve.status, 200);
    assert.equal(approve.data.status, "APPROVED");
    assert.ok(approve.data.campaignId);

    const turn4 = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/messages",
      {
        merchantId: "m_store_001",
        content: "Create another strategy draft.",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(turn4.status, 200);
    assert.equal(turn4.data.status, "PENDING_REVIEW");
    assert.ok(turn4.data.pendingReview);
    assert.equal(turn4.data.pendingReview.branchId, "COMFORT");

    const newSession = await postJson(
      baseUrl,
      "/api/merchant/strategy-chat/sessions",
      {
        merchantId: "m_store_001",
      },
      { Authorization: `Bearer ${ownerToken}` },
    );
    assert.equal(newSession.status, 200);
    assert.notEqual(newSession.data.sessionId, sessionId);
    assert.equal(newSession.data.pendingReview, null);
    assert.ok(Array.isArray(newSession.data.pendingReviews));
    assert.equal(newSession.data.pendingReviews.length, 0);
    assert.equal(newSession.data.messageCount, 1);
  } finally {
    await app.stop();
    await stopServer(aiStub.server);
  }
});

test("supplier verify and fire-sale endpoints work in merchant scope", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_store_001"
    });

    const verifyPartnerOrder = await postJson(
      baseUrl,
      "/api/supplier/verify-order",
      {
        merchantId: "m_store_001",
        partnerId: "partner_coffee",
        orderId: "ext_order_1001",
        minSpend: 30
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(verifyPartnerOrder.status, 200);
    assert.equal(verifyPartnerOrder.data.verified, true);

    const verifyTooHigh = await postJson(
      baseUrl,
      "/api/supplier/verify-order",
      {
        merchantId: "m_store_001",
        partnerId: "partner_coffee",
        orderId: "ext_order_1001",
        minSpend: 100
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(verifyTooHigh.status, 200);
    assert.equal(verifyTooHigh.data.verified, false);

    const fireSale = await postJson(
      baseUrl,
      "/api/merchant/fire-sale",
      {
        merchantId: "m_store_001",
        targetSku: "sku_hot_soup",
        ttlMinutes: 30,
        voucherValue: 12,
        maxQty: 10
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(fireSale.status, 200);
    assert.ok(fireSale.data.campaignId);
    assert.equal(fireSale.data.priority, 999);

    const trigger = await postJson(
      baseUrl,
      "/api/tca/trigger",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        event: "INVENTORY_ALERT",
        context: {
          targetSku: "sku_hot_soup",
          inventoryBacklog: 20
        }
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(trigger.status, 200);
    assert.ok(trigger.data.executed.includes(fireSale.data.campaignId));
  } finally {
    await app.stop();
  }
});

test("alliance wallet sharing can be enabled across stores", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const fixtureOwner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_store_001" });
    const bistroOwner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_bistro" });
    const fixtureCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });
    const bistroCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_fixture_001"
    });
    const seedFixtureUser = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_store_001",
        userId: "u_fixture_001",
        orderAmount: 1
      },
      {
        Authorization: `Bearer ${fixtureCustomer}`,
        "Idempotency-Key": "alliance_fixture_seed_pay_1"
      }
    );
    assert.equal(seedFixtureUser.status, 200);

    const beforeFixtureState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${fixtureCustomer}` }
    );
    assert.equal(beforeFixtureState.status, 200);
    const beforePrincipal = beforeFixtureState.data.user.wallet.principal;

    const setFixtureAlliance = await postJson(
      baseUrl,
      "/api/merchant/alliance-config",
      {
        merchantId: "m_store_001",
        clusterId: "cluster_fixture_brand",
        stores: ["m_store_001", "m_bistro"],
        walletShared: true
      },
      { Authorization: `Bearer ${fixtureOwner}` }
    );
    assert.equal(setFixtureAlliance.status, 200);
    assert.equal(setFixtureAlliance.data.walletShared, true);

    const setBistroAlliance = await postJson(
      baseUrl,
      "/api/merchant/alliance-config",
      {
        merchantId: "m_bistro",
        clusterId: "cluster_fixture_brand",
        stores: ["m_store_001", "m_bistro"],
        walletShared: true
      },
      { Authorization: `Bearer ${bistroOwner}` }
    );
    assert.equal(setBistroAlliance.status, 200);
    assert.equal(setBistroAlliance.data.walletShared, true);

    const bistroPay = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_bistro",
        userId: "u_fixture_001",
        orderAmount: 70
      },
      {
        Authorization: `Bearer ${bistroCustomer}`,
        "Idempotency-Key": "alliance_shared_wallet_pay_1"
      }
    );
    assert.equal(bistroPay.status, 200);
    assert.equal(bistroPay.data.walletScope.walletShared, true);
    assert.equal(bistroPay.data.walletScope.walletMerchantId, "m_store_001");

    const afterFixtureState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_store_001&userId=u_fixture_001",
      { Authorization: `Bearer ${fixtureCustomer}` }
    );
    assert.equal(afterFixtureState.status, 200);
    assert.ok(afterFixtureState.data.user.wallet.principal < beforePrincipal);

    const stores = await getJson(
      baseUrl,
      "/api/merchant/stores?merchantId=m_store_001",
      { Authorization: `Bearer ${fixtureOwner}` }
    );
    assert.equal(stores.status, 200);
    assert.equal(stores.data.walletShared, true);
    assert.equal(stores.data.stores.length, 2);
  } finally {
    await app.stop();
  }
});

test("social and treat endpoints are removed", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const owner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_store_001" });
    const fixtureCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_store_001",
      userId: "u_fixture_001"
    });

    const transfer = await postJson(
      baseUrl,
      "/api/social/transfer",
      {
        merchantId: "m_store_001",
        fromUserId: "u_fixture_001",
        toUserId: "u_fixture_002",
        amount: 1
      },
      {
        Authorization: `Bearer ${fixtureCustomer}`,
        "Idempotency-Key": "social_transfer_removed"
      }
    );
    assert.equal(transfer.status, 404);
    assert.equal(transfer.data.error, "Not Found");

    const redPacket = await postJson(
      baseUrl,
      "/api/social/red-packets",
      {
        merchantId: "m_store_001",
        senderUserId: "u_fixture_001",
        totalAmount: 10,
        totalSlots: 2
      },
      {
        Authorization: `Bearer ${fixtureCustomer}`,
        "Idempotency-Key": "social_red_packet_removed"
      }
    );
    assert.equal(redPacket.status, 404);
    assert.equal(redPacket.data.error, "Not Found");

    const treatCreate = await postJson(
      baseUrl,
      "/api/social/treat/sessions",
      {
        merchantId: "m_store_001",
        initiatorUserId: "u_fixture_001",
        mode: "GROUP_PAY",
        orderAmount: 60
      },
      { Authorization: `Bearer ${fixtureCustomer}` }
    );
    assert.equal(treatCreate.status, 404);
    assert.equal(treatCreate.data.error, "Not Found");

    const treatQuery = await getJson(
      baseUrl,
      "/api/social/treat/sessions/does_not_exist?merchantId=m_store_001",
      { Authorization: `Bearer ${owner}` }
    );
    assert.equal(treatQuery.status, 404);
    assert.equal(treatQuery.data.error, "Not Found");
  } finally {
    await app.stop();
  }
});

test("metrics endpoint is publicly readable", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fetch(`${baseUrl}/health`);
    const metricsRes = await fetch(`${baseUrl}/metrics`);
    assert.equal(metricsRes.status, 200);
    const body = await metricsRes.text();
    assert.ok(body.includes("mealquest_requests_total"));
    assert.ok(body.includes("mealquest_errors_total"));
  } finally {
    await app.stop();
  }
});
