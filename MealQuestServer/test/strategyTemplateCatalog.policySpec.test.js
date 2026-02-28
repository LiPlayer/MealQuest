const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPolicySpecFromTemplate,
  validatePolicyPatchForTemplate,
  validateStrategyTemplates
} = require("../src/services/strategyTemplateCatalog");
const { createSchemaRegistry } = require("../src/policyos/schemaRegistry");
const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");

test("strategy template catalog builds valid policy spec from template", () => {
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

test("strategy template catalog allows policy patch overrides", () => {
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

test("strategy template catalog only applies whitelisted patch fields", () => {
  const { spec } = createPolicySpecFromTemplate({
    merchantId: "m_policy_tpl",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT",
    policyPatch: {
      name: "Whitelist Check",
      lane: "GUARDED",
      governance: {
        approval_required: false
      },
      scoring: {
        plugin: "non_existing_scorer"
      },
      constraints: [
        { plugin: "kill_switch_v1", params: {} },
        {
          plugin: "budget_guard_v1",
          params: { cap: 188, cost_per_hit: 9 }
        },
        {
          plugin: "frequency_cap_v1",
          params: { daily: 3, window_sec: 7200 }
        },
        {
          plugin: "anti_fraud_hook_v1",
          params: { max_risk_score: 0.66 }
        }
      ]
    }
  });

  assert.equal(spec.name, "Whitelist Check");
  assert.equal(spec.lane, "GUARDED");
  assert.equal(spec.governance.approval_required, true);
  assert.equal(spec.scoring.plugin, "expected_profit_v1");
  const budgetConstraint = spec.constraints.find((item) => item.plugin === "budget_guard_v1");
  assert.equal(budgetConstraint.params.cap, 188);
  assert.equal(budgetConstraint.params.cost_per_hit, 9);
});

test("strategy template catalog passes strict validation with known plugins", () => {
  const db = createInMemoryDb();
  db.save = () => {};
  const policyOsService = createPolicyOsService(db);
  const report = validateStrategyTemplates({
    knownPlugins: policyOsService.listPlugins()
  });
  assert.equal(report.ok, true);
  assert.ok(report.templateCount >= 1);
  assert.ok(report.branchCount >= 1);
});

test("strategy template catalog detects illegal patch fields by template", () => {
  const report = validatePolicyPatchForTemplate({
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT",
    policyPatch: {
      name: "invalid patch",
      governance: {
        approval_required: false
      },
      constraints: [
        {
          plugin: "budget_guard_v1",
          params: {
            cap: 100,
            freeText: "not allowed"
          }
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.ok(Array.isArray(report.violations));
  assert.ok(report.violations.some((item) => item.path === "policyPatch.governance"));
  assert.ok(
    report.violations.some((item) =>
      String(item.path || "").includes("freeText")
    )
  );
});
