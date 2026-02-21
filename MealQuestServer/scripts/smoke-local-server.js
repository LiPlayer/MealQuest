const assert = require("node:assert/strict");
const { createAppServer } = require("../src/http/server");

function parseArgs(argv) {
  const args = {
    mode: "managed",
    baseUrl: process.env.MQ_SERVER_BASE_URL || "http://127.0.0.1:3030"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--external") {
      args.mode = "external";
      continue;
    }
    if (value === "--managed") {
      args.mode = "managed";
      continue;
    }
    if (value === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

async function requestJson(baseUrl, targetPath, options = {}) {
  const response = await fetch(`${baseUrl}${targetPath}`, options);
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return {
    status: response.status,
    data
  };
}

async function getJson(baseUrl, targetPath, headers = {}) {
  return requestJson(baseUrl, targetPath, { headers });
}

async function postJson(baseUrl, targetPath, body, headers = {}) {
  return requestJson(baseUrl, targetPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body || {})
  });
}

function expectStatus(result, expectedStatus, label) {
  assert.equal(
    result.status,
    expectedStatus,
    `${label}: expected ${expectedStatus}, received ${result.status}, payload=${JSON.stringify(result.data)}`
  );
}

function uniqueKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForWebSocketOpen(ws, timeoutMs = 2000) {
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

async function waitForWebSocketMessage(ws, timeoutMs = 3000) {
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

async function login(baseUrl, role, merchantId = "m_demo", userId = "u_demo") {
  const payload = {
    role,
    merchantId
  };
  if (role === "CUSTOMER") {
    payload.userId = userId;
  }
  const result = await postJson(baseUrl, "/api/auth/mock-login", payload);
  expectStatus(result, 200, `mock login ${role}`);
  return result.data.token;
}

async function runSmoke(baseUrl) {
  console.log(`[smoke] baseUrl=${baseUrl}`);

  const health = await getJson(baseUrl, "/health");
  expectStatus(health, 200, "health");

  const customerToken = await login(baseUrl, "CUSTOMER");
  const ownerToken = await login(baseUrl, "OWNER");
  const managerToken = await login(baseUrl, "MANAGER");
  const clerkToken = await login(baseUrl, "CLERK");

  console.log("[smoke] scenario A: quote/verify/refund + RBAC");
  const quote = await postJson(
    baseUrl,
    "/api/payment/quote",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 52 },
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(quote, 200, "payment quote");

  const verify = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 52 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_pay")
    }
  );
  expectStatus(verify, 200, "payment verify");
  assert.ok(verify.data.paymentTxnId, "paymentTxnId should exist");

  const refund = await postJson(
    baseUrl,
    "/api/payment/refund",
    {
      merchantId: "m_demo",
      userId: "u_demo",
      paymentTxnId: verify.data.paymentTxnId,
      refundAmount: 10
    },
    {
      Authorization: `Bearer ${managerToken}`,
      "Idempotency-Key": uniqueKey("smoke_refund")
    }
  );
  expectStatus(refund, 200, "payment refund");
  assert.ok(refund.data.clawback, "clawback should exist");

  const deniedConfirm = await postJson(
    baseUrl,
    "/api/merchant/proposals/proposal_rainy/confirm",
    { merchantId: "m_demo" },
    { Authorization: `Bearer ${clerkToken}` }
  );
  expectStatus(deniedConfirm, 403, "clerk confirm denied");
  assert.equal(deniedConfirm.data.error, "permission denied");

  console.log("[smoke] scenario B: websocket + ws scope");
  const wsUrl = baseUrl.replace(/^http/i, "ws");
  const ws = new WebSocket(
    `${wsUrl}/ws?merchantId=${encodeURIComponent("m_demo")}&token=${encodeURIComponent(ownerToken)}`
  );
  await waitForWebSocketOpen(ws);

  const wsStatus = await getJson(baseUrl, "/api/ws/status?merchantId=m_demo", {
    Authorization: `Bearer ${ownerToken}`
  });
  expectStatus(wsStatus, 200, "ws status");
  assert.ok(wsStatus.data.onlineCount >= 1, "onlineCount should be >= 1");

  const wsScopeDenied = await getJson(baseUrl, "/api/ws/status?merchantId=m_bistro", {
    Authorization: `Bearer ${ownerToken}`
  });
  expectStatus(wsScopeDenied, 403, "ws status scope denied");
  assert.equal(wsScopeDenied.data.error, "merchant scope denied");

  const wsMessagePromise = waitForWebSocketMessage(ws);
  const verifyForWs = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 11 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_ws_pay")
    }
  );
  expectStatus(verifyForWs, 200, "ws trigger payment verify");
  const wsMessage = JSON.parse(await wsMessagePromise);
  assert.equal(wsMessage.type, "PAYMENT_VERIFIED");
  ws.close();

  console.log("[smoke] scenario C: proposal + trigger + kill switch");
  const dashboard = await getJson(baseUrl, "/api/merchant/dashboard?merchantId=m_demo", {
    Authorization: `Bearer ${ownerToken}`
  });
  expectStatus(dashboard, 200, "dashboard");
  const hasPendingRainy = (dashboard.data.pendingProposals || []).some(
    (item) => item.id === "proposal_rainy"
  );
  if (hasPendingRainy) {
    const confirm = await postJson(
      baseUrl,
      "/api/merchant/proposals/proposal_rainy/confirm",
      { merchantId: "m_demo", operatorId: "staff_owner" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    expectStatus(confirm, 200, "owner confirm proposal");
  }

  const killSwitchOff = await postJson(
    baseUrl,
    "/api/merchant/kill-switch",
    { merchantId: "m_demo", enabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(killSwitchOff, 200, "kill switch off");

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
  expectStatus(trigger, 200, "trigger campaign");

  const killSwitchOn = await postJson(
    baseUrl,
    "/api/merchant/kill-switch",
    { merchantId: "m_demo", enabled: true },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(killSwitchOn, 200, "kill switch on");
  const blockedTrigger = await postJson(
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
  expectStatus(blockedTrigger, 200, "trigger blocked by kill switch");
  assert.equal(blockedTrigger.data.blockedByKillSwitch, true);
  await postJson(
    baseUrl,
    "/api/merchant/kill-switch",
    { merchantId: "m_demo", enabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );

  console.log("[smoke] scenario D: audit query");
  const auditQuery = await getJson(
    baseUrl,
    "/api/audit/logs?merchantId=m_demo&limit=5&action=KILL_SWITCH_SET",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(auditQuery, 200, "audit query by owner");
  assert.ok(Array.isArray(auditQuery.data.items), "audit items should be array");

  const auditDenied = await getJson(
    baseUrl,
    "/api/audit/logs?merchantId=m_demo&limit=5",
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(auditDenied, 403, "audit denied for customer");

  console.log("[smoke] scenario E: tenant policy freeze + rate limit");
  const freeze = await postJson(
    baseUrl,
    "/api/merchant/tenant-policy",
    { merchantId: "m_demo", writeEnabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(freeze, 200, "tenant policy freeze");

  const writeBlocked = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 8 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_frozen_pay")
    }
  );
  expectStatus(writeBlocked, 403, "write blocked in freeze");
  assert.equal(writeBlocked.data.code, "TENANT_WRITE_DISABLED");

  const unfreeze = await postJson(
    baseUrl,
    "/api/merchant/tenant-policy",
    {
      merchantId: "m_demo",
      writeEnabled: true,
      limits: {
        PAYMENT_VERIFY: {
          limit: 1,
          windowMs: 60000
        }
      }
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(unfreeze, 200, "tenant policy unfreeze + limit");

  const firstLimited = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 7 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_limit_pay")
    }
  );
  expectStatus(firstLimited, 200, "first limited verify");

  const secondLimited = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_demo", userId: "u_demo", orderAmount: 6 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_limit_pay")
    }
  );
  expectStatus(secondLimited, 429, "second limited verify");
  assert.equal(secondLimited.data.code, "TENANT_RATE_LIMITED");

  await postJson(
    baseUrl,
    "/api/merchant/tenant-policy",
    {
      merchantId: "m_demo",
      writeEnabled: true,
      limits: {
        PAYMENT_VERIFY: {
          limit: 9999,
          windowMs: 60000
        }
      }
    },
    { Authorization: `Bearer ${ownerToken}` }
  );

  console.log("[smoke] scenario F: migration step + cutover + rollback");
  const stepFreeze = await postJson(
    baseUrl,
    "/api/merchant/migration/step",
    { merchantId: "m_demo", step: "FREEZE_WRITE", note: "smoke freeze" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(stepFreeze, 200, "migration step freeze");
  assert.equal(stepFreeze.data.migration.phase, "FROZEN");

  const stepUnfreeze = await postJson(
    baseUrl,
    "/api/merchant/migration/step",
    { merchantId: "m_demo", step: "UNFREEZE_WRITE", note: "smoke unfreeze" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(stepUnfreeze, 200, "migration step unfreeze");
  assert.equal(stepUnfreeze.data.policy.writeEnabled, true);

  const cutover = await postJson(
    baseUrl,
    "/api/merchant/migration/cutover",
    { merchantId: "m_demo", note: "smoke cutover" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(cutover, 200, "migration cutover");
  assert.equal(cutover.data.dedicatedDbAttached, true);

  const statusAfterCutover = await getJson(
    baseUrl,
    "/api/merchant/migration/status?merchantId=m_demo",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(statusAfterCutover, 200, "migration status after cutover");
  assert.equal(statusAfterCutover.data.dedicatedDbAttached, true);

  const rollback = await postJson(
    baseUrl,
    "/api/merchant/migration/rollback",
    { merchantId: "m_demo", note: "smoke rollback" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(rollback, 200, "migration rollback");
  assert.equal(rollback.data.dedicatedDbAttached, false);
  assert.equal(rollback.data.migration.phase, "ROLLBACK");

  const statusAfterRollback = await getJson(
    baseUrl,
    "/api/merchant/migration/status?merchantId=m_demo",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(statusAfterRollback, 200, "migration status after rollback");
  assert.equal(statusAfterRollback.data.dedicatedDbAttached, false);

  console.log("[smoke] PASS: all local server smoke scenarios completed.");
}

async function main() {
  const args = parseArgs(process.argv);
  let app = null;
  let baseUrl = args.baseUrl;

  try {
    if (args.mode === "managed") {
      app = createAppServer({ persist: false });
      const port = await app.start(0);
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[smoke] started managed server at ${baseUrl}`);
    } else {
      console.log(
        "[smoke] external mode enabled; script assumes the target server state is clean enough for smoke checks."
      );
    }

    await runSmoke(baseUrl);
  } finally {
    if (app) {
      await app.stop();
      console.log("[smoke] managed server stopped.");
    }
  }
}

main().catch((error) => {
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exit(1);
});
