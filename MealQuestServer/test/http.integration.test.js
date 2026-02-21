const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAppServer } = require("../src/http/server");
const { createInMemoryDb } = require("../src/store/inMemoryDb");

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

async function mockLogin(baseUrl, role, options = {}) {
  const login = await postJson(baseUrl, "/api/auth/mock-login", {
    role,
    ...options
  });
  assert.equal(login.status, 200);
  return login.data.token;
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
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 52 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rbac_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    const confirmByClerk = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    assert.equal(confirmByClerk.status, 403);
    assert.equal(confirmByClerk.data.error, "permission denied");

    const refundByManager = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_demo",
        userId: "u_demo",
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
    const wsUrl = `ws://127.0.0.1:${port}/ws?merchantId=m_demo&token=${encodeURIComponent(ownerToken)}`;

    const ws = new WebSocket(wsUrl);
    await waitForWebSocketOpen(ws);

    const status = await getJson(baseUrl, "/api/ws/status?merchantId=m_demo", {
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 30 },
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
      merchantId: "m_demo",
      userId: "u_demo",
      orderAmount: 30
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.error, "Authorization Bearer token is required");
  } finally {
    await app.stop();
  }
});

test("persistent mode keeps state across restarts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mq-server-test-"));
  const dbFilePath = path.join(tempDir, "db.json");

  const app1 = createAppServer({ persist: true, dbFilePath });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const customerToken = await mockLogin(base1, "CUSTOMER");
  const verify = await postJson(
    base1,
    "/api/payment/verify",
    {
      merchantId: "m_demo",
      userId: "u_demo",
      orderAmount: 52
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": "persist_pay_1"
    }
  );
  assert.equal(verify.status, 200);
  await app1.stop();

  const app2 = createAppServer({ persist: true, dbFilePath });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const customerToken2 = await mockLogin(base2, "CUSTOMER");
    const stateRes = await fetch(
      `${base2}/api/state?merchantId=m_demo&userId=u_demo`,
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("persistent mode keeps tenant policy across restarts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mq-server-policy-test-"));
  const dbFilePath = path.join(tempDir, "db.json");

  const app1 = createAppServer({ persist: true, dbFilePath });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const ownerToken = await mockLogin(base1, "OWNER");
  const policyUpdate = await postJson(
    base1,
    "/api/merchant/tenant-policy",
    {
      merchantId: "m_demo",
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

  const app2 = createAppServer({ persist: true, dbFilePath });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const ownerToken2 = await mockLogin(base2, "OWNER");
    const policyQuery = await getJson(
      base2,
      "/api/merchant/tenant-policy?merchantId=m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("persistent mode keeps tenant dedicated route after cutover", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mq-server-cutover-test-"));
  const dbFilePath = path.join(tempDir, "db.json");

  const app1 = createAppServer({ persist: true, dbFilePath });
  const port1 = await app1.start(0);
  const base1 = `http://127.0.0.1:${port1}`;

  const ownerToken = await mockLogin(base1, "OWNER", {
    merchantId: "m_demo"
  });
  const cutover = await postJson(
    base1,
    "/api/merchant/migration/cutover",
    {
      merchantId: "m_demo",
      note: "online cutover"
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  assert.equal(cutover.status, 200);
  assert.equal(cutover.data.dedicatedDbAttached, true);
  assert.ok(cutover.data.dedicatedDbFilePath);

  const customerToken = await mockLogin(base1, "CUSTOMER", {
    merchantId: "m_demo",
    userId: "u_demo"
  });
  const verifyAfterCutover = await postJson(
    base1,
    "/api/payment/verify",
    {
      merchantId: "m_demo",
      userId: "u_demo",
      orderAmount: 12
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": "cutover_persist_pay_1"
    }
  );
  assert.equal(verifyAfterCutover.status, 200);
  assert.equal(
    app1.db.paymentsByMerchant.m_demo[verifyAfterCutover.data.paymentTxnId],
    undefined
  );
  assert.ok(
    app1.tenantRouter.getDbForMerchant("m_demo").paymentsByMerchant.m_demo[
      verifyAfterCutover.data.paymentTxnId
    ]
  );
  await app1.stop();

  const app2 = createAppServer({ persist: true, dbFilePath });
  const port2 = await app2.start(0);
  const base2 = `http://127.0.0.1:${port2}`;

  try {
    const ownerToken2 = await mockLogin(base2, "OWNER", {
      merchantId: "m_demo"
    });
    const status = await getJson(
      base2,
      "/api/merchant/migration/status?merchantId=m_demo",
      { Authorization: `Bearer ${ownerToken2}` }
    );
    assert.equal(status.status, 200);
    assert.equal(status.data.dedicatedDbAttached, true);

    const customerToken2 = await mockLogin(base2, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const verifyAfterRestart = await postJson(
      base2,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        orderAmount: 11
      },
      {
        Authorization: `Bearer ${customerToken2}`,
        "Idempotency-Key": "cutover_persist_pay_2"
      }
    );
    assert.equal(verifyAfterRestart.status, 200);
    assert.equal(
      app2.db.paymentsByMerchant.m_demo[verifyAfterRestart.data.paymentTxnId],
      undefined
    );
    const dedicatedDb = app2.tenantRouter.getDbForMerchant("m_demo");
    assert.notEqual(dedicatedDb, app2.db);
    assert.ok(
      dedicatedDb.paymentsByMerchant.m_demo[verifyAfterRestart.data.paymentTxnId]
    );
  } finally {
    await app2.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("migration rollback moves merchant traffic back to shared db", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_demo"
    });
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });

    const cutover = await postJson(
      baseUrl,
      "/api/merchant/migration/cutover",
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(cutover.status, 200);
    assert.equal(cutover.data.dedicatedDbAttached, true);

    const payOnDedicated = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        orderAmount: 13
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rollback_cutover_pay_1"
      }
    );
    assert.equal(payOnDedicated.status, 200);
    assert.equal(
      app.db.paymentsByMerchant.m_demo[payOnDedicated.data.paymentTxnId],
      undefined
    );

    const rollback = await postJson(
      baseUrl,
      "/api/merchant/migration/rollback",
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(rollback.status, 200);
    assert.equal(rollback.data.dedicatedDbAttached, false);
    assert.equal(rollback.data.migration.phase, "ROLLBACK");

    const statusAfterRollback = await getJson(
      baseUrl,
      "/api/merchant/migration/status?merchantId=m_demo",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(statusAfterRollback.status, 200);
    assert.equal(statusAfterRollback.data.dedicatedDbAttached, false);

    const payOnShared = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        orderAmount: 14
      },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "rollback_cutover_pay_2"
      }
    );
    assert.equal(payOnShared.status, 200);
    assert.ok(app.db.paymentsByMerchant.m_demo[payOnShared.data.paymentTxnId]);
    assert.equal(app.tenantRouter.getDbForMerchant("m_demo"), app.db);
  } finally {
    await app.stop();
  }
});

