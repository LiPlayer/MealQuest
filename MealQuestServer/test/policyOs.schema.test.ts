const test = require("node:test");
const assert = require("node:assert/strict");

const { createSchemaRegistry } = require("../src/policyos/schemaRegistry");

function createValidSpec() {
  return {
    schema_version: "policyos.v1",
    policy_key: "rainy_soup",
    name: "Rainy Soup",
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
        event: "APP_OPEN",
        params: {}
      }
    ],
    program: {
      ttl_sec: 3600,
      max_instances: 1,
      pacing: {
        max_cost_per_minute: 10
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
        plugin: "budget_guard_v1",
        params: {
          cap: 20
        }
      }
    ],
    scoring: {
      plugin: "expected_profit_v1",
      params: {}
    },
    resource_scope: {
      merchant_id: "m_policy"
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600
    }
  };
}

test("policy schema validation accepts valid spec", () => {
  const schemaRegistry = createSchemaRegistry();
  const result = schemaRegistry.validatePolicySpec(createValidSpec());
  assert.equal(result.policy_key, "rainy_soup");
  assert.equal(result.resource_scope.merchant_id, "m_policy");
});

test("policy schema validation rejects invalid spec", () => {
  const schemaRegistry = createSchemaRegistry();
  assert.throws(
    () =>
      schemaRegistry.validatePolicySpec({
        ...createValidSpec(),
        triggers: []
      }),
    (error) => error && error.code === "POLICY_SCHEMA_INVALID"
  );
});

test("story schema validation rejects missing required fields", () => {
  const schemaRegistry = createSchemaRegistry();
  assert.throws(
    () =>
      schemaRegistry.validateStory({
        schema_version: "story.v1",
        narrative: "missing template",
        assets: [],
        triggers: []
      }),
    (error) => error && error.code === "POLICY_SCHEMA_INVALID"
  );
});
