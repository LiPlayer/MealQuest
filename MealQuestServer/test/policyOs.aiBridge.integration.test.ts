const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");

function seed(db, merchantId = "m_ai_bridge") {
  db.merchants[merchantId] = {
    merchantId,
    name: "AI Bridge Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "Bridge User",
      wallet: {
        principal: 10,
        bonus: 2,
        silver: 0
      },
      tags: ["REGULAR"],
      fragments: {
        spicy: 0
      },
      vouchers: []
    }
  };
}

test("policy os supports condition segment and voucher action plugins", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seed(db);
  const policyOsService = createPolicyOsService(db);

  const spec = {
    schema_version: "policyos.v1",
    policy_key: "ai.bridge.voucher",
    name: "AI Voucher Bridge",
    lane: "NORMAL",
    goal: {
      type: "RETENTION",
      kpi: "reactivation_rate"
    },
    segment: {
      plugin: "condition_segment_v1",
      params: {
        logic: "AND",
        conditions: [
          {
            field: "tags",
            op: "includes",
            value: "REGULAR"
          }
        ]
      }
    },
    triggers: [
      {
        plugin: "event_trigger_v1",
        event: "APP_OPEN",
        params: {}
      }
    ],
    program: {
      ttl_sec: 3600,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 20
      }
    },
    actions: [
      {
        plugin: "voucher_grant_v1",
        params: {
          cost: 5,
          expires_in_sec: 1800,
          voucher: {
            type: "NO_THRESHOLD_VOUCHER",
            name: "Bridge Voucher",
            value: 5,
            minSpend: 20
          }
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
          cap: 100
        }
      }
    ],
    scoring: {
      plugin: "expected_profit_v1",
      params: {}
    },
    resource_scope: {
      merchant_id: "m_ai_bridge"
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600
    }
  };

  const draft = policyOsService.createDraft({
    merchantId: "m_ai_bridge",
    operatorId: "staff_owner",
    spec
  });
  policyOsService.submitDraft({
    merchantId: "m_ai_bridge",
    draftId: draft.draft_id,
    operatorId: "staff_owner"
  });
  const approval = policyOsService.approveDraft({
    merchantId: "m_ai_bridge",
    draftId: draft.draft_id,
    operatorId: "staff_owner"
  });
  policyOsService.publishDraft({
    merchantId: "m_ai_bridge",
    draftId: draft.draft_id,
    operatorId: "staff_owner",
    approvalId: approval.approvalId
  });

  const decision = await policyOsService.executeDecision({
    merchantId: "m_ai_bridge",
    userId: "u_001",
    event: "APP_OPEN",
    eventId: "evt_ai_bridge_001",
    context: {}
  });
  assert.equal(decision.executed.length, 1);
  assert.equal(db.merchantUsers.m_ai_bridge.u_001.vouchers.length, 1);
  assert.ok(
    db.ledger.some(
      (item) => item.type === "POLICYOS_ASSET_GRANT" && item.userId === "u_001"
    )
  );
});

test("policy os can evaluate an ephemeral policySpec without creating draft", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seed(db, "m_ai_ephemeral");
  const policyOsService = createPolicyOsService(db);

  const spec = {
    schema_version: "policyos.v1",
    policy_key: "ai.ephemeral.reactivation",
    name: "AI Ephemeral Reactivation",
    lane: "NORMAL",
    goal: {
      type: "RETENTION",
      kpi: "reactivation_rate"
    },
    segment: {
      plugin: "condition_segment_v1",
      params: {
        logic: "AND",
        conditions: [
          {
            field: "tags",
            op: "includes",
            value: "REGULAR"
          }
        ]
      }
    },
    triggers: [
      {
        plugin: "event_trigger_v1",
        event: "APP_OPEN",
        params: {}
      }
    ],
    program: {
      ttl_sec: 1800,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 20
      }
    },
    actions: [
      {
        plugin: "voucher_grant_v1",
        params: {
          cost: 3,
          expires_in_sec: 900,
          voucher: {
            type: "NO_THRESHOLD_VOUCHER",
            name: "Ephemeral Voucher",
            value: 3,
            minSpend: 15
          }
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
          cap: 100
        }
      }
    ],
    scoring: {
      plugin: "expected_profit_v1",
      params: {}
    },
    resource_scope: {
      merchant_id: "m_ai_ephemeral"
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600
    }
  };

  const evaluated = await policyOsService.evaluateDecision({
    merchantId: "m_ai_ephemeral",
    userId: "u_001",
    event: "APP_OPEN",
    eventId: "evt_ephemeral_001",
    policySpec: spec
  });

  assert.equal(evaluated.mode, "EVALUATE");
  assert.ok(Array.isArray(evaluated.projected));
  assert.ok(Array.isArray(evaluated.explains));
  assert.equal(evaluated.explains.length, 1);
  assert.match(String(evaluated.explains[0].policy_id || ""), /^ephemeral:/);
  assert.equal(db.merchantUsers.m_ai_ephemeral.u_001.vouchers.length, 0);
});