test("tenant isolation: same user id is scoped by merchant", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const customerDemoToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const customerBistroToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_demo"
    });
    const bistroOwnerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_bistro"
    });

    const bistroStateBefore = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_demo",
      { Authorization: `Bearer ${customerBistroToken}` }
    );
    assert.equal(bistroStateBefore.status, 200);
    const bistroPrincipalBefore = bistroStateBefore.data.user.wallet.principal;

    const demoVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        orderAmount: 52
      },
      {
        Authorization: `Bearer ${customerDemoToken}`,
        "Idempotency-Key": "tenant_demo_pay_1"
      }
    );
    assert.equal(demoVerify.status, 200);

    const bistroStateAfter = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_demo",
      { Authorization: `Bearer ${customerBistroToken}` }
    );
    assert.equal(bistroStateAfter.status, 200);
    assert.equal(bistroStateAfter.data.user.wallet.principal, bistroPrincipalBefore);

    const crossMerchantRefund = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_bistro",
        userId: "u_demo",
        paymentTxnId: demoVerify.data.paymentTxnId,
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
  bistroDb.merchantUsers.m_bistro.u_demo.wallet.principal = 999;

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
      userId: "u_demo"
    });

    const before = await getJson(
      baseUrl,
      "/api/state?merchantId=m_bistro&userId=u_demo",
      { Authorization: `Bearer ${bistroCustomer}` }
    );
    assert.equal(before.status, 200);
    assert.equal(before.data.user.wallet.principal, 999);

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_bistro",
        userId: "u_demo",
        orderAmount: 20
      },
      {
        Authorization: `Bearer ${bistroCustomer}`,
        "Idempotency-Key": "tenant_router_bistro_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    assert.equal(defaultDb.merchantUsers.m_bistro.u_demo.wallet.principal, 80);
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 25 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "audit_pay_1"
      }
    );
    assert.equal(verify.status, 200);

    const deniedConfirm = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    assert.equal(deniedConfirm.status, 403);

    const killSwitch = await postJson(
      baseUrl,
      "/api/merchant/kill-switch",
      { merchantId: "m_demo", enabled: true },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(killSwitch.status, 200);

    const logs = app.db.auditLogs.filter((item) => item.merchantId === "m_demo");
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 21 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "audit_page_pay_1"
      }
    );
    await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${clerkToken}` }
    );
    await postJson(
      baseUrl,
      "/api/merchant/kill-switch",
      { merchantId: "m_demo", enabled: true },
      { Authorization: `Bearer ${ownerToken}` }
    );

    const firstPage = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_demo&limit=2",
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
        `/api/audit/logs?merchantId=m_demo&limit=2&cursor=${encodeURIComponent(firstPage.data.pageInfo.nextCursor)}`,
        { Authorization: `Bearer ${ownerToken}` }
      );
      assert.equal(secondPage.status, 200);
      assert.ok(secondPage.data.items.length >= 1);
    }

    const deniedForCustomer = await getJson(
      baseUrl,
      "/api/audit/logs?merchantId=m_demo&limit=2",
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
      "/api/audit/logs?merchantId=m_demo&limit=10&action=KILL_SWITCH_SET&status=SUCCESS",
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
      merchantId: "m_demo"
    });
    const managerToken = await mockLogin(baseUrl, "MANAGER", {
      merchantId: "m_demo"
    });

    const updateByOwner = await postJson(
      baseUrl,
      "/api/merchant/tenant-policy",
      {
        merchantId: "m_demo",
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
      "/api/merchant/tenant-policy?merchantId=m_demo",
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
        merchantId: "m_demo",
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
      merchantId: "m_demo"
    });
    const managerToken = await mockLogin(baseUrl, "MANAGER", {
      merchantId: "m_demo"
    });
    const customerToken = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });

    const initialStatus = await getJson(
      baseUrl,
      "/api/merchant/migration/status?merchantId=m_demo",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(initialStatus.status, 200);
    assert.equal(initialStatus.data.migration.phase, "IDLE");

    const freezeStep = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      {
        merchantId: "m_demo",
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 10 },
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
        merchantId: "m_demo",
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 10 },
      {
        Authorization: `Bearer ${customerToken}`,
        "Idempotency-Key": "migration_unfreeze_pay_1"
      }
    );
    assert.equal(verifyRecovered.status, 200);

    const managerDenied = await postJson(
      baseUrl,
      "/api/merchant/migration/step",
      { merchantId: "m_demo", step: "FREEZE_WRITE" },
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
    assert.equal(crossScopePinned.data.merchantId, "m_demo");
  } finally {
    await app.stop();
  }
});

test("tenant policy: read-only merchant blocks write operations", async () => {
  const app = createAppServer({
    persist: false,
    tenantPolicyMap: {
      m_demo: {
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 30 },
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(quote.status, 200);

    const verifyBlocked = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 30 },
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
        item.merchantId === "m_demo" &&
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
      m_demo: {
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
    const demoCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const bistroCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_demo"
    });

    const firstVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 10 },
      {
        Authorization: `Bearer ${demoCustomer}`,
        "Idempotency-Key": "policy_limit_pay_1"
      }
    );
    assert.equal(firstVerify.status, 200);

    const secondVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 9 },
      {
        Authorization: `Bearer ${demoCustomer}`,
        "Idempotency-Key": "policy_limit_pay_2"
      }
    );
    assert.equal(secondVerify.status, 429);
    assert.equal(secondVerify.data.code, "TENANT_RATE_LIMITED");

    const bistroVerify = await postJson(
      baseUrl,
      "/api/payment/verify",
      { merchantId: "m_bistro", userId: "u_demo", orderAmount: 8 },
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
      { merchantId: "m_demo", userId: "u_demo", orderAmount: 500 },
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
      { merchantId: "m_demo", paymentTxnId: verifyPending.data.paymentTxnId },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(invoiceDeniedBeforeSettle.status, 400);
    assert.equal(invoiceDeniedBeforeSettle.data.error, "payment is not settled");

    const invalidCallback = await postJson(
      baseUrl,
      "/api/payment/callback",
      {
        merchantId: "m_demo",
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
      merchantId: "m_demo",
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_demo"
    });

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo",
        paymentTxnId: verify.data.paymentTxnId,
        title: "Customer Center Invoice"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(issueInvoice.status, 200);
    assert.ok(issueInvoice.data.invoiceNo);

    const customerLedger = await getJson(
      baseUrl,
      "/api/payment/ledger?merchantId=m_demo&limit=10",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerLedger.status, 200);
    assert.ok(Array.isArray(customerLedger.data.items));
    assert.ok(customerLedger.data.items.length >= 1);
    assert.ok(customerLedger.data.items.every((row) => row.userId === "u_demo"));

    const customerInvoices = await getJson(
      baseUrl,
      "/api/invoice/list?merchantId=m_demo&limit=10",
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(customerInvoices.status, 200);
    assert.ok(Array.isArray(customerInvoices.data.items));
    assert.ok(customerInvoices.data.items.some((item) => item.invoiceNo === issueInvoice.data.invoiceNo));

    const customerInvoiceDeniedByUserScope = await getJson(
      baseUrl,
      "/api/invoice/list?merchantId=m_demo&userId=u_friend",
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
    const ownerToken = await mockLogin(baseUrl, "OWNER", { merchantId: "m_demo" });
    const managerToken = await mockLogin(baseUrl, "MANAGER", { merchantId: "m_demo" });

    const managerDenied = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_demo", userId: "u_demo" },
      { Authorization: `Bearer ${managerToken}` }
    );
    assert.equal(managerDenied.status, 403);
    assert.equal(managerDenied.data.error, "permission denied");

    const exported = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_demo", userId: "u_demo" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(exported.status, 200);
    assert.equal(exported.data.user.uid, "u_demo");

    const deleted = await postJson(
      baseUrl,
      "/api/privacy/delete-user",
      { merchantId: "m_demo", userId: "u_demo" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.deleted, true);

    const exportedAfterDelete = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      { merchantId: "m_demo", userId: "u_demo" },
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
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_demo"
    });

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo"
      },
      { Authorization: `Bearer ${customerToken}` }
    );
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.deleted, true);
    assert.equal(
      cancel.data.anonymizedUserId,
      "DELETED_m_demo_u_demo"
    );

    const loginAfterCancel = await postJson(baseUrl, "/api/auth/mock-login", {
      role: "CUSTOMER",
      merchantId: "m_demo",
      userId: "u_demo"
    });
    assert.equal(loginAfterCancel.status, 404);
    assert.equal(loginAfterCancel.data.error, "user not found");

    const payment = app.db.paymentsByMerchant.m_demo[verify.data.paymentTxnId];
    assert.equal(payment.userId, "DELETED_m_demo_u_demo");

    const ownerExportAfterCancel = await postJson(
      baseUrl,
      "/api/privacy/export-user",
      {
        merchantId: "m_demo",
        userId: "u_demo"
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

test("strategy library supports proposal generation, confirm and campaign status control", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_demo"
    });

    const library = await getJson(
      baseUrl,
      "/api/merchant/strategy-library?merchantId=m_demo",
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(library.status, 200);
    assert.ok(library.data.templates.length >= 15);
    assert.ok(
      library.data.templates.some((item) => item.templateId === "activation_contextual_drop")
    );

    const proposal = await postJson(
      baseUrl,
      "/api/merchant/strategy-proposals",
      {
        merchantId: "m_demo",
        templateId: "activation_contextual_drop",
        branchId: "COOLING",
        intent: "高温清凉"
      },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.status, "PENDING");
    assert.ok(proposal.data.proposalId);
    assert.ok(proposal.data.campaignId);

    const confirm = await postJson(
      baseUrl,
      `/api/merchant/proposals/${proposal.data.proposalId}/confirm`,
      {
        merchantId: "m_demo"
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
  }
});

test("supplier verify and fire-sale endpoints work in merchant scope", async () => {
  const app = createAppServer({ persist: false });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ownerToken = await mockLogin(baseUrl, "OWNER", {
      merchantId: "m_demo"
    });

    const verifyPartnerOrder = await postJson(
      baseUrl,
      "/api/supplier/verify-order",
      {
        merchantId: "m_demo",
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
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
        merchantId: "m_demo",
        userId: "u_demo",
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
    const demoOwner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_demo" });
    const bistroOwner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_bistro" });
    const demoCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const bistroCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_bistro",
      userId: "u_demo"
    });

    const beforeDemoState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_demo&userId=u_demo",
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(beforeDemoState.status, 200);
    const beforePrincipal = beforeDemoState.data.user.wallet.principal;

    const setDemoAlliance = await postJson(
      baseUrl,
      "/api/merchant/alliance-config",
      {
        merchantId: "m_demo",
        clusterId: "cluster_demo_brand",
        stores: ["m_demo", "m_bistro"],
        walletShared: true
      },
      { Authorization: `Bearer ${demoOwner}` }
    );
    assert.equal(setDemoAlliance.status, 200);
    assert.equal(setDemoAlliance.data.walletShared, true);

    const setBistroAlliance = await postJson(
      baseUrl,
      "/api/merchant/alliance-config",
      {
        merchantId: "m_bistro",
        clusterId: "cluster_demo_brand",
        stores: ["m_demo", "m_bistro"],
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
        userId: "u_demo",
        orderAmount: 70
      },
      {
        Authorization: `Bearer ${bistroCustomer}`,
        "Idempotency-Key": "alliance_shared_wallet_pay_1"
      }
    );
    assert.equal(bistroPay.status, 200);
    assert.equal(bistroPay.data.walletScope.walletShared, true);
    assert.equal(bistroPay.data.walletScope.walletMerchantId, "m_demo");

    const afterDemoState = await getJson(
      baseUrl,
      "/api/state?merchantId=m_demo&userId=u_demo",
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(afterDemoState.status, 200);
    assert.ok(afterDemoState.data.user.wallet.principal < beforePrincipal);

    const stores = await getJson(
      baseUrl,
      "/api/merchant/stores?merchantId=m_demo",
      { Authorization: `Bearer ${demoOwner}` }
    );
    assert.equal(stores.status, 200);
    assert.equal(stores.data.walletShared, true);
    assert.equal(stores.data.stores.length, 2);
  } finally {
    await app.stop();
  }
});

test("social transfer and red packet keep asset conservation", async () => {
  const app = createAppServer({ persist: false });
  app.db.merchantUsers.m_demo.u_friend = {
    uid: "u_friend",
    displayName: "Friend",
    wallet: {
      principal: 20,
      bonus: 0,
      silver: 10
    },
    tags: [],
    fragments: {},
    vouchers: []
  };
  app.db.merchantUsers.m_demo.u_other = {
    uid: "u_other",
    displayName: "Other",
    wallet: {
      principal: 20,
      bonus: 0,
      silver: 8
    },
    tags: [],
    fragments: {},
    vouchers: []
  };
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const demoCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const friendCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_friend"
    });
    const otherCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_other"
    });

    const socialTransfer = await postJson(
      baseUrl,
      "/api/social/transfer",
      {
        merchantId: "m_demo",
        fromUserId: "u_demo",
        toUserId: "u_friend",
        amount: 30
      },
      {
        Authorization: `Bearer ${demoCustomer}`,
        "Idempotency-Key": "social_transfer_1"
      }
    );
    assert.equal(socialTransfer.status, 200);
    assert.equal(socialTransfer.data.amount, 30);

    const createPacket = await postJson(
      baseUrl,
      "/api/social/red-packets",
      {
        merchantId: "m_demo",
        senderUserId: "u_demo",
        totalAmount: 50,
        totalSlots: 3
      },
      {
        Authorization: `Bearer ${demoCustomer}`,
        "Idempotency-Key": "social_packet_create_1"
      }
    );
    assert.equal(createPacket.status, 200);
    assert.equal(createPacket.data.totalAmount, 50);

    const packetId = createPacket.data.packetId;
    const claim1 = await postJson(
      baseUrl,
      `/api/social/red-packets/${packetId}/claim`,
      {
        merchantId: "m_demo",
        userId: "u_friend"
      },
      {
        Authorization: `Bearer ${friendCustomer}`,
        "Idempotency-Key": "social_packet_claim_1"
      }
    );
    assert.equal(claim1.status, 200);

    const claim2 = await postJson(
      baseUrl,
      `/api/social/red-packets/${packetId}/claim`,
      {
        merchantId: "m_demo",
        userId: "u_other"
      },
      {
        Authorization: `Bearer ${otherCustomer}`,
        "Idempotency-Key": "social_packet_claim_2"
      }
    );
    assert.equal(claim2.status, 200);

    const claim3 = await postJson(
      baseUrl,
      `/api/social/red-packets/${packetId}/claim`,
      {
        merchantId: "m_demo",
        userId: "u_demo"
      },
      {
        Authorization: `Bearer ${demoCustomer}`,
        "Idempotency-Key": "social_packet_claim_3"
      }
    );
    assert.equal(claim3.status, 200);

    const packet = await getJson(
      baseUrl,
      `/api/social/red-packets/${packetId}?merchantId=m_demo`,
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(packet.status, 200);
    assert.equal(packet.data.status, "FINISHED");
    assert.equal(packet.data.remainingAmount, 0);
    const claimedTotal = packet.data.claims.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
    assert.equal(claimedTotal, 50);

    const socialAudit = app.db.auditLogs.filter(
      (item) =>
        item.merchantId === "m_demo" &&
        (item.action === "SOCIAL_TRANSFER" || item.action === "SOCIAL_RED_PACKET_CLAIM")
    );
    assert.ok(socialAudit.length >= 4);
  } finally {
    await app.stop();
  }
});

test("treat paying group mode settles with crowd contributions and refunds overpay", async () => {
  const app = createAppServer({ persist: false });
  app.db.merchantUsers.m_demo.u_friend = {
    uid: "u_friend",
    displayName: "Friend",
    wallet: { principal: 200, bonus: 0, silver: 10 },
    tags: [],
    fragments: {},
    vouchers: []
  };
  app.db.merchantUsers.m_demo.u_other = {
    uid: "u_other",
    displayName: "Other",
    wallet: { principal: 200, bonus: 0, silver: 8 },
    tags: [],
    fragments: {},
    vouchers: []
  };
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const owner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_demo" });
    const demoCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const friendCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_friend"
    });
    const otherCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_other"
    });

    const create = await postJson(
      baseUrl,
      "/api/social/treat/sessions",
      {
        merchantId: "m_demo",
        initiatorUserId: "u_demo",
        mode: "GROUP_PAY",
        orderAmount: 60
      },
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(create.status, 200);
    const sessionId = create.data.sessionId;

    const join1 = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${sessionId}/join`,
      { merchantId: "m_demo", userId: "u_demo", amount: 20 },
      { Authorization: `Bearer ${demoCustomer}`, "Idempotency-Key": "treat_group_join_1" }
    );
    assert.equal(join1.status, 200);

    const join2 = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${sessionId}/join`,
      { merchantId: "m_demo", userId: "u_friend", amount: 25 },
      { Authorization: `Bearer ${friendCustomer}`, "Idempotency-Key": "treat_group_join_2" }
    );
    assert.equal(join2.status, 200);

    const join3 = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${sessionId}/join`,
      { merchantId: "m_demo", userId: "u_other", amount: 20 },
      { Authorization: `Bearer ${otherCustomer}`, "Idempotency-Key": "treat_group_join_3" }
    );
    assert.equal(join3.status, 200);

    const close = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${sessionId}/close`,
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${owner}` }
    );
    assert.equal(close.status, 200);
    assert.equal(close.data.status, "SETTLED");
    assert.equal(close.data.settlement.merchantSubsidyApplied, 0);
    assert.equal(close.data.settlement.overPaid, 5);

    const query = await getJson(
      baseUrl,
      `/api/social/treat/sessions/${sessionId}?merchantId=m_demo`,
      { Authorization: `Bearer ${owner}` }
    );
    assert.equal(query.status, 200);
    assert.equal(query.data.status, "SETTLED");

    const treatLedger = app.db.ledger.find(
      (item) => item.type === "TREAT_PAY" && item.details.sessionId === sessionId
    );
    assert.ok(treatLedger);
  } finally {
    await app.stop();
  }
});

