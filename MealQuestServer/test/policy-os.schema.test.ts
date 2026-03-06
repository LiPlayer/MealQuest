const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OBJECTIVE_TARGET_METRIC,
  OBJECTIVE_WINDOW_DAYS,
  createSchemaRegistry
} = require("../src/policyos/schemaRegistry");

function createValidSpec() {
  return {
    schema_version: "policyos.v1",
    policy_key: "rainy_soup",
    name: "Rainy Soup",
    lane: "GUARDED",
    goal: {
      type: "CLEAR_STOCK",
      kpi: "inventory_days"
    },
    stage: "EXPANSION",
    objective: {
      targetMetric: OBJECTIVE_TARGET_METRIC,
      windowDays: OBJECTIVE_WINDOW_DAYS
    },
    decisionSignals: {
      upliftProbability: 0.5,
      churnProbability: 0.2,
      responseProbability: 0.6,
      fatigueScore: 0.1,
      riskScore: 0.1,
      expectedMerchantProfitLift30d: 8,
      expectedMerchantRevenueLift30d: 12
    },
    gameSupport: {
      enabled: false,
      touchpoint: "none"
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
  assert.equal(result.stage, "EXPANSION");
  assert.equal(result.objective.targetMetric, OBJECTIVE_TARGET_METRIC);
  assert.equal(result.objective.windowDays, OBJECTIVE_WINDOW_DAYS);
  assert.equal(result.decisionSignals.expectedMerchantProfitLift30d, 8);
  assert.equal(result.decisionSignals.churnProbability, 0.2);
  assert.equal(result.decisionSignals.responseProbability, 0.6);
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

test("policy schema validation normalizes legacy objective and decision signals", () => {
  const schemaRegistry = createSchemaRegistry();
  const result = schemaRegistry.validatePolicySpec({
    ...createValidSpec(),
    objective: {
      valueFunction: "GLOBAL_ECOSYSTEM_VALUE_V1",
      weights: {
        customerLtv: 0.5,
        merchantNetProfit: 0.3,
        platformProfit: 0.2
      },
      windowDays: 30
    },
    decisionSignals: {
      intentScore: 0.65,
      expectedProfit30dProxy: 15,
      riskScore: 0.2,
      fatigueScore: 0.1
    }
  });
  assert.equal(result.objective.targetMetric, OBJECTIVE_TARGET_METRIC);
  assert.equal(result.objective.windowDays, OBJECTIVE_WINDOW_DAYS);
  assert.equal(result.decisionSignals.upliftProbability, 0.65);
  assert.equal(result.decisionSignals.expectedMerchantProfitLift30d, 15);
  assert.equal(result.decisionSignals.churnProbability, 0.15);
  assert.equal(result.decisionSignals.responseProbability, 0.5);
});

test("policy schema validation rejects non-standard objective target metric", () => {
  const schemaRegistry = createSchemaRegistry();
  assert.throws(
    () =>
      schemaRegistry.validatePolicySpec({
        ...createValidSpec(),
        objective: {
          targetMetric: "GLOBAL_ECOSYSTEM_VALUE_V1",
          windowDays: 30
        }
      }),
    (error) => error && error.code === "POLICY_SCHEMA_INVALID"
  );
});
