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

function seedMerchant(app, merchantId, name = "S070 Proposal Merchant") {
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
  app.db.merchantUsers[merchantId].u_s070_001 = {
    uid: "u_s070_001",
    displayName: "S070 User",
    wallet: {
      principal: 100,
      bonus: 10,
      silver: 3
    },
    tags: ["REGULAR"],
    fragments: {
      spicy: 0
    },
    vouchers: []
  };
}

async function getJson(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {})
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
    data
  };
}

async function postJson(baseUrl, path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {})
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
    data
  };
}

test("S070 proposal support: generate/list/detail/evaluate/approve-publish flow works", async () => {
  const merchantId = "m_s070_001";
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
    const generate = await postJson(
      baseUrl,
      "/api/agent-os/proposals/generate",
      {
        merchantId,
        intent: "提升活跃触达命中率",
        templateId: "engagement_daily_task_loop"
      },
      managerToken
    );
    assert.equal(generate.status, 200);
    const proposalId = String(generate.data && generate.data.proposal && generate.data.proposal.proposalId || "");
    assert.ok(proposalId);
    assert.equal(String(generate.data.proposal.status), "PENDING");
    assert.equal(String(generate.data.proposal.templateId), "engagement_daily_task_loop");
    assert.ok(String(generate.data.proposal.policyDraftId || "").startsWith("draft_"));

    const listAll = await getJson(
      baseUrl,
      `/api/agent-os/proposals?merchantId=${encodeURIComponent(merchantId)}&status=ALL&limit=20`,
      managerToken
    );
    assert.equal(listAll.status, 200);
    assert.ok(Array.isArray(listAll.data.items));
    assert.ok(listAll.data.items.some((item) => String(item.proposalId) === proposalId));

    const detail = await getJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}?merchantId=${encodeURIComponent(merchantId)}`,
      managerToken
    );
    assert.equal(detail.status, 200);
    assert.equal(String(detail.data.proposal.proposalId), proposalId);
    assert.ok(detail.data.proposal.suggestedPolicySpec);

    const evaluate = await postJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/evaluate`,
      {
        merchantId,
        userId: "u_s070_001",
        event: "USER_ENTER_SHOP"
      },
      managerToken
    );
    assert.equal(evaluate.status, 200);
    assert.equal(String(evaluate.data.proposalId), proposalId);
    assert.ok(String(evaluate.data.draftId || "").startsWith("draft_"));
    assert.ok(evaluate.data.evaluation);

    const decideApprove = await postJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/decide`,
      {
        merchantId,
        decision: "APPROVE",
        userId: "u_s070_001",
        event: "USER_ENTER_SHOP"
      },
      ownerToken
    );
    assert.equal(decideApprove.status, 200);
    assert.equal(String(decideApprove.data.status), "PUBLISHED");
    assert.ok(String(decideApprove.data.policyId || "").includes("@v"));
    assert.equal(String(decideApprove.data.proposal.status), "PUBLISHED");

    const listPublished = await getJson(
      baseUrl,
      `/api/agent-os/proposals?merchantId=${encodeURIComponent(merchantId)}&status=PUBLISHED`,
      ownerToken
    );
    assert.equal(listPublished.status, 200);
    assert.ok(Array.isArray(listPublished.data.items));
    assert.ok(listPublished.data.items.some((item) => String(item.proposalId) === proposalId));
  } finally {
    await app.stop();
  }
});

test("S070 proposal support: role and status guard work for reject/approve", async () => {
  const merchantId = "m_s070_002";
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    socialAuthService: createFakeSocialAuthService()
  });
  seedMerchant(app, merchantId, "S070 Guard Merchant");
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
  const outsiderOwnerToken = issueToken(
    {
      role: "OWNER",
      merchantId: "m_s070_other",
      operatorId: "staff_other_owner"
    },
    TEST_JWT_SECRET
  );
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const generate = await postJson(
      baseUrl,
      "/api/agent-os/proposals/generate",
      {
        merchantId,
        intent: "提升活跃触达",
        templateId: "engagement_daily_task_loop"
      },
      managerToken
    );
    assert.equal(generate.status, 200);
    const proposalId = String(generate.data && generate.data.proposal && generate.data.proposal.proposalId || "");
    assert.ok(proposalId);

    const managerDecideDenied = await postJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/decide`,
      {
        merchantId,
        decision: "REJECT",
        reason: "manager cannot decide"
      },
      managerToken
    );
    assert.equal(managerDecideDenied.status, 403);

    const ownerReject = await postJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/decide`,
      {
        merchantId,
        decision: "REJECT",
        reason: "owner rejected due budget"
      },
      ownerToken
    );
    assert.equal(ownerReject.status, 200);
    assert.equal(String(ownerReject.data.status), "REJECTED");
    assert.equal(String(ownerReject.data.proposal.status), "REJECTED");
    assert.equal(String(ownerReject.data.proposal.rejectedReason), "owner rejected due budget");

    const approveAfterReject = await postJson(
      baseUrl,
      `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/decide`,
      {
        merchantId,
        decision: "APPROVE",
        userId: "u_s070_001",
        event: "USER_ENTER_SHOP"
      },
      ownerToken
    );
    assert.equal(approveAfterReject.status, 409);
    assert.match(String(approveAfterReject.data.error || ""), /rejected proposal cannot be approved/i);

    const scopeDeniedList = await getJson(
      baseUrl,
      `/api/agent-os/proposals?merchantId=${encodeURIComponent(merchantId)}`,
      outsiderOwnerToken
    );
    assert.equal(scopeDeniedList.status, 403);
    assert.equal(String(scopeDeniedList.data.error), "merchant scope denied");
  } finally {
    await app.stop();
  }
});
