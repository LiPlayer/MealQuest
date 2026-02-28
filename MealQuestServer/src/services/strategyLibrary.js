const fs = require("node:fs");
const path = require("node:path");
const { createSchemaRegistry, POLICY_SCHEMA_VERSION } = require("../policyos/schemaRegistry");

const DEFAULT_TTL_SEC = 4 * 60 * 60;
const MAX_TTL_SEC = 72 * 60 * 60;
const TEMPLATE_CATALOG_PATH = path.resolve(
  __dirname,
  "../policyos/templates/strategy-templates.v1.json"
);

const templateCache = {
  mtimeMs: -1,
  templates: []
};
const ALLOWED_LANES = new Set(["EMERGENCY", "GUARDED", "NORMAL", "BACKGROUND"]);
const ALLOWED_CONDITION_OPS = new Set([
  "eq",
  "neq",
  "gte",
  "gt",
  "lte",
  "lt",
  "includes",
  "in",
  "nin"
]);

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

function validateTemplateCatalog(catalog) {
  if (!isObjectLike(catalog)) {
    throw new Error("strategy template catalog is invalid");
  }
  if (!Array.isArray(catalog.templates) || catalog.templates.length === 0) {
    throw new Error("strategy template catalog templates is empty");
  }
  for (const template of catalog.templates) {
    if (!isObjectLike(template)) {
      throw new Error("strategy template item is invalid");
    }
    if (!String(template.templateId || "").trim()) {
      throw new Error("strategy templateId is required");
    }
    if (!Array.isArray(template.branches) || template.branches.length === 0) {
      throw new Error(`strategy template branches is empty: ${template.templateId}`);
    }
    for (const branch of template.branches) {
      if (!isObjectLike(branch) || !String(branch.branchId || "").trim()) {
        throw new Error(`strategy branch is invalid: ${template.templateId}`);
      }
      if (!isObjectLike(branch.policySpec)) {
        throw new Error(`strategy branch policySpec is invalid: ${template.templateId}/${branch.branchId}`);
      }
    }
  }
}

