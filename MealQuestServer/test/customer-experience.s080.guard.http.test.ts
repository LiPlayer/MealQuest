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

function toIso(offsetMs = 0) {
  return new Date(Date.now() - Math.max(0, Number(offsetMs) || 0)).toISOString();
}

function seedMerchant(app, merchantId = "m_s080_guard") {
  if (!app.db.merchants[merchantId]) {
    app.db.merchants[merchantId] = {
      merchantId,
      name: "S080 Guard Merchant",
      killSwitchEnabled: false,
      budgetCap: 1000,
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
  if (!app.db.merchantUsers[merchantId].u_s080_001) {
    app.db.merchantUsers[merchantId].u_s080_001 = {
      uid: "u_s080_001",
      displayName: "S080 User",
      wallet: { principal: 100, bonus: 20, silver: 5 },
      tags: ["REGULAR"],
      fragments: { spicy: 0, noodle: 1 },
      vouchers: []
    };
  }
}

function seedGuardData(app, merchantId) {
  app.db.socialAuth = app.db.socialAuth || {};
  app.db.socialAuth.customerPhoneBindingsByMerchant =
    app.db.socialAuth.customerPhoneBindingsByMerchant || {};
  app.db.socialAuth.customerPhoneBindingsByMerchant[merchantId] = {
    "PHONE:+8613900000001": {
      userId: "u_s080_001",
      phone: "+8613900000001",
      linkedAt: toIso(2 * 60 * 60 * 1000),
      lastLoginAt: toIso(1 * 60 * 60 * 1000)
    },
    "PHONE:+8613900000002": {
      userId: "u_s080_002",
      phone: "+8613900000002",
      linkedAt: toIso(40 * 60 * 60 * 1000),
      lastLoginAt: toIso(50 * 60 * 60 * 1000)
    }
  };

  app.db.paymentsByMerchant[merchantId] = {
    pay_s080_001: {
      paymentTxnId: "pay_s080_001",
      merchantId,
      userId: "u_s080_001",
      status: "PAID",
      orderAmount: 88,
      deduction: { principal: 88, bonus: 0, voucher: 0 },
      createdAt: toIso(60 * 60 * 1000)
    },
    pay_s080_002: {
      paymentTxnId: "pay_s080_002",
      merchantId,
      userId: "u_s080_001",
      status: "EXTERNAL_FAILED",
      orderAmount: 66,
      deduction: { principal: 66, bonus: 0, voucher: 0 },
      createdAt: toIso(2 * 60 * 60 * 1000)
    },
    pay_s080_003: {
      paymentTxnId: "pay_s080_003",
      merchantId,
      userId: "u_s080_001",
      status: "PENDING_EXTERNAL",
      orderAmount: 36,
      deduction: { principal: 36, bonus: 0, voucher: 0 },
      createdAt: toIso(3 * 60 * 60 * 1000)
    }
  };

  app.db.invoicesByMerchant[merchantId] = {
    inv_s080_001: {
      invoiceNo: "inv_s080_001",
      merchantId,
      userId: "u_s080_001",
      paymentTxnId: "pay_s080_001",
      amount: 88,
      status: "ISSUED",
      issuedAt: toIso(30 * 60 * 1000)
    }
  };

  app.db.ledger = app.db.ledger || [];
  app.db.ledger.push({
    txnId: "pay_s080_001",
    merchantId,
    userId: "u_s080_001",
    type: "PAYMENT",
    amount: 88,
    timestamp: toIso(40 * 60 * 1000),
    details: {
      paymentTxnId: "pay_s080_001"
    }
  });

  app.db.auditLogs = app.db.auditLogs || [];
  app.db.auditLogs.push(
    {
      auditId: "audit_s080_001",
      timestamp: toIso(35 * 60 * 1000),
      merchantId,
      action: "PAYMENT_VERIFY",
      status: "SUCCESS",
      role: "CUSTOMER",
      operatorId: "u_s080_001",
      details: {
        paymentTxnId: "pay_s080_001"
      }
    },
    {
      auditId: "audit_s080_002",
      timestamp: toIso(20 * 60 * 1000),
      merchantId,
      action: "PRIVACY_EXPORT",
      status: "SUCCESS",
      role: "OWNER",
      operatorId: "staff_owner",
      details: {
        userId: "u_s080_001"
      }
    },
    {
      auditId: "audit_s080_003",
      timestamp: toIso(10 * 60 * 1000),
      merchantId,
      action: "PRIVACY_CANCEL",
      status: "FAILED",
      role: "CUSTOMER",
      operatorId: "u_s080_001",
      details: {
        userId: "u_s080_001"
      }
    }
  );
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

test("S080 experience guard: returns risk snapshot and supports ETag 304", async () => {
  const merchantId = "m_s080_guard_001";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
  seedGuardData(app, merchantId);
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
    const first = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(first.status, 200);
    assert.equal(String(first.data.version), "S080-SRV-01.v1");
    assert.equal(String(first.data.merchantId), merchantId);
    assert.equal(String(first.data.status), "RISK");
    assert.ok(Array.isArray(first.data.paths));
    assert.equal(first.data.paths.length, 4);

    const paymentPath = first.data.paths.find(
      (item) => String(item.pathKey || "") === "PAYMENT_SETTLEMENT"
    );
    assert.ok(paymentPath);
    assert.equal(String(paymentPath.status), "RISK");
    assert.equal(Number(paymentPath.metrics.attempts24h), 3);
    assert.equal(Number(paymentPath.metrics.paid24h), 1);
    assert.equal(Number(paymentPath.metrics.failed24h), 1);
    assert.equal(Number(paymentPath.metrics.pending24h), 1);

    const etag = first.headers.get("etag");
    assert.ok(etag);

    const notModified = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken,
      { "If-None-Match": etag }
    );
    assert.equal(notModified.status, 304);
    assert.equal(notModified.data, null);
  } finally {
    await app.stop();
  }
});

test("S080 experience guard: enforces role and merchant scope", async () => {
  const merchantId = "m_s080_guard_002";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId);
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
  const outsiderOwnerToken = issueToken(
    {
      role: "OWNER",
      merchantId: "m_other_merchant",
      operatorId: "staff_other_owner"
    },
    TEST_JWT_SECRET
  );
  const globalOwnerToken = issueToken(
    {
      role: "OWNER",
      operatorId: "staff_global_owner"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const managerOk = await getJson(baseUrl, "/api/state/experience-guard", managerToken);
    assert.equal(managerOk.status, 200);
    assert.equal(String(managerOk.data.merchantId), merchantId);

    const clerkDenied = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      clerkToken
    );
    assert.equal(clerkDenied.status, 403);
    assert.equal(String(clerkDenied.data.error), "permission denied");

    const scopeDenied = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      outsiderOwnerToken
    );
    assert.equal(scopeDenied.status, 403);
    assert.equal(String(scopeDenied.data.error), "merchant scope denied");

    const missingMerchant = await getJson(baseUrl, "/api/state/experience-guard", globalOwnerToken);
    assert.equal(missingMerchant.status, 400);
    assert.equal(String(missingMerchant.data.error), "merchantId is required");
  } finally {
    await app.stop();
  }
});

test("S080 experience guard: supports tenant limit by operation", async () => {
  const merchantId = "m_s080_guard_003";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService(),
    defaultTenantPolicy: {
      limits: {
        CUSTOMER_EXPERIENCE_GUARD_QUERY: 1
      }
    }
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
    const first = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(first.status, 200);

    const second = await getJson(
      baseUrl,
      `/api/state/experience-guard?merchantId=${encodeURIComponent(merchantId)}`,
      ownerToken
    );
    assert.equal(second.status, 429);
    assert.equal(String(second.data.code), "TENANT_RATE_LIMITED");
  } finally {
    await app.stop();
  }
});
