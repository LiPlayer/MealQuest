const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";
const TEST_PAYMENT_CALLBACK_SECRET =
  process.env.MQ_PAYMENT_CALLBACK_SECRET || "mealquest-payment-callback-secret";

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
    })
  };
}

function seedMerchant(app, merchantId = "m_store_001") {
  app.db.merchants[merchantId] = {
    merchantId,
    name: "S100 Automation Merchant",
    killSwitchEnabled: false,
    budgetCap: 500,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" }
    ]
  };
  app.db.merchantUsers = app.db.merchantUsers || {};
  app.db.merchantUsers[merchantId] = app.db.merchantUsers[merchantId] || {};
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

async function fetchJson({ baseUrl, path, method = "GET", token = "", body = null, headers = {} }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let data = null;
  if (response.status !== 304) {
    data = await response.json();
  }
  return {
    status: response.status,
    data,
    headers: response.headers
  };
}

function signPayload(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

test("S100 automation executions: config endpoint removed, logs support ETag", async () => {
  const merchantId = "m_s100_cfg_removed_001";
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
    const configRemoved = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/config?merchantId=${encodeURIComponent(merchantId)}`,
      token: managerToken
    });
    assert.equal(configRemoved.status, 404);

    const login = await fetchJson({
      baseUrl,
      path: "/api/auth/customer/wechat-login",
      method: "POST",
      body: {
        merchantId,
        code: "wx_code_s100_cfg_removed"
      }
    });
    assert.equal(login.status, 200);

    const first = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(merchantId)}&event=USER_ENTER_SHOP&outcome=ALL`,
      token: ownerToken
    });
    assert.equal(first.status, 200);
    assert.ok(Array.isArray(first.data.items));
    assert.ok(first.data.items.length >= 1);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const second = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(merchantId)}&event=USER_ENTER_SHOP&outcome=ALL`,
      token: managerToken,
      headers: {
        "If-None-Match": etag
      }
    });
    assert.equal(second.status, 304);

    const customerDenied = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(merchantId)}`,
      token: customerToken
    });
    assert.equal(customerDenied.status, 403);
  } finally {
    await app.stop();
  }
});

test("S100 automation execution: entry and payment are always event-driven", async () => {
  const merchantId = "m_s100_exec_001";
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
    const firstLogin = await fetchJson({
      baseUrl,
      path: "/api/auth/customer/wechat-login",
      method: "POST",
      body: {
        merchantId,
        code: "wx_code_s100_1"
      }
    });
    assert.equal(firstLogin.status, 200);
    const customerToken = firstLogin.data.token;
    assert.ok(customerToken);

    const firstEntryLogs = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(
        merchantId
      )}&event=USER_ENTER_SHOP&outcome=ALL`,
      token: ownerToken
    });
    assert.equal(firstEntryLogs.status, 200);
    const beforeEntryCount = firstEntryLogs.data.items.length;
    assert.ok(beforeEntryCount >= 1);

    const secondLogin = await fetchJson({
      baseUrl,
      path: "/api/auth/customer/wechat-login",
      method: "POST",
      body: {
        merchantId,
        code: "wx_code_s100_2"
      }
    });
    assert.equal(secondLogin.status, 200);

    const secondEntryLogs = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(
        merchantId
      )}&event=USER_ENTER_SHOP&outcome=ALL`,
      token: ownerToken
    });
    assert.equal(secondEntryLogs.status, 200);
    assert.ok(secondEntryLogs.data.items.length > beforeEntryCount);

    const pay = await fetchJson({
      baseUrl,
      path: "/api/payment/verify",
      method: "POST",
      token: customerToken,
      headers: {
        "Idempotency-Key": "idem_s100_payment_001"
      },
      body: {
        merchantId,
        orderAmount: 12
      }
    });
    assert.equal(pay.status, 200);
    assert.ok(pay.data.paymentTxnId);
    if (String(pay.data.status || "").toUpperCase() === "PENDING_EXTERNAL") {
      const callbackBody = {
        merchantId,
        paymentTxnId: pay.data.paymentTxnId,
        externalTxnId: "ext_s100_payment_verify_001",
        status: "SUCCESS",
        paidAmount: Number(
          pay.data.externalPayment && Number(pay.data.externalPayment.payableAmount || 0)
        ),
        callbackId: "cb_s100_payment_verify_001"
      };
      const callback = await fetchJson({
        baseUrl,
        path: "/api/payment/callback",
        method: "POST",
        headers: {
          "x-payment-signature": signPayload(callbackBody, TEST_PAYMENT_CALLBACK_SECRET)
        },
        body: callbackBody
      });
      assert.equal(callback.status, 200);
      assert.equal(String(callback.data.status || "").toUpperCase(), "PAID");
    }

    const paymentLogs = await fetchJson({
      baseUrl,
      path: `/api/policyos/automation/executions?merchantId=${encodeURIComponent(
        merchantId
      )}&event=PAYMENT_VERIFY&outcome=ALL`,
      token: ownerToken
    });
    assert.equal(paymentLogs.status, 200);
    assert.ok(paymentLogs.data.items.length >= 1);
  } finally {
    await app.stop();
  }
});