function readTemplateCatalog() {
  const stat = fs.statSync(TEMPLATE_CATALOG_PATH);
  if (templateCache.mtimeMs === stat.mtimeMs && templateCache.templates.length > 0) {
    return templateCache.templates;
  }
  const raw = fs.readFileSync(TEMPLATE_CATALOG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  validateTemplateCatalog(parsed);
  const templates = deepClone(parsed.templates);
  templateCache.mtimeMs = stat.mtimeMs;
  templateCache.templates = templates;
  return templates;
}

function findTemplate(templateId) {
  const templates = readTemplateCatalog();
  return templates.find((item) => item.templateId === templateId) || null;
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

function toPatchNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const bounded = Math.max(min, Math.min(max, parsed));
  return integer ? Math.floor(bounded) : bounded;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function findPatchByPlugin(entries, plugin) {
  if (!Array.isArray(entries)) {
    return null;
  }
  const normalized = String(plugin || "").trim();
  for (const item of entries) {
    if (!isObjectLike(item)) {
      continue;
    }
    if (String(item.plugin || "").trim() === normalized) {
      return item;
    }
  }
  return null;
}

function sanitizeProgramPatch(programPatch) {
  if (!isObjectLike(programPatch)) {
    return null;
  }
  const next = {};
  if (hasOwn(programPatch, "ttl_sec")) {
    const ttl = toPatchNumber(programPatch.ttl_sec, {
      min: 60,
      max: MAX_TTL_SEC,
      integer: true
    });
    if (ttl !== null) {
      next.ttl_sec = ttl;
    }
  }
  if (isObjectLike(programPatch.pacing)) {
    const maxCostPerMinute = toPatchNumber(programPatch.pacing.max_cost_per_minute, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      integer: true
    });
    if (maxCostPerMinute !== null) {
      next.pacing = {
        max_cost_per_minute: maxCostPerMinute
      };
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

function sanitizeTriggersPatch({ baseTriggers, triggerPatch }) {
  const base = Array.isArray(baseTriggers) ? baseTriggers.filter(isObjectLike) : [];
  if (base.length === 0 || !Array.isArray(triggerPatch)) {
    return null;
  }
  const result = base.map((item) => deepClone(item));
  for (let idx = 0; idx < result.length; idx += 1) {
    const baseTrigger = result[idx];
    const patch = findPatchByPlugin(triggerPatch, baseTrigger.plugin);
    if (!patch) {
      continue;
    }
    const event = String(patch.event || patch.params && patch.params.event || "")
      .trim()
      .toUpperCase();
    if (event) {
      baseTrigger.event = event;
    }
    const instances = toPatchNumber(
      patch.params && patch.params.instances,
      { min: 1, max: 10, integer: true }
    );
    if (instances !== null) {
      baseTrigger.params = isObjectLike(baseTrigger.params) ? baseTrigger.params : {};
      baseTrigger.params.instances = instances;
    }
  }
  return result;
}

function sanitizeSegmentPatch({ baseSegment, segmentPatch }) {
  if (!isObjectLike(baseSegment) || !isObjectLike(segmentPatch)) {
    return null;
  }
  if (String(segmentPatch.plugin || "").trim() && segmentPatch.plugin !== baseSegment.plugin) {
    return null;
  }
  const result = deepClone(baseSegment);
  const plugin = String(baseSegment.plugin || "").trim();
  const patchParams = isObjectLike(segmentPatch.params) ? segmentPatch.params : {};
  if (!isObjectLike(result.params)) {
    result.params = {};
  }
  if (plugin === "condition_segment_v1") {
    const logic = String(patchParams.logic || "").trim().toUpperCase();
    if (["AND", "OR"].includes(logic)) {
      result.params.logic = logic;
    }
    if (Array.isArray(patchParams.conditions)) {
      const nextConditions = patchParams.conditions
        .filter(isObjectLike)
        .map((item) => {
          const field = String(item.field || "").trim();
          const op = String(item.op || "").trim().toLowerCase();
          if (!field || !ALLOWED_CONDITION_OPS.has(op)) {
            return null;
          }
          return {
            field,
            op,
            value: deepClone(item.value)
          };
        })
        .filter(Boolean);
      if (nextConditions.length > 0) {
        result.params.conditions = nextConditions;
      }
    }
    return result;
  }
  if (plugin === "tag_segment_v1") {
    if (Array.isArray(patchParams.tags)) {
      const tags = Array.from(
        new Set(
          patchParams.tags
            .map((tag) => String(tag || "").trim())
            .filter(Boolean)
        )
      ).slice(0, 20);
      if (tags.length > 0) {
        result.params.tags = tags;
      }
    }
    return result;
  }
  if (plugin === "all_users_v1") {
    return result;
  }
  return null;
}

function sanitizeActionPatch({ baseAction, patchAction }) {
  const result = deepClone(baseAction);
  if (!isObjectLike(patchAction)) {
    return result;
  }
  const patchParams = isObjectLike(patchAction.params) ? patchAction.params : {};
  if (!isObjectLike(result.params)) {
    result.params = {};
  }
  const plugin = String(baseAction.plugin || "").trim();
  const cost = toPatchNumber(patchParams.cost, { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (cost !== null) {
    result.params.cost = cost;
  }
  if (String(patchAction.channel || "").trim()) {
    result.channel = String(patchAction.channel || "").trim();
  }
  if (plugin === "voucher_grant_v1") {
    const expiresInSec = toPatchNumber(patchParams.expires_in_sec, {
      min: 60,
      max: 30 * 24 * 60 * 60,
      integer: true
    });
    if (expiresInSec !== null) {
      result.params.expires_in_sec = expiresInSec;
    }
    const patchVoucher = isObjectLike(patchParams.voucher) ? patchParams.voucher : {};
    if (!isObjectLike(result.params.voucher)) {
      result.params.voucher = {};
    }
    if (String(patchVoucher.type || "").trim()) {
      result.params.voucher.type = String(patchVoucher.type || "").trim();
    }
    if (String(patchVoucher.name || "").trim()) {
      result.params.voucher.name = String(patchVoucher.name || "").trim();
    }
    const voucherValue = toPatchNumber(patchVoucher.value, { min: 0, max: Number.MAX_SAFE_INTEGER });
    if (voucherValue !== null) {
      result.params.voucher.value = voucherValue;
    }
    const minSpend = toPatchNumber(patchVoucher.minSpend, { min: 0, max: Number.MAX_SAFE_INTEGER });
    if (minSpend !== null) {
      result.params.voucher.minSpend = minSpend;
    }
    const discountRate = toPatchNumber(patchVoucher.discountRate, { min: 0, max: 1 });
    if (discountRate !== null) {
      result.params.voucher.discountRate = discountRate;
    }
    return result;
  }
  if (plugin === "wallet_grant_v1") {
    const amount = toPatchNumber(patchParams.amount, { min: 0, max: Number.MAX_SAFE_INTEGER });
    if (amount !== null) {
      result.params.amount = amount;
    }
    if (String(patchParams.account || "").trim()) {
      result.params.account = String(patchParams.account || "").trim();
    }
    return result;
  }
  if (plugin === "fragment_grant_v1") {
    const amount = toPatchNumber(patchParams.amount, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      integer: true
    });
    if (amount !== null) {
      result.params.amount = amount;
    }
    if (String(patchParams.type || "").trim()) {
      result.params.type = String(patchParams.type || "").trim();
    }
    return result;
  }
  if (plugin === "story_inject_v1" || plugin === "noop_v1") {
    return result;
  }
  return result;
}

function sanitizeActionsPatch({ baseActions, actionsPatch }) {
  const base = Array.isArray(baseActions) ? baseActions.filter(isObjectLike) : [];
  if (base.length === 0 || !Array.isArray(actionsPatch)) {
    return null;
  }
  return base.map((baseAction) =>
    sanitizeActionPatch({
      baseAction,
      patchAction: findPatchByPlugin(actionsPatch, baseAction.plugin)
    })
  );
}

function sanitizeConstraintPatch({ baseConstraint, patchConstraint }) {
  const result = deepClone(baseConstraint);
  if (!isObjectLike(patchConstraint)) {
    return result;
  }
  const params = isObjectLike(result.params) ? deepClone(result.params) : {};
  const patchParams = isObjectLike(patchConstraint.params) ? patchConstraint.params : {};
  const plugin = String(baseConstraint.plugin || "").trim();
  if (plugin === "budget_guard_v1" || plugin === "global_budget_guard_v1") {
    const cap = toPatchNumber(patchParams.cap, { min: 0, max: Number.MAX_SAFE_INTEGER });
    if (cap !== null) {
      params.cap = cap;
    }
    const costPerHit = toPatchNumber(patchParams.cost_per_hit, { min: 0, max: Number.MAX_SAFE_INTEGER });
    if (costPerHit !== null) {
      params.cost_per_hit = costPerHit;
    }
    const maxCostPerMinute = toPatchNumber(patchParams.max_cost_per_minute, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER
    });
    if (maxCostPerMinute !== null) {
      params.max_cost_per_minute = maxCostPerMinute;
    }
    if (plugin === "global_budget_guard_v1") {
      const bucketId = sanitizeKeyPart(patchParams.bucket_id, "");
      if (bucketId) {
        params.bucket_id = bucketId;
      }
      const scope = String(patchParams.scope || "").trim().toUpperCase();
      if (["POLICY", "MERCHANT"].includes(scope)) {
        params.scope = scope;
      }
    }
    result.params = params;
    return result;
  }
  if (plugin === "frequency_cap_v1") {
    const daily = toPatchNumber(patchParams.daily, { min: 1, max: 30, integer: true });
    if (daily !== null) {
      params.daily = daily;
    }
    const windowSec = toPatchNumber(patchParams.window_sec, {
      min: 60,
      max: 30 * 24 * 60 * 60,
      integer: true
    });
    if (windowSec !== null) {
      params.window_sec = windowSec;
    }
    result.params = params;
    return result;
  }
  if (plugin === "anti_fraud_hook_v1") {
    const maxRisk = toPatchNumber(patchParams.max_risk_score, { min: 0, max: 1 });
    if (maxRisk !== null) {
      params.max_risk_score = maxRisk;
    }
    result.params = params;
    return result;
  }
  if (plugin === "inventory_lock_v1") {
    const maxUnits = toPatchNumber(patchParams.max_units, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      integer: true
    });
    if (maxUnits !== null) {
      params.max_units = maxUnits;
    }
    const reserveUnits = toPatchNumber(patchParams.reserve_units, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      integer: true
    });
    if (reserveUnits !== null) {
      params.reserve_units = reserveUnits;
    }
    result.params = params;
    return result;
  }
  if (plugin === "kill_switch_v1") {
    return result;
  }
  return result;
}

function sanitizeConstraintsPatch({ baseConstraints, constraintsPatch }) {
  const base = Array.isArray(baseConstraints) ? baseConstraints.filter(isObjectLike) : [];
  if (base.length === 0 || !Array.isArray(constraintsPatch)) {
    return null;
  }
  return base.map((baseConstraint) =>
    sanitizeConstraintPatch({
      baseConstraint,
      patchConstraint: findPatchByPlugin(constraintsPatch, baseConstraint.plugin)
    })
  );
}

function sanitizePolicyPatch({ policyPatch, baseSpec }) {
  if (!isObjectLike(policyPatch)) {
    return {};
  }
  const safePatch = {};
  if (String(policyPatch.name || "").trim()) {
    safePatch.name = String(policyPatch.name || "").trim();
  }
  const lane = String(policyPatch.lane || "").trim().toUpperCase();
  if (ALLOWED_LANES.has(lane)) {
    safePatch.lane = lane;
  }
  const programPatch = sanitizeProgramPatch(policyPatch.program);
  if (programPatch) {
    safePatch.program = programPatch;
  }
  const triggersPatch = sanitizeTriggersPatch({
    baseTriggers: baseSpec && baseSpec.triggers,
    triggerPatch: policyPatch.triggers
  });
  if (triggersPatch) {
    safePatch.triggers = triggersPatch;
  }
  const segmentPatch = sanitizeSegmentPatch({
    baseSegment: baseSpec && baseSpec.segment,
    segmentPatch: policyPatch.segment
  });
  if (segmentPatch) {
    safePatch.segment = segmentPatch;
  }
  const actionsPatch = sanitizeActionsPatch({
    baseActions: baseSpec && baseSpec.actions,
    actionsPatch: policyPatch.actions
  });
  if (actionsPatch) {
    safePatch.actions = actionsPatch;
  }
  const constraintsPatch = sanitizeConstraintsPatch({
    baseConstraints: baseSpec && baseSpec.constraints,
    constraintsPatch: policyPatch.constraints
  });
  if (constraintsPatch) {
    safePatch.constraints = constraintsPatch;
  }
  return safePatch;
}

function addPatchViolation(violations, path, reason) {
  if (!Array.isArray(violations)) {
    return;
  }
  violations.push({
    path: String(path || ""),
    reason: String(reason || "invalid")
  });
}

function validateAllowedKeys({ target, allowedKeys, path, violations }) {
  if (!isObjectLike(target)) {
    addPatchViolation(violations, path, "must be an object");
    return;
  }
  const allowed = new Set(Array.isArray(allowedKeys) ? allowedKeys : []);
  for (const key of Object.keys(target)) {
    if (!allowed.has(key)) {
      addPatchViolation(violations, `${path}.${key}`, "field is not allowed");
    }
  }
}

function validatePolicyPatchAgainstBaseSpec({ policyPatch, baseSpec }) {
  const violations = [];
  if (!isObjectLike(policyPatch)) {
    return {
      ok: true,
      violations
    };
  }
  validateAllowedKeys({
    target: policyPatch,
    allowedKeys: ["name", "lane", "program", "triggers", "segment", "actions", "constraints"],
    path: "policyPatch",
    violations
  });

  if (hasOwn(policyPatch, "name") && String(policyPatch.name || "").trim().length === 0) {
    addPatchViolation(violations, "policyPatch.name", "name cannot be empty");
  }
  if (hasOwn(policyPatch, "lane")) {
    const lane = String(policyPatch.lane || "").trim().toUpperCase();
    if (lane && !ALLOWED_LANES.has(lane)) {
      addPatchViolation(violations, "policyPatch.lane", "lane is not allowed");
    }
  }

  if (isObjectLike(policyPatch.program)) {
    validateAllowedKeys({
      target: policyPatch.program,
      allowedKeys: ["ttl_sec", "pacing"],
      path: "policyPatch.program",
      violations
    });
    if (isObjectLike(policyPatch.program.pacing)) {
      validateAllowedKeys({
        target: policyPatch.program.pacing,
        allowedKeys: ["max_cost_per_minute"],
        path: "policyPatch.program.pacing",
        violations
      });
    } else if (hasOwn(policyPatch.program, "pacing")) {
      addPatchViolation(violations, "policyPatch.program.pacing", "must be an object");
    }
  } else if (hasOwn(policyPatch, "program")) {
    addPatchViolation(violations, "policyPatch.program", "must be an object");
  }

  const baseTriggerPlugins = new Set(
    (Array.isArray(baseSpec && baseSpec.triggers) ? baseSpec.triggers : [])
      .filter(isObjectLike)
      .map((item) => String(item.plugin || "").trim())
      .filter(Boolean)
  );
  if (Array.isArray(policyPatch.triggers)) {
    for (let idx = 0; idx < policyPatch.triggers.length; idx += 1) {
      const item = policyPatch.triggers[idx];
      const itemPath = `policyPatch.triggers[${idx}]`;
      if (!isObjectLike(item)) {
        addPatchViolation(violations, itemPath, "must be an object");
        continue;
      }
      validateAllowedKeys({
        target: item,
        allowedKeys: ["plugin", "event", "params"],
        path: itemPath,
        violations
      });
      const plugin = String(item.plugin || "").trim();
      if (!plugin || !baseTriggerPlugins.has(plugin)) {
        addPatchViolation(violations, `${itemPath}.plugin`, "plugin not allowed by template");
      }
      if (isObjectLike(item.params)) {
        validateAllowedKeys({
          target: item.params,
          allowedKeys: ["event", "instances"],
          path: `${itemPath}.params`,
          violations
        });
      } else if (hasOwn(item, "params")) {
        addPatchViolation(violations, `${itemPath}.params`, "must be an object");
      }
    }
  } else if (hasOwn(policyPatch, "triggers")) {
    addPatchViolation(violations, "policyPatch.triggers", "must be an array");
  }

  if (isObjectLike(policyPatch.segment)) {
    const baseSegmentPlugin = String(baseSpec && baseSpec.segment && baseSpec.segment.plugin || "").trim();
    validateAllowedKeys({
      target: policyPatch.segment,
      allowedKeys: ["plugin", "params"],
      path: "policyPatch.segment",
      violations
    });
    const segmentPlugin = String(policyPatch.segment.plugin || baseSegmentPlugin).trim();
    if (segmentPlugin && baseSegmentPlugin && segmentPlugin !== baseSegmentPlugin) {
      addPatchViolation(violations, "policyPatch.segment.plugin", "plugin must match template segment");
    }
    if (isObjectLike(policyPatch.segment.params)) {
      if (baseSegmentPlugin === "condition_segment_v1") {
        validateAllowedKeys({
          target: policyPatch.segment.params,
          allowedKeys: ["logic", "conditions"],
          path: "policyPatch.segment.params",
          violations
        });
      } else if (baseSegmentPlugin === "tag_segment_v1") {
        validateAllowedKeys({
          target: policyPatch.segment.params,
          allowedKeys: ["tags"],
          path: "policyPatch.segment.params",
          violations
        });
      } else if (baseSegmentPlugin === "all_users_v1") {
        validateAllowedKeys({
          target: policyPatch.segment.params,
          allowedKeys: [],
          path: "policyPatch.segment.params",
          violations
        });
      }
    } else if (hasOwn(policyPatch.segment, "params")) {
      addPatchViolation(violations, "policyPatch.segment.params", "must be an object");
    }
  } else if (hasOwn(policyPatch, "segment")) {
    addPatchViolation(violations, "policyPatch.segment", "must be an object");
  }

  const baseActionPlugins = new Set(
    (Array.isArray(baseSpec && baseSpec.actions) ? baseSpec.actions : [])
      .filter(isObjectLike)
      .map((item) => String(item.plugin || "").trim())
      .filter(Boolean)
  );
  if (Array.isArray(policyPatch.actions)) {
    for (let idx = 0; idx < policyPatch.actions.length; idx += 1) {
      const item = policyPatch.actions[idx];
      const itemPath = `policyPatch.actions[${idx}]`;
      if (!isObjectLike(item)) {
        addPatchViolation(violations, itemPath, "must be an object");
        continue;
      }
      validateAllowedKeys({
        target: item,
        allowedKeys: ["plugin", "channel", "params"],
        path: itemPath,
        violations
      });
      const plugin = String(item.plugin || "").trim();
      if (!plugin || !baseActionPlugins.has(plugin)) {
        addPatchViolation(violations, `${itemPath}.plugin`, "plugin not allowed by template");
      }
      if (isObjectLike(item.params)) {
        const commonAllowed = ["cost"];
        if (plugin === "voucher_grant_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: [...commonAllowed, "expires_in_sec", "voucher"],
            path: `${itemPath}.params`,
            violations
          });
          if (isObjectLike(item.params.voucher)) {
            validateAllowedKeys({
              target: item.params.voucher,
              allowedKeys: ["type", "name", "value", "minSpend", "discountRate"],
              path: `${itemPath}.params.voucher`,
              violations
            });
          } else if (hasOwn(item.params, "voucher")) {
            addPatchViolation(violations, `${itemPath}.params.voucher`, "must be an object");
          }
        } else if (plugin === "wallet_grant_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: [...commonAllowed, "amount", "account"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "fragment_grant_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: [...commonAllowed, "amount", "type"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "story_inject_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: commonAllowed,
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "noop_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: [],
            path: `${itemPath}.params`,
            violations
          });
        }
      } else if (hasOwn(item, "params")) {
        addPatchViolation(violations, `${itemPath}.params`, "must be an object");
      }
    }
  } else if (hasOwn(policyPatch, "actions")) {
    addPatchViolation(violations, "policyPatch.actions", "must be an array");
  }

  const baseConstraintPlugins = new Set(
    (Array.isArray(baseSpec && baseSpec.constraints) ? baseSpec.constraints : [])
      .filter(isObjectLike)
      .map((item) => String(item.plugin || "").trim())
      .filter(Boolean)
  );
  if (Array.isArray(policyPatch.constraints)) {
    for (let idx = 0; idx < policyPatch.constraints.length; idx += 1) {
      const item = policyPatch.constraints[idx];
      const itemPath = `policyPatch.constraints[${idx}]`;
      if (!isObjectLike(item)) {
        addPatchViolation(violations, itemPath, "must be an object");
        continue;
      }
      validateAllowedKeys({
        target: item,
        allowedKeys: ["plugin", "params"],
        path: itemPath,
        violations
      });
      const plugin = String(item.plugin || "").trim();
      if (!plugin || !baseConstraintPlugins.has(plugin)) {
        addPatchViolation(violations, `${itemPath}.plugin`, "plugin not allowed by template");
      }
      if (isObjectLike(item.params)) {
        if (plugin === "budget_guard_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: ["cap", "cost_per_hit", "max_cost_per_minute"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "global_budget_guard_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: ["cap", "cost_per_hit", "max_cost_per_minute", "bucket_id", "scope"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "frequency_cap_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: ["daily", "window_sec"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "anti_fraud_hook_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: ["max_risk_score"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "inventory_lock_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: ["max_units", "reserve_units"],
            path: `${itemPath}.params`,
            violations
          });
        } else if (plugin === "kill_switch_v1") {
          validateAllowedKeys({
            target: item.params,
            allowedKeys: [],
            path: `${itemPath}.params`,
            violations
          });
        }
      } else if (hasOwn(item, "params")) {
        addPatchViolation(violations, `${itemPath}.params`, "must be an object");
      }
    }
  } else if (hasOwn(policyPatch, "constraints")) {
    addPatchViolation(violations, "policyPatch.constraints", "must be an array");
  }

  return {
    ok: violations.length === 0,
    violations
  };
}

