const test = require("node:test");
const assert = require("node:assert/strict");

const { createPolicySpecFromTemplate } = require("../src/services/strategyLibrary");
const { createSchemaRegistry } = require("../src/policyos/schemaRegistry");

test("strategy library builds valid policy spec from template", () => {
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: "m_policy_tpl",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const schemaRegistry = createSchemaRegistry();
  const validated = schemaRegistry.validatePolicySpec(spec);

  assert.equal(template.templateId, "acquisition_welcome_gift");
  assert.equal(branch.branchId, "DEFAULT");
  assert.equal(validated.resource_scope.merchant_id, "m_policy_tpl");
  assert.equal(validated.triggers[0].event, "USER_ENTER_SHOP");
  assert.ok(validated.constraints.some((item) => item.plugin === "budget_guard_v1"));
});

test("strategy library allows policy patch overrides", () => {
  const { spec } = createPolicySpecFromTemplate({
    merchantId: "m_policy_tpl",
    templateId: "acquisition_welcome_gift",
    branchId: "CHANNEL",
    policyPatch: {
      lane: "EMERGENCY",
      constraints: [
        { plugin: "kill_switch_v1", params: {} },
        { plugin: "budget_guard_v1", params: { cap: 220, cost_per_hit: 12 } },
        { plugin: "frequency_cap_v1", params: { daily: 2, window_sec: 86400 } },
        { plugin: "anti_fraud_hook_v1", params: { max_risk_score: 0.8 } }
      ]
    }
  });

  assert.equal(spec.lane, "EMERGENCY");
  const budgetConstraint = spec.constraints.find((item) => item.plugin === "budget_guard_v1");
  assert.equal(budgetConstraint.params.cap, 220);
  assert.equal(budgetConstraint.params.cost_per_hit, 12);
});