test("S100 notification preferences: support category mute and frequency cap", async () => {
  const merchantId = "m_s100_pref_001";
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
    const mute = await fetchJson({
      baseUrl,
      path: "/api/notifications/preferences",
      method: "PUT",
      token: customerToken,
      body: {
        merchantId,
        categories: {
          EXECUTION_RESULT: false
        }
      }
    });
    assert.equal(mute.status, 200);
    assert.equal(mute.data.categories.EXECUTION_RESULT, false);

    const executeMuted = await fetchJson({
      baseUrl,
      path: "/api/policyos/decision/execute",
      method: "POST",
      token: ownerToken,
      body: {
        merchantId,
        userId: "u_notify_001",
        event: "USER_ENTER_SHOP",
        confirmed: true
      }
    });
    assert.equal(executeMuted.status, 200);

    const inboxMuted = await fetchJson({
      baseUrl,
      path: `/api/notifications/inbox?merchantId=${encodeURIComponent(
        merchantId
      )}&category=EXECUTION_RESULT&status=UNREAD`,
      token: customerToken
    });
    assert.equal(inboxMuted.status, 200);
    assert.equal(inboxMuted.data.items.length, 0);

    const enableWithCap = await fetchJson({
      baseUrl,
      path: "/api/notifications/preferences",
      method: "PUT",
      token: customerToken,
      body: {
        merchantId,
        categories: {
          EXECUTION_RESULT: true
        },
        frequencyCaps: {
          EXECUTION_RESULT: {
            windowSec: 24 * 60 * 60,
            maxDeliveries: 1
          }
        }
      }
    });
    assert.equal(enableWithCap.status, 200);
    assert.equal(enableWithCap.data.categories.EXECUTION_RESULT, true);
    assert.equal(enableWithCap.data.frequencyCaps.EXECUTION_RESULT.maxDeliveries, 1);

    const executeOnce = await fetchJson({
      baseUrl,
      path: "/api/policyos/decision/execute",
      method: "POST",
      token: ownerToken,
      body: {
        merchantId,
        userId: "u_notify_001",
        event: "USER_ENTER_SHOP",
        eventId: "manual_s100_pref_1",
        confirmed: true
      }
    });
    assert.equal(executeOnce.status, 200);

    const executeTwice = await fetchJson({
      baseUrl,
      path: "/api/policyos/decision/execute",
      method: "POST",
      token: ownerToken,
      body: {
        merchantId,
        userId: "u_notify_001",
        event: "USER_ENTER_SHOP",
        eventId: "manual_s100_pref_2",
        confirmed: true
      }
    });
    assert.equal(executeTwice.status, 200);

    const inboxCapped = await fetchJson({
      baseUrl,
      path: `/api/notifications/inbox?merchantId=${encodeURIComponent(
        merchantId
      )}&category=EXECUTION_RESULT&status=UNREAD`,
      token: customerToken
    });
    assert.equal(inboxCapped.status, 200);
    assert.equal(inboxCapped.data.items.length, 1);
  } finally {
    await app.stop();
  }
});
