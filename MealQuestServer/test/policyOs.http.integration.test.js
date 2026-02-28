const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function createSpec(merchantId = "m_policy_http") {
  return {
    schema_version: "policyos.v1",
    policy_key: "clear_stock_drop",
    name: "Clear Stock Drop",
    lane: "EMERGENCY",
    goal: {
      type: "CLEAR_STOCK",
      kpi: "inventory_days"
    },
    segment: {
      plugin: "all_users_v1",
      params: {}
    },
    triggers: [
      {
        plugin: "event_trigger_v1",
        event: "INVENTORY_ALERT",
        params: {}
      }
    ],
    program: {
      ttl_sec: 7200,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 20
      }
    },
    actions: [
      {
        plugin: "wallet_grant_v1",
        params: {
          account: "bonus",
          amount: 4,
          cost: 4
        }
      }
    ],
    constraints: [
      {
        plugin: "kill_switch_v1",
        params: {}
      },
      {
        plugin: "budget_guard_v1",
        params: {
          cap: 40
        }
      },
      {
        plugin: "inventory_lock_v1",
        params: {
          sku: "sku_hot_soup",
          max_units: 3,
          reserve_units: 1
        }
      }
    ],
    scoring: {
      plugin: "expected_profit_v1",
      params: {}
    },
    resource_scope: {
      merchant_id: merchantId
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600
    }
  };
}

function postJson(baseUrl, path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  }).then(async (res) => ({
    status: res.status,
    data: await res.json()
  }));
}

function getJson(baseUrl, path, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers
  }).then(async (res) => ({
    status: res.status,
    data: await res.json()
  }));
}

test("policy os end-to-end lifecycle works through HTTP", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET
  });
  app.db.merchants.m_policy_http = {
    merchantId: "m_policy_http",
    name: "Policy HTTP Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  app.db.merchantUsers.m_policy_http = {
    u_policy_http: {
      uid: "u_policy_http",
      displayName: "HTTP User",
      wallet: {
        principal: 20,
        bonus: 0,
        silver: 0
      },
      tags: [],
      fragments: {},
      vouchers: []
    }
  };

  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const ownerToken = issueToken(
    {
      role: "OWNER",
      merchantId: "m_policy_http",
      operatorId: "staff_owner"
    },
    TEST_JWT_SECRET
  );
  const managerToken = issueToken(
    {
      role: "MANAGER",
      merchantId: "m_policy_http",
      operatorId: "staff_manager"
    },
    TEST_JWT_SECRET
  );

  try {
    const createDraft = await postJson(
      baseUrl,
      "/api/policyos/drafts",
      {
        merchantId: "m_policy_http",
        spec: createSpec("m_policy_http")
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(createDraft.status, 200);
    assert.ok(createDraft.data.draft_id);

    const submit = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/submit`,
      {
        merchantId: "m_policy_http"
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(submit.status, 200);
    assert.equal(submit.data.status, "SUBMITTED");

    const approve = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/approve`,
      {
        merchantId: "m_policy_http"
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(approve.status, 200);
    assert.ok(approve.data.approvalId);

    const publish = await postJson(
      baseUrl,
      `/api/policyos/drafts/${encodeURIComponent(createDraft.data.draft_id)}/publish`,
      {
        merchantId: "m_policy_http",
        approvalId: approve.data.approvalId
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(publish.status, 200);
    assert.ok(publish.data.policy.policy_id);
    const policyId = publish.data.policy.policy_id;

    const paused = await postJson(
      baseUrl,
      `/api/policyos/policies/${encodeURIComponent(policyId)}/pause`,
      {
        merchantId: "m_policy_http",
        reason: "manual operation test"
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(paused.status, 200);
    assert.equal(paused.data.policy.status, "PAUSED");

    const executeWhilePaused = await postJson(
      baseUrl,
      "/api/policyos/decision/execute",
      {
        merchantId: "m_policy_http",
        userId: "u_policy_http",
        confirmed: true,
        event: "INVENTORY_ALERT",
        eventId: "evt_http_paused_1",
        context: {
          inventoryBacklog: 12
        }
      },
      {
        Authorization: `Bearer ${managerToken}`
      }
    );
    assert.equal(executeWhilePaused.status, 200);
    assert.equal(Array.isArray(executeWhilePaused.data.executed), true);
    assert.equal(executeWhilePaused.data.executed.length, 0);

    const resumed = await postJson(
      baseUrl,
      `/api/policyos/policies/${encodeURIComponent(policyId)}/resume`,
      {
        merchantId: "m_policy_http"
      },
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.policy.status, "PUBLISHED");

    const simulate = await postJson(
      baseUrl,
      "/api/policyos/decision/evaluate",
      {
        merchantId: "m_policy_http",
        userId: "u_policy_http",
        event: "INVENTORY_ALERT",
        eventId: "evt_http_sim_1",
        context: {
          inventoryBacklog: 12
        }
      },
      {
        Authorization: `Bearer ${managerToken}`
      }
    );
    assert.equal(simulate.status, 200);
    assert.equal(simulate.data.mode, "SIMULATE");
    assert.equal(Array.isArray(simulate.data.executed), true);
    assert.equal(simulate.data.executed.length, 0);
    assert.equal(Array.isArray(simulate.data.selected), true);
    assert.equal(simulate.data.selected.length, 1);

    const execute = await postJson(
      baseUrl,
      "/api/policyos/decision/execute",
      {
        merchantId: "m_policy_http",
        userId: "u_policy_http",
        confirmed: true,
        event: "INVENTORY_ALERT",
        eventId: "evt_http_1",
        context: {
          inventoryBacklog: 12
        }
      },
      {
        Authorization: `Bearer ${managerToken}`
      }
    );
    assert.equal(execute.status, 200);
    assert.equal(execute.data.mode, "EXECUTE");
    assert.equal(Array.isArray(execute.data.executed), true);
    assert.equal(execute.data.executed.length, 1);
    assert.ok(execute.data.decision_id);

    const explain = await getJson(
      baseUrl,
      `/api/policyos/decisions/${encodeURIComponent(execute.data.decision_id)}/explain?merchantId=m_policy_http`,
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(explain.status, 200);
    assert.equal(explain.data.decision_id, execute.data.decision_id);

    const state = await getJson(
      baseUrl,
      "/api/state?merchantId=m_policy_http&userId=u_policy_http",
      {
        Authorization: `Bearer ${ownerToken}`
      }
    );
    assert.equal(state.status, 200);
    assert.ok(state.data.policyOs);
    assert.ok(Number(state.data.policyOs.policyCount) >= 1);
  } finally {
    await app.stop();
  }
});
