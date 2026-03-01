const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const { createSchemaRegistry } = require("../src/policyos/schemaRegistry");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildSpecForValidation({ templateId, branchId, policySpec }) {
  const base = deepClone(policySpec || {});
  return {
    ...base,
    policy_key: base.policy_key || `${templateId}.${String(branchId || "default").toLowerCase()}`,
    resource_scope: {
      merchant_id: "m_template_validation"
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600,
      ...(base.governance || {})
    },
    story: {
      schema_version: "story.v1",
      templateId,
      narrative: String(base.name || `${templateId}:${branchId}`),
      assets: [],
      triggers: Array.isArray(base.triggers)
        ? base.triggers
            .map((item) => String(item && item.event ? item.event : "").trim())
            .filter(Boolean)
        : []
    }
  };
}

function main() {
  const db = createInMemoryDb();
  db.save = () => {};
  const policyOsService = createPolicyOsService(db);
  const schemaRegistry = createSchemaRegistry();
  const knownPlugins = policyOsService.listPlugins();

  const known = {
    trigger: new Set(knownPlugins.triggers || []),
    segment: new Set(knownPlugins.segments || []),
    constraint: new Set(knownPlugins.constraints || []),
    scorer: new Set(knownPlugins.scorers || []),
    action: new Set(knownPlugins.actions || [])
  };

  const errors = [];
  const templates = Array.isArray(templateCatalog.templates) ? templateCatalog.templates : [];
  for (const template of templates) {
    const templateId = String(template && template.templateId ? template.templateId : "").trim();
    const branches = Array.isArray(template && template.branches) ? template.branches : [];
    for (const branch of branches) {
      const branchId = String(branch && branch.branchId ? branch.branchId : "").trim();
      const spec = buildSpecForValidation({
        templateId,
        branchId,
        policySpec: branch && branch.policySpec
      });

      try {
        schemaRegistry.validatePolicySpec(spec);
      } catch (error) {
        errors.push({
          templateId,
          branchId,
          type: "SCHEMA_INVALID",
          message: error && error.message ? String(error.message) : "invalid policy schema",
          details: error && error.details ? error.details : []
        });
        continue;
      }

      if (!known.segment.has(spec.segment && spec.segment.plugin)) {
        errors.push({ templateId, branchId, type: "UNKNOWN_SEGMENT_PLUGIN", plugin: spec.segment && spec.segment.plugin });
      }
      if (!known.scorer.has(spec.scoring && spec.scoring.plugin)) {
        errors.push({ templateId, branchId, type: "UNKNOWN_SCORER_PLUGIN", plugin: spec.scoring && spec.scoring.plugin });
      }
      for (const trigger of spec.triggers || []) {
        if (!known.trigger.has(trigger && trigger.plugin)) {
          errors.push({ templateId, branchId, type: "UNKNOWN_TRIGGER_PLUGIN", plugin: trigger && trigger.plugin });
        }
      }
      for (const action of spec.actions || []) {
        if (!known.action.has(action && action.plugin)) {
          errors.push({ templateId, branchId, type: "UNKNOWN_ACTION_PLUGIN", plugin: action && action.plugin });
        }
      }
      for (const constraint of spec.constraints || []) {
        if (!known.constraint.has(constraint && constraint.plugin)) {
          errors.push({ templateId, branchId, type: "UNKNOWN_CONSTRAINT_PLUGIN", plugin: constraint && constraint.plugin });
        }
      }
    }
  }

  const report = {
    ok: errors.length === 0,
    templateCount: templates.length,
    branchCount: templates.reduce((acc, item) => acc + (Array.isArray(item && item.branches) ? item.branches.length : 0), 0),
    errors
  };

  if (!report.ok) {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (require.main === module) {
  main();
}
