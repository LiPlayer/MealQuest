const assert = require("node:assert/strict");
const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

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

async function login(baseUrl, role, merchantId = "m_store_001", userId = "u_demo", options = {}) {
  const envToken = process.env[`MQ_SMOKE_TOKEN_${String(role || "").toUpperCase()}`];
  if (envToken) {
    return envToken;
  }

  const secret =
    options.jwtSecret ||
    process.env.MQ_SMOKE_JWT_SECRET ||
    process.env.MQ_JWT_SECRET ||
    "mealquest-dev-secret";
  return issueToken(
    {
      role,
      merchantId,
      userId: role === "CUSTOMER" ? userId : undefined,
      operatorId: operatorIdForRole(role)
    },
    secret
  );
}

async function runSmoke(baseUrl, options = {}) {
  const managedMode = Boolean(options.managedMode);
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
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 52 },
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(quote, 200, "payment quote");

  const verify = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 52 },
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
      merchantId: "m_store_001",
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
    { merchantId: "m_store_001" },
    { Authorization: `Bearer ${clerkToken}` }
  );
  expectStatus(deniedConfirm, 403, "clerk confirm denied");
  assert.equal(deniedConfirm.data.error, "permission denied");

  console.log("[smoke] scenario B: websocket + ws scope");
  const wsUrl = baseUrl.replace(/^http/i, "ws");
  const ws = new WebSocket(
    `${wsUrl}/ws?merchantId=${encodeURIComponent("m_store_001")}&token=${encodeURIComponent(ownerToken)}`
  );
  await waitForWebSocketOpen(ws);

  const wsStatus = await getJson(baseUrl, "/api/ws/status?merchantId=m_store_001", {
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
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 11 },
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
  const dashboard = await getJson(baseUrl, "/api/merchant/dashboard?merchantId=m_store_001", {
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
      { merchantId: "m_store_001", operatorId: "staff_owner" },
      { Authorization: `Bearer ${ownerToken}` }
    );
    expectStatus(confirm, 200, "owner confirm proposal");
  }

  const killSwitchOff = await postJson(
    baseUrl,
    "/api/merchant/kill-switch",
    { merchantId: "m_store_001", enabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(killSwitchOff, 200, "kill switch off");

  const trigger = await postJson(
    baseUrl,
    "/api/tca/trigger",
    {
      merchantId: "m_store_001",
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
    { merchantId: "m_store_001", enabled: true },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(killSwitchOn, 200, "kill switch on");
  const blockedTrigger = await postJson(
    baseUrl,
    "/api/tca/trigger",
    {
      merchantId: "m_store_001",
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
    { merchantId: "m_store_001", enabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );

  console.log("[smoke] scenario D: audit query");
  const auditQuery = await getJson(
    baseUrl,
    "/api/audit/logs?merchantId=m_store_001&limit=5&action=KILL_SWITCH_SET",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(auditQuery, 200, "audit query by owner");
  assert.ok(Array.isArray(auditQuery.data.items), "audit items should be array");

  const auditDenied = await getJson(
    baseUrl,
    "/api/audit/logs?merchantId=m_store_001&limit=5",
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(auditDenied, 403, "audit denied for customer");

  console.log("[smoke] scenario E: tenant policy freeze + rate limit");
  const freeze = await postJson(
    baseUrl,
    "/api/merchant/tenant-policy",
    { merchantId: "m_store_001", writeEnabled: false },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(freeze, 200, "tenant policy freeze");

  const writeBlocked = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 8 },
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
      merchantId: "m_store_001",
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
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 7 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_limit_pay")
    }
  );
  expectStatus(firstLimited, 200, "first limited verify");

  const secondLimited = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 6 },
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
      merchantId: "m_store_001",
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
    { merchantId: "m_store_001", step: "FREEZE_WRITE", note: "smoke freeze" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(stepFreeze, 200, "migration step freeze");
  assert.equal(stepFreeze.data.migration.phase, "FROZEN");

  const stepUnfreeze = await postJson(
    baseUrl,
    "/api/merchant/migration/step",
    { merchantId: "m_store_001", step: "UNFREEZE_WRITE", note: "smoke unfreeze" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(stepUnfreeze, 200, "migration step unfreeze");
  assert.equal(stepUnfreeze.data.policy.writeEnabled, true);

  const cutover = await postJson(
    baseUrl,
    "/api/merchant/migration/cutover",
    { merchantId: "m_store_001", note: "smoke cutover" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(cutover, 200, "migration cutover");
  assert.equal(cutover.data.dedicatedDbAttached, true);

  const statusAfterCutover = await getJson(
    baseUrl,
    "/api/merchant/migration/status?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(statusAfterCutover, 200, "migration status after cutover");
  assert.equal(statusAfterCutover.data.dedicatedDbAttached, true);

  const rollback = await postJson(
    baseUrl,
    "/api/merchant/migration/rollback",
    { merchantId: "m_store_001", note: "smoke rollback" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(rollback, 200, "migration rollback");
  assert.equal(rollback.data.dedicatedDbAttached, false);
  assert.equal(rollback.data.migration.phase, "ROLLBACK");

  const statusAfterRollback = await getJson(
    baseUrl,
    "/api/merchant/migration/status?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(statusAfterRollback, 200, "migration status after rollback");
  assert.equal(statusAfterRollback.data.dedicatedDbAttached, false);

  console.log("[smoke] scenario G: strategy library + proposal + status");
  const strategyLibrary = await getJson(
    baseUrl,
    "/api/merchant/strategy-library?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(strategyLibrary, 200, "strategy library");
  assert.ok(
    Array.isArray(strategyLibrary.data.templates) &&
      strategyLibrary.data.templates.length >= 10,
    "strategy templates should be available"
  );

  const strategyProposal = await postJson(
    baseUrl,
    "/api/merchant/strategy-proposals",
    {
      merchantId: "m_store_001",
      templateId: "activation_contextual_drop",
      branchId: "COOLING",
      intent: "smoke high temperature campaign"
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(strategyProposal, 200, "strategy proposal create");
  assert.equal(strategyProposal.data.status, "PENDING");

  const strategyConfirm = await postJson(
    baseUrl,
    `/api/merchant/proposals/${encodeURIComponent(strategyProposal.data.proposalId)}/confirm`,
    { merchantId: "m_store_001" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(strategyConfirm, 200, "strategy proposal confirm");

  const pauseCampaign = await postJson(
    baseUrl,
    `/api/merchant/campaigns/${encodeURIComponent(strategyConfirm.data.campaignId)}/status`,
    { merchantId: "m_store_001", status: "PAUSED" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(pauseCampaign, 200, "campaign pause");
  assert.equal(pauseCampaign.data.status, "PAUSED");

  const resumeCampaign = await postJson(
    baseUrl,
    `/api/merchant/campaigns/${encodeURIComponent(strategyConfirm.data.campaignId)}/status`,
    { merchantId: "m_store_001", status: "ACTIVE" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(resumeCampaign, 200, "campaign resume");
  assert.equal(resumeCampaign.data.status, "ACTIVE");

  console.log("[smoke] scenario H: supplier verify + fire sale");
  const supplierVerifyPass = await postJson(
    baseUrl,
    "/api/supplier/verify-order",
    {
      merchantId: "m_store_001",
      partnerId: "partner_coffee",
      orderId: "ext_order_1001",
      minSpend: 30
    },
    { Authorization: `Bearer ${clerkToken}` }
  );
  expectStatus(supplierVerifyPass, 200, "supplier verify pass");
  assert.equal(supplierVerifyPass.data.verified, true);

  const supplierVerifyFail = await postJson(
    baseUrl,
    "/api/supplier/verify-order",
    {
      merchantId: "m_store_001",
      partnerId: "partner_coffee",
      orderId: "ext_order_1001",
      minSpend: 80
    },
    { Authorization: `Bearer ${clerkToken}` }
  );
  expectStatus(supplierVerifyFail, 200, "supplier verify fail");
  assert.equal(supplierVerifyFail.data.verified, false);

  const fireSale = await postJson(
    baseUrl,
    "/api/merchant/fire-sale",
    {
      merchantId: "m_store_001",
      targetSku: "sku_hot_soup",
      ttlMinutes: 20
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(fireSale, 200, "fire sale create");
  assert.ok(fireSale.data.campaignId, "fire sale campaign id should exist");

  console.log("[smoke] scenario I: alliance wallet share + sync");
  const bistroOwnerToken = await login(baseUrl, "OWNER", "m_bistro");
  const allianceSet = await postJson(
    baseUrl,
    "/api/merchant/alliance-config",
    {
      merchantId: "m_store_001",
      clusterId: "cluster_demo_brand",
      stores: ["m_store_001", "m_bistro"],
      walletShared: true,
      tierShared: true
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(allianceSet, 200, "alliance config set");
  assert.equal(allianceSet.data.walletShared, true);

  const bistroAllianceSet = await postJson(
    baseUrl,
    "/api/merchant/alliance-config",
    {
      merchantId: "m_bistro",
      clusterId: "cluster_demo_brand",
      stores: ["m_store_001", "m_bistro"],
      walletShared: true,
      tierShared: true
    },
    { Authorization: `Bearer ${bistroOwnerToken}` }
  );
  expectStatus(bistroAllianceSet, 200, "bistro alliance config set");
  assert.equal(bistroAllianceSet.data.walletShared, true);

  const allianceStores = await getJson(
    baseUrl,
    "/api/merchant/stores?merchantId=m_store_001",
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(allianceStores, 200, "alliance stores list");
  assert.ok((allianceStores.data.stores || []).length >= 2);

  const allianceSync = await postJson(
    baseUrl,
    "/api/merchant/alliance/sync-user",
    { merchantId: "m_store_001", userId: "u_demo" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(allianceSync, 200, "alliance sync user");
  assert.ok(Array.isArray(allianceSync.data.syncedStores));

  const bistroCustomerToken = await login(baseUrl, "CUSTOMER", "m_bistro", "u_demo");
  const crossStorePay = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_bistro", userId: "u_demo", orderAmount: 10 },
    {
      Authorization: `Bearer ${bistroCustomerToken}`,
      "Idempotency-Key": uniqueKey("smoke_alliance_pay")
    }
  );
  expectStatus(crossStorePay, 200, "alliance cross-store payment");
  assert.equal(crossStorePay.data.walletScope.walletShared, true);

  console.log("[smoke] scenario J: social transfer + red packet");
  const socialTransfer = await postJson(
    baseUrl,
    "/api/social/transfer",
    {
      merchantId: "m_store_001",
      fromUserId: "u_demo",
      toUserId: "u_friend",
      amount: 8
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_social_transfer")
    }
  );
  expectStatus(socialTransfer, 200, "social transfer");

  const createPacket = await postJson(
    baseUrl,
    "/api/social/red-packets",
    {
      merchantId: "m_store_001",
      senderUserId: "u_demo",
      totalAmount: 21,
      totalSlots: 3
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_red_packet_create")
    }
  );
  expectStatus(createPacket, 200, "social red packet create");
  assert.ok(createPacket.data.packetId, "packet id should exist");

  const friendToken = await login(baseUrl, "CUSTOMER", "m_store_001", "u_friend");
  const claimPacket = await postJson(
    baseUrl,
    `/api/social/red-packets/${encodeURIComponent(createPacket.data.packetId)}/claim`,
    {
      merchantId: "m_store_001",
      userId: "u_friend"
    },
    {
      Authorization: `Bearer ${friendToken}`,
      "Idempotency-Key": uniqueKey("smoke_red_packet_claim")
    }
  );
  expectStatus(claimPacket, 200, "social red packet claim");
  assert.ok(Number(claimPacket.data.claimAmount) >= 1);

  console.log("[smoke] scenario K: treat paying session");
  const treatCreate = await postJson(
    baseUrl,
    "/api/social/treat/sessions",
    {
      merchantId: "m_store_001",
      initiatorUserId: "u_demo",
      mode: "GROUP_PAY",
      orderAmount: 60,
      ttlMinutes: 30
    },
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(treatCreate, 200, "treat session create");
  assert.ok(treatCreate.data.sessionId, "treat session id should exist");

  const treatJoinDemo = await postJson(
    baseUrl,
    `/api/social/treat/sessions/${encodeURIComponent(treatCreate.data.sessionId)}/join`,
    {
      merchantId: "m_store_001",
      userId: "u_demo",
      amount: 30
    },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_treat_join_demo")
    }
  );
  expectStatus(treatJoinDemo, 200, "treat join demo user");

  const treatJoinFriend = await postJson(
    baseUrl,
    `/api/social/treat/sessions/${encodeURIComponent(treatCreate.data.sessionId)}/join`,
    {
      merchantId: "m_store_001",
      userId: "u_friend",
      amount: 35
    },
    {
      Authorization: `Bearer ${friendToken}`,
      "Idempotency-Key": uniqueKey("smoke_treat_join_friend")
    }
  );
  expectStatus(treatJoinFriend, 200, "treat join friend user");

  const treatClose = await postJson(
    baseUrl,
    `/api/social/treat/sessions/${encodeURIComponent(treatCreate.data.sessionId)}/close`,
    { merchantId: "m_store_001" },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(treatClose, 200, "treat session close");
  assert.equal(treatClose.data.status, "SETTLED");

  console.log("[smoke] scenario L: customer center ledger + invoice list");
  const customerCenterPay = await postJson(
    baseUrl,
    "/api/payment/verify",
    { merchantId: "m_store_001", userId: "u_demo", orderAmount: 1 },
    {
      Authorization: `Bearer ${customerToken}`,
      "Idempotency-Key": uniqueKey("smoke_customer_center_pay")
    }
  );
  expectStatus(customerCenterPay, 200, "customer center payment");
  assert.equal(customerCenterPay.data.status, "PAID");

  const customerCenterInvoice = await postJson(
    baseUrl,
    "/api/invoice/issue",
    {
      merchantId: "m_store_001",
      paymentTxnId: customerCenterPay.data.paymentTxnId,
      title: "Smoke Invoice"
    },
    { Authorization: `Bearer ${ownerToken}` }
  );
  expectStatus(customerCenterInvoice, 200, "customer center issue invoice");
  assert.ok(customerCenterInvoice.data.invoiceNo);

  const customerLedger = await getJson(
    baseUrl,
    "/api/payment/ledger?merchantId=m_store_001&limit=10",
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(customerLedger, 200, "customer ledger");
  assert.ok(Array.isArray(customerLedger.data.items));
  assert.ok(customerLedger.data.items.length >= 1);

  const customerInvoices = await getJson(
    baseUrl,
    "/api/invoice/list?merchantId=m_store_001&limit=10",
    { Authorization: `Bearer ${customerToken}` }
  );
  expectStatus(customerInvoices, 200, "customer invoices");
  assert.ok(Array.isArray(customerInvoices.data.items));

  if (managedMode) {
    console.log("[smoke] scenario M: customer self-service cancel-account");
    const cancelToken = await login(baseUrl, "CUSTOMER", "m_store_001", "u_friend");
    const cancelResult = await postJson(
      baseUrl,
      "/api/privacy/cancel-account",
      { merchantId: "m_store_001" },
      { Authorization: `Bearer ${cancelToken}` }
    );
    expectStatus(cancelResult, 200, "privacy cancel-account");
    assert.equal(cancelResult.data.deleted, true);
  } else {
    console.log("[smoke] scenario M skipped in external mode: cancel-account is destructive.");
  }

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

    await runSmoke(baseUrl, { managedMode: args.mode === "managed" });
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
