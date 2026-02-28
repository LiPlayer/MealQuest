const { createSchemaRegistry, POLICY_SCHEMA_VERSION } = require("../policyos/schemaRegistry");

const DEFAULT_TTL_SEC = 4 * 60 * 60;
const MAX_TTL_SEC = 72 * 60 * 60;

const STRATEGY_TEMPLATES = [
  {
    templateId: "acquisition_welcome_gift",
    category: "ACQUISITION",
    phase: "P1",
    name: "New User Welcome Gift",
    description: "Offer a starter voucher when a new user enters the store.",
    triggerEvent: "USER_ENTER_SHOP",
    defaultBranchId: "DEFAULT",
    branches: [
      {
        branchId: "DEFAULT",
        name: "Standard Welcome",
        description: "Baseline welcome voucher for first-time visitors.",
        policySpec: {
          name: "New User Welcome Gift - Standard",
          lane: "NORMAL",
          tie_breaker: "UTILITY_DESC",
          goal: {
            type: "ACQUISITION",
            kpi: "new_user_conversion"
          },
          segment: {
            plugin: "legacy_condition_segment_v1",
            params: {
              logic: "AND",
              conditions: [{ field: "isNewUser", op: "eq", value: true }]
            }
          },
          triggers: [
            {
              plugin: "event_trigger_v1",
              event: "USER_ENTER_SHOP",
              params: {}
            }
          ],
          program: {
            ttl_sec: DEFAULT_TTL_SEC,
            max_instances: 1,
            pacing: {
              max_cost_per_minute: 18
            }
          },
          actions: [
            {
              plugin: "voucher_grant_v1",
              channel: "default",
              params: {
                cost: 6,
                expires_in_sec: DEFAULT_TTL_SEC,
                voucher: {
                  type: "ITEM_WARRANT",
                  name: "New User Welcome Gift",
                  value: 18,
                  minSpend: 0
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
                cap: 120,
                cost_per_hit: 6
              }
            },
            {
              plugin: "frequency_cap_v1",
              params: {
                daily: 1,
                window_sec: 24 * 60 * 60
              }
            },
            {
              plugin: "anti_fraud_hook_v1",
              params: {
                max_risk_score: 0.75
              }
            }
          ],
          scoring: {
            plugin: "expected_profit_v1",
            params: {}
          },
          overlap_policy: {
            mode: "SOFT_EXCLUSIVE",
            conflict_set: "acquisition_welcome_gift",
            max_winners: 1,
            cooldown_sec: 0
          },
          governance: {
            approval_required: true,
            approval_level: "OWNER",
            approval_token_ttl_sec: 3600
          }
        }
      },
      {
        branchId: "CHANNEL",
        name: "Referral Welcome",
        description: "Stronger welcome package for referred new users.",
        policySpec: {
          name: "New User Welcome Gift - Referral",
          lane: "GUARDED",
          tie_breaker: "UTILITY_DESC",
          goal: {
            type: "ACQUISITION",
            kpi: "new_user_conversion"
          },
          segment: {
            plugin: "legacy_condition_segment_v1",
            params: {
              logic: "AND",
              conditions: [
                { field: "isNewUser", op: "eq", value: true },
                { field: "hasReferral", op: "eq", value: true }
              ]
            }
          },
          triggers: [
            {
              plugin: "event_trigger_v1",
              event: "USER_ENTER_SHOP",
              params: {}
            }
          ],
          program: {
            ttl_sec: DEFAULT_TTL_SEC,
            max_instances: 1,
            pacing: {
              max_cost_per_minute: 20
            }
          },
          actions: [
            {
              plugin: "voucher_grant_v1",
              channel: "default",
              params: {
                cost: 8,
                expires_in_sec: DEFAULT_TTL_SEC,
                voucher: {
                  type: "NO_THRESHOLD_VOUCHER",
                  name: "Referral Welcome Bonus",
                  value: 10,
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
                cap: 140,
                cost_per_hit: 8
              }
            },
            {
              plugin: "frequency_cap_v1",
              params: {
                daily: 1,
                window_sec: 24 * 60 * 60
              }
            },
            {
              plugin: "anti_fraud_hook_v1",
              params: {
                max_risk_score: 0.75
              }
            }
          ],
          scoring: {
            plugin: "expected_profit_v1",
            params: {}
          },
          overlap_policy: {
            mode: "SOFT_EXCLUSIVE",
            conflict_set: "acquisition_welcome_gift",
            max_winners: 1,
            cooldown_sec: 0
          },
          governance: {
            approval_required: true,
            approval_level: "OWNER",
            approval_token_ttl_sec: 3600
          }
        }
      }
    ]
  }
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObjectLike(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(base, patch) {
  if (!isObjectLike(patch)) {
    return patch === undefined ? deepClone(base) : deepClone(patch);
  }
  const result = isObjectLike(base) ? deepClone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (isObjectLike(value) && isObjectLike(result[key])) {
      result[key] = mergePatch(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeKeyPart(value, fallback = "default") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_");
  return normalized || fallback;
}

function findTemplate(templateId) {
  return STRATEGY_TEMPLATES.find((item) => item.templateId === templateId) || null;
}

function resolveTemplateBranch(template, branchId) {
  const requested = String(branchId || template.defaultBranchId || "").trim();
  const branch = template.branches.find((item) => item.branchId === requested);
  if (!branch) {
    throw new Error("strategy branch not found");
  }
  return branch;
}

function extractBranchBudget(branch) {
  const constraints = Array.isArray(branch.policySpec && branch.policySpec.constraints)
    ? branch.policySpec.constraints
    : [];
  const budgetGuard = constraints.find((item) => item && item.plugin === "budget_guard_v1");
  if (!budgetGuard || !isObjectLike(budgetGuard.params)) {
    return {
      cap: 0,
      costPerHit: 0
    };
  }
  return {
    cap: Math.max(0, Math.floor(toNumber(budgetGuard.params.cap, 0))),
    costPerHit: Math.max(0, Math.floor(toNumber(budgetGuard.params.cost_per_hit, 0)))
  };
}

function laneToPriority(lane) {
  const normalized = String(lane || "NORMAL").toUpperCase();
  if (normalized === "EMERGENCY") {
    return 100;
  }
  if (normalized === "GUARDED") {
    return 85;
  }
  if (normalized === "NORMAL") {
    return 60;
  }
  return 40;
}

function normalizeSpec({
  merchantId,
  template,
  branch,
  mergedSpec
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const spec = isObjectLike(mergedSpec) ? deepClone(mergedSpec) : {};
  spec.schema_version = POLICY_SCHEMA_VERSION;
  spec.policy_key =
    String(spec.policy_key || "").trim() ||
    `ai.${sanitizeKeyPart(template.templateId, "template")}.${sanitizeKeyPart(
      branch.branchId,
      "branch"
    )}`;
  spec.name =
    String(spec.name || "").trim() || `${template.name} - ${branch.name}`;
  spec.resource_scope = {
    ...(isObjectLike(spec.resource_scope) ? spec.resource_scope : {}),
    merchant_id: merchantId
  };

  const program = isObjectLike(spec.program) ? spec.program : {};
  const ttlSec = Math.floor(toNumber(program.ttl_sec, DEFAULT_TTL_SEC));
  program.ttl_sec = Math.max(60, Math.min(MAX_TTL_SEC, ttlSec));
  program.max_instances = Math.max(1, Math.floor(toNumber(program.max_instances, 1)));
  program.pacing = isObjectLike(program.pacing) ? program.pacing : {};
  program.pacing.max_cost_per_minute = Math.max(
    1,
    Math.floor(toNumber(program.pacing.max_cost_per_minute, Number.MAX_SAFE_INTEGER))
  );
  spec.program = program;

  const actions = Array.isArray(spec.actions) ? spec.actions.filter(isObjectLike) : [];
  spec.actions = actions.length > 0 ? actions : deepClone(branch.policySpec.actions);

  const triggers = Array.isArray(spec.triggers) ? spec.triggers.filter(isObjectLike) : [];
  if (triggers.length === 0) {
    spec.triggers = deepClone(branch.policySpec.triggers);
  } else {
    spec.triggers = triggers.map((trigger) => ({
      ...trigger,
      plugin: String(trigger.plugin || "event_trigger_v1").trim() || "event_trigger_v1",
      event:
        String(trigger.event || trigger.params && trigger.params.event || "")
          .trim()
          .toUpperCase() || String(template.triggerEvent || "").toUpperCase(),
      params: isObjectLike(trigger.params) ? trigger.params : {}
    }));
  }

  spec.governance = {
    approval_required: true,
    approval_level: "OWNER",
    approval_token_ttl_sec: 3600,
    ...(isObjectLike(spec.governance) ? spec.governance : {})
  };
  spec.overlap_policy = {
    mode: "SOFT_EXCLUSIVE",
    conflict_set: sanitizeKeyPart(template.templateId, "default"),
    max_winners: 1,
    cooldown_sec: 0,
    ...(isObjectLike(spec.overlap_policy) ? spec.overlap_policy : {})
  };
  spec.updated_at = new Date(nowSec * 1000).toISOString();
  return spec;
}

function createPolicySpecFromTemplate({
  merchantId,
  templateId,
  branchId,
  policyPatch = {}
}) {
  const template = findTemplate(templateId);
  if (!template) {
    throw new Error("strategy template not found");
  }
  if (!String(merchantId || "").trim()) {
    throw new Error("merchantId is required");
  }
  const branch = resolveTemplateBranch(template, branchId);
  const mergedSpec = mergePatch(branch.policySpec, policyPatch || {});
  const spec = normalizeSpec({
    merchantId: String(merchantId).trim(),
    template,
    branch,
    mergedSpec
  });
  const schemaRegistry = createSchemaRegistry();
  const validated = schemaRegistry.validatePolicySpec(spec);
  return {
    spec: validated,
    template: {
      templateId: template.templateId,
      name: template.name,
      category: template.category,
      phase: template.phase
    },
    branch: {
      branchId: branch.branchId,
      name: branch.name
    }
  };
}

function listStrategyTemplates() {
  return STRATEGY_TEMPLATES.map((template) => ({
    templateId: template.templateId,
    category: template.category,
    phase: template.phase,
    name: template.name,
    description: template.description,
    triggerEvent: template.triggerEvent,
    defaultBranchId: template.defaultBranchId,
    branches: template.branches.map((branch) => {
      const budget = extractBranchBudget(branch);
      return {
        branchId: branch.branchId,
        name: branch.name,
        description: branch.description,
        recommendedBudgetCap: budget.cap,
        recommendedCostPerHit: budget.costPerHit,
        recommendedPriority: laneToPriority(branch.policySpec && branch.policySpec.lane)
      };
    })
  }));
}

module.exports = {
  createPolicySpecFromTemplate,
  findTemplate,
  listStrategyTemplates
};