function validatePolicyPatchForTemplate({
  templateId,
  branchId,
  policyPatch = {}
}) {
  const template = findTemplate(templateId);
  if (!template) {
    throw new Error("strategy template not found");
  }
  const branch = resolveTemplateBranch(template, branchId);
  return validatePolicyPatchAgainstBaseSpec({
    policyPatch,
    baseSpec: branch.policySpec
  });
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
  const safePolicyPatch = sanitizePolicyPatch({
    policyPatch,
    baseSpec: branch.policySpec
  });
  const mergedSpec = mergePatch(branch.policySpec, safePolicyPatch);
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
  const templates = readTemplateCatalog();
  return templates.map((template) => ({
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

function hasConstraint(spec, pluginName) {
  const constraints = Array.isArray(spec && spec.constraints) ? spec.constraints : [];
  return constraints.some((item) => item && item.plugin === pluginName);
}

function collectSpecPlugins(spec) {
  const triggerPlugins = new Set(
    (Array.isArray(spec && spec.triggers) ? spec.triggers : [])
      .map((item) => String(item && item.plugin ? item.plugin : "").trim())
      .filter(Boolean)
  );
  const actionPlugins = new Set(
    (Array.isArray(spec && spec.actions) ? spec.actions : [])
      .map((item) => String(item && item.plugin ? item.plugin : "").trim())
      .filter(Boolean)
  );
  const constraintPlugins = new Set(
    (Array.isArray(spec && spec.constraints) ? spec.constraints : [])
      .map((item) => String(item && item.plugin ? item.plugin : "").trim())
      .filter(Boolean)
  );
  const segmentPlugin = String(spec && spec.segment && spec.segment.plugin ? spec.segment.plugin : "").trim();
  const scorerPlugin = String(spec && spec.scoring && spec.scoring.plugin ? spec.scoring.plugin : "").trim();
  return {
    triggerPlugins,
    actionPlugins,
    constraintPlugins,
    segmentPlugin,
    scorerPlugin
  };
}

function normalizeKnownPlugins(knownPlugins = null) {
  if (!knownPlugins || typeof knownPlugins !== "object") {
    return null;
  }
  return {
    triggers: new Set(Array.isArray(knownPlugins.triggers) ? knownPlugins.triggers : []),
    segments: new Set(Array.isArray(knownPlugins.segments) ? knownPlugins.segments : []),
    constraints: new Set(Array.isArray(knownPlugins.constraints) ? knownPlugins.constraints : []),
    scorers: new Set(Array.isArray(knownPlugins.scorers) ? knownPlugins.scorers : []),
    actions: new Set(Array.isArray(knownPlugins.actions) ? knownPlugins.actions : [])
  };
}

function validateStrategyTemplates({
  merchantId = "template_validation",
  knownPlugins = null,
  strict = false
} = {}) {
  const templates = readTemplateCatalog();
  const known = normalizeKnownPlugins(knownPlugins);
  const issues = [];
  let branchCount = 0;

  for (const template of templates) {
    for (const branch of template.branches || []) {
      branchCount += 1;
      let spec = null;
      try {
        spec = createPolicySpecFromTemplate({
          merchantId,
          templateId: template.templateId,
          branchId: branch.branchId
        }).spec;
      } catch (error) {
        issues.push({
          level: "ERROR",
          templateId: template.templateId,
          branchId: branch.branchId,
          message: error && error.message ? error.message : "spec validation failed"
        });
        continue;
      }

      if (!hasConstraint(spec, "kill_switch_v1")) {
        issues.push({
          level: "ERROR",
          templateId: template.templateId,
          branchId: branch.branchId,
          message: "missing required constraint: kill_switch_v1"
        });
      }
      if (!hasConstraint(spec, "budget_guard_v1") && !hasConstraint(spec, "global_budget_guard_v1")) {
        issues.push({
          level: "ERROR",
          templateId: template.templateId,
          branchId: branch.branchId,
          message: "missing required budget constraint: budget_guard_v1/global_budget_guard_v1"
        });
      }
      if (!hasConstraint(spec, "frequency_cap_v1")) {
        issues.push({
          level: "ERROR",
          templateId: template.templateId,
          branchId: branch.branchId,
          message: "missing required constraint: frequency_cap_v1"
        });
      }
      if (!(spec.governance && spec.governance.approval_required === true)) {
        issues.push({
          level: "ERROR",
          templateId: template.templateId,
          branchId: branch.branchId,
          message: "governance.approval_required must be true"
        });
      }

      if (known) {
        const specPlugins = collectSpecPlugins(spec);
        for (const plugin of specPlugins.triggerPlugins) {
          if (!known.triggers.has(plugin)) {
            issues.push({
              level: "ERROR",
              templateId: template.templateId,
              branchId: branch.branchId,
              message: `unknown trigger plugin: ${plugin}`
            });
          }
        }
        for (const plugin of specPlugins.actionPlugins) {
          if (!known.actions.has(plugin)) {
            issues.push({
              level: "ERROR",
              templateId: template.templateId,
              branchId: branch.branchId,
              message: `unknown action plugin: ${plugin}`
            });
          }
        }
        for (const plugin of specPlugins.constraintPlugins) {
          if (!known.constraints.has(plugin)) {
            issues.push({
              level: "ERROR",
              templateId: template.templateId,
              branchId: branch.branchId,
              message: `unknown constraint plugin: ${plugin}`
            });
          }
        }
        if (specPlugins.segmentPlugin && !known.segments.has(specPlugins.segmentPlugin)) {
          issues.push({
            level: "ERROR",
            templateId: template.templateId,
            branchId: branch.branchId,
            message: `unknown segment plugin: ${specPlugins.segmentPlugin}`
          });
        }
        if (specPlugins.scorerPlugin && !known.scorers.has(specPlugins.scorerPlugin)) {
          issues.push({
            level: "ERROR",
            templateId: template.templateId,
            branchId: branch.branchId,
            message: `unknown scorer plugin: ${specPlugins.scorerPlugin}`
          });
        }
      }
    }
  }

  const report = {
    ok: issues.length === 0,
    templateCount: templates.length,
    branchCount,
    issues
  };
  if (strict && !report.ok) {
    const formatted = issues
      .map((item) => `${item.templateId}/${item.branchId}: ${item.message}`)
      .join("; ");
    throw new Error(`strategy template validation failed: ${formatted}`);
  }
  return report;
}

function assertStrategyTemplatesValid(options = {}) {
  return validateStrategyTemplates({
    ...options,
    strict: true
  });
}

module.exports = {
  createPolicySpecFromTemplate,
  findTemplate,
  listStrategyTemplates,
  validatePolicyPatchForTemplate,
  validateStrategyTemplates,
  assertStrategyTemplatesValid
};
