const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");

function seedMerchantAndUser(db, merchantId = "m_policy") {
  db.merchants[merchantId] = {
    merchantId,
    name: "Policy Merchant",
    killSwitchEnabled: false,
    budgetCap: 100,
    budgetUsed: 0
  };
  if (!db.merchantUsers[merchantId]) {
    db.merchantUsers[merchantId] = {};
  }
  db.merchantUsers[merchantId].u_001 = {
    uid: "u_001",
    displayName: "Policy User",
    wallet: {
      principal: 10,
      bonus: 0,
      silver: 0
    },
    tags: ["REGULAR"],
    fragments: {},
    vouchers: []
  };
}

function createSpec(merchantId = "m_policy") {
  return {
    schema_version: "policyos.v1",
    policy_key: "silent_recall",
    name: "Silent Recall",
    lane: "NORMAL",
    goal: {
      type: "RETENTION",
      kpi: "reactivation_rate"
    },
    segment: {
      plugin: "all_users_v1",
      params: {}
    },
    triggers: [
      {
        plugin: "event_trigger_v1",
        event: "APP_OPEN",
        params: {}
      }
    ],
    program: {
      ttl_sec: 7200,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 4
      }
    },
    actions: [
      {
        plugin: "wallet_grant_v1",
        params: {
          account: "bonus",
          amount: 3,
          cost: 3
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
          cap: 9
        }
      },
      {
        plugin: "frequency_cap_v1",
        params: {
          daily: 1,
          window_sec: 86400
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

test("policy constraints support reserve/release through decision flow", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchantAndUser(db);
  const policyOsService = createPolicyOsService(db);
  const draft = policyOsService.createDraft({
    merchantId: "m_policy",
    operatorId: "owner",
    spec: createSpec("m_policy")
  });
  policyOsService.submitDraft({
    merchantId: "m_policy",
    draftId: draft.draft_id,
    operatorId: "owner"
  });
  const approval = policyOsService.approveDraft({
    merchantId: "m_policy",
    draftId: draft.draft_id,
    operatorId: "owner"
  });
  const published = policyOsService.publishDraft({
    merchantId: "m_policy",
    draftId: draft.draft_id,
    operatorId: "owner",
    approvalId: approval.approvalId
  });
  assert.ok(published.policy.policy_id);

  const first = await policyOsService.executeDecision({
    merchantId: "m_policy",
    userId: "u_001",
    event: "APP_OPEN",
    context: {}
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId: "m_policy",
    userId: "u_001",
    event: "APP_OPEN",
    context: {}
  });
  assert.equal(second.executed.length, 0);
  assert.ok(second.rejected.length >= 1);
  assert.ok(
    second.rejected.some(
      (item) =>
        String(item.reason).includes("frequency") ||
        String(item.reason).includes("budget")
    )
  );

  const budgetKeys = Object.keys(db.policyOs.resourceStates.budget || {});
  assert.ok(budgetKeys.length >= 1);
  const budgetState = db.policyOs.resourceStates.budget[budgetKeys[0]];
  assert.equal(budgetState.used, 3);
});

test("global budget constraint shares cap across users and policies in time window", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchantAndUser(db, "m_global_budget");
  db.merchantUsers.m_global_budget.u_002 = {
    uid: "u_002",
    displayName: "Global Budget User 2",
    wallet: {
      principal: 10,
      bonus: 0,
      silver: 0
    },
    tags: ["REGULAR"],
    fragments: {},
    vouchers: []
  };
  const policyOsService = createPolicyOsService(db);
  const createGlobalSpec = (policyKey) => ({
    schema_version: "policyos.v1",
    policy_key: policyKey,
    name: `Global Budget ${policyKey}`,
    lane: "NORMAL",
    goal: {
      type: "RETENTION",
      kpi: "reactivation_rate"
    },
    segment: {
      plugin: "all_users_v1",
      params: {}
    },
    triggers: [
      {
        plugin: "event_trigger_v1",
        event: "APP_OPEN",
        params: {}
      }
    ],
    program: {
      ttl_sec: 7200,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 100
      }
    },
    actions: [
      {
        plugin: "wallet_grant_v1",
        params: {
          account: "bonus",
          amount: 3,
          cost: 3
        }
      }
    ],
    constraints: [
      {
        plugin: "kill_switch_v1",
        params: {}
      },
      {
        plugin: "global_budget_guard_v1",
        params: {
          cap: 5,
          cost_per_hit: 3,
          bucket_id: "daily_campaign",
          max_cost_per_minute: 100
        }
      }
    ],
    scoring: {
      plugin: "expected_profit_v1",
      params: {}
    },
    resource_scope: {
      merchant_id: "m_global_budget"
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600
    }
  });

  for (const policyKey of ["global_a", "global_b"]) {
    const draft = policyOsService.createDraft({
      merchantId: "m_global_budget",
      operatorId: "owner",
      spec: createGlobalSpec(policyKey)
    });
    policyOsService.submitDraft({
      merchantId: "m_global_budget",
      draftId: draft.draft_id,
      operatorId: "owner"
    });
    const approval = policyOsService.approveDraft({
      merchantId: "m_global_budget",
      draftId: draft.draft_id,
      operatorId: "owner"
    });
    policyOsService.publishDraft({
      merchantId: "m_global_budget",
      draftId: draft.draft_id,
      operatorId: "owner",
      approvalId: approval.approvalId
    });
  }

  const first = await policyOsService.executeDecision({
    merchantId: "m_global_budget",
    userId: "u_001",
    event: "APP_OPEN",
    context: {}
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId: "m_global_budget",
    userId: "u_002",
    event: "APP_OPEN",
    context: {}
  });
  assert.equal(second.executed.length, 0);
  assert.ok(
    second.rejected.some((item) =>
      String(item.reason || "").includes("global_budget_cap_exceeded")
    )
  );
});