test("treat paying merchant subsidy obeys daily cap and can fail when underfunded", async () => {
  const app = createAppServer({ persist: false });
  app.db.merchantUsers.m_demo.u_friend = {
    uid: "u_friend",
    displayName: "Friend",
    wallet: { principal: 300, bonus: 0, silver: 10 },
    tags: [],
    fragments: {},
    vouchers: []
  };
  app.db.merchantUsers.m_demo.u_other = {
    uid: "u_other",
    displayName: "Other",
    wallet: { principal: 300, bonus: 0, silver: 8 },
    tags: [],
    fragments: {},
    vouchers: []
  };
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const owner = await mockLogin(baseUrl, "OWNER", { merchantId: "m_demo" });
    const demoCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_demo"
    });
    const friendCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_friend"
    });
    const otherCustomer = await mockLogin(baseUrl, "CUSTOMER", {
      merchantId: "m_demo",
      userId: "u_other"
    });

    const create1 = await postJson(
      baseUrl,
      "/api/social/treat/sessions",
      {
        merchantId: "m_demo",
        initiatorUserId: "u_demo",
        mode: "MERCHANT_SUBSIDY",
        orderAmount: 100,
        subsidyRate: 0.3,
        subsidyCap: 30,
        dailySubsidyCap: 10
      },
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(create1.status, 200);
    const session1 = create1.data.sessionId;

    await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session1}/join`,
      { merchantId: "m_demo", userId: "u_demo", amount: 50 },
      { Authorization: `Bearer ${demoCustomer}`, "Idempotency-Key": "treat_subsidy_join_1" }
    );
    await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session1}/join`,
      { merchantId: "m_demo", userId: "u_friend", amount: 40 },
      { Authorization: `Bearer ${friendCustomer}`, "Idempotency-Key": "treat_subsidy_join_2" }
    );
    const close1 = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session1}/close`,
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${owner}` }
    );
    assert.equal(close1.status, 200);
    assert.equal(close1.data.status, "SETTLED");
    assert.equal(close1.data.settlement.merchantSubsidyApplied, 10);

    const create2 = await postJson(
      baseUrl,
      "/api/social/treat/sessions",
      {
        merchantId: "m_demo",
        initiatorUserId: "u_demo",
        mode: "MERCHANT_SUBSIDY",
        orderAmount: 100,
        subsidyRate: 0.3,
        subsidyCap: 30,
        dailySubsidyCap: 10
      },
      { Authorization: `Bearer ${demoCustomer}` }
    );
    assert.equal(create2.status, 200);
    const session2 = create2.data.sessionId;

    await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session2}/join`,
      { merchantId: "m_demo", userId: "u_demo", amount: 40 },
      { Authorization: `Bearer ${demoCustomer}`, "Idempotency-Key": "treat_subsidy_join_3" }
    );
    await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session2}/join`,
      { merchantId: "m_demo", userId: "u_other", amount: 50 },
      { Authorization: `Bearer ${otherCustomer}`, "Idempotency-Key": "treat_subsidy_join_4" }
    );
    const beforePrincipal = app.db.merchantUsers.m_demo.u_other.wallet.principal;
    const close2 = await postJson(
      baseUrl,
      `/api/social/treat/sessions/${session2}/close`,
      { merchantId: "m_demo" },
      { Authorization: `Bearer ${owner}` }
    );
    assert.equal(close2.status, 200);
    assert.equal(close2.data.status, "FAILED");

    const afterPrincipal = app.db.merchantUsers.m_demo.u_other.wallet.principal;
    assert.ok(afterPrincipal >= beforePrincipal);
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
