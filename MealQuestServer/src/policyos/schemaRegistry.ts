const { z } = require("zod");

const POLICY_SCHEMA_VERSION = "policyos.v1";
const STORY_SCHEMA_VERSION = "story.v1";
const POLICY_STAGES = ["ACQUISITION", "ACTIVATION", "ENGAGEMENT", "EXPANSION", "RETENTION"];
const OBJECTIVE_TARGET_METRIC = "MERCHANT_LONG_TERM_VALUE_30D";
const OBJECTIVE_WINDOW_DAYS = 30;

const triggerSchema = z.object({
  plugin: z.string().min(1),
  event: z.string().min(1).optional(),
  params: z.record(z.string(), z.any()).default({})
});

const pluginRefSchema = z.object({
  plugin: z.string().min(1),
  params: z.record(z.string(), z.any()).default({})
});

const actionSchema = z.object({
  plugin: z.string().min(1),
  channel: z.string().min(1).default("default"),
  params: z.record(z.string(), z.any()).default({})
});

const policyObjectiveSchema = z.object({
  targetMetric: z.string().min(1).optional(),
  windowDays: z.number().int().positive().optional(),
  valueFunction: z.string().min(1).optional(),
  weights: z
    .object({
      customerLtv: z.number().nonnegative().optional(),
      merchantNetProfit: z.number().nonnegative().optional(),
      platformProfit: z.number().nonnegative().optional()
    })
    .optional()
});

const policyObjectiveContractSchema = z
  .object({
    targetMetric: z.literal(OBJECTIVE_TARGET_METRIC).default(OBJECTIVE_TARGET_METRIC),
    windowDays: z.literal(OBJECTIVE_WINDOW_DAYS).default(OBJECTIVE_WINDOW_DAYS)
  })
  .strict();

const decisionSignalsSchema = z.object({
  upliftProbability: z.number().min(0).max(1).optional(),
  expectedMerchantProfitLift30d: z.number().optional(),
  expectedMerchantRevenueLift30d: z.number().optional(),
  intentScore: z.number().min(0).max(1).optional(),
  expectedProfit30dProxy: z.number().optional(),
  customerValue: z.number().optional(),
  merchantValue: z.number().optional(),
  platformValue: z.number().optional(),
  fatigueScore: z.number().nonnegative().optional(),
  riskScore: z.number().nonnegative().optional(),
  uncertainty: z.number().min(0).max(1).optional()
});

const decisionSignalsContractSchema = z
  .object({
    upliftProbability: z.number().min(0).max(1).default(0.5),
    expectedMerchantProfitLift30d: z.number().default(1),
    expectedMerchantRevenueLift30d: z.number().default(1),
    fatigueScore: z.number().nonnegative().default(0),
    riskScore: z.number().nonnegative().default(0),
    uncertainty: z.number().min(0).max(1).default(0.15)
  })
  .strict();

const gameSupportSchema = z.object({
  enabled: z.boolean().default(false),
  touchpoint: z.string().default("none")
});

const overlapPolicySchema = z.object({
  mode: z
    .enum(["HARD_EXCLUSIVE", "SOFT_EXCLUSIVE", "STACKABLE", "PREEMPTIVE"])
    .default("HARD_EXCLUSIVE"),
  conflict_set: z.string().min(1).default("default"),
  max_winners: z.number().int().positive().default(1),
  cooldown_sec: z.number().int().nonnegative().default(0)
});

const storyAssetSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional()
});

const storySchema = z.object({
  schema_version: z.string().default(STORY_SCHEMA_VERSION),
  templateId: z.string().min(1),
  narrative: z.string().min(1),
  assets: z.array(storyAssetSchema),
  triggers: z.array(z.string().min(1))
});

const policySpecSchema = z.object({
  schema_version: z.string().default(POLICY_SCHEMA_VERSION),
  policy_key: z.string().min(1),
  name: z.string().min(1),
  lane: z.enum(["GUARDED", "NORMAL", "BACKGROUND"]).default("NORMAL"),
  tie_breaker: z
    .enum(["UTILITY_DESC", "EXPIRY_SOONER", "HIGHER_MARGIN", "RANDOM_JITTER"])
    .default("UTILITY_DESC"),
  goal: z.object({
    type: z.string().min(1),
    kpi: z.string().min(1),
    target: z.any().optional()
  }),
  stage: z.enum(POLICY_STAGES).optional(),
  objective: policyObjectiveSchema.optional(),
  decisionSignals: decisionSignalsSchema.optional(),
  gameSupport: gameSupportSchema.optional(),
  segment: pluginRefSchema,
  triggers: z.array(triggerSchema).min(1),
  program: z.object({
    ttl_sec: z.number().int().positive().default(3600),
    max_instances: z.number().int().positive().default(1),
    pacing: z
      .object({
        max_cost_per_minute: z.number().nonnegative().default(Number.MAX_SAFE_INTEGER)
      })
      .default({ max_cost_per_minute: Number.MAX_SAFE_INTEGER })
  }),
  actions: z.array(actionSchema).min(1),
  constraints: z.array(pluginRefSchema).default([]),
  scoring: pluginRefSchema,
  story: storySchema.optional(),
  overlap_policy: overlapPolicySchema.default({
    mode: "HARD_EXCLUSIVE",
    conflict_set: "default",
    max_winners: 1,
    cooldown_sec: 0
  }),
  resource_scope: z.object({
    merchant_id: z.string().min(1),
    store_id: z.string().optional()
  }),
  governance: z.object({
    approval_required: z.boolean().default(true),
    approval_level: z.enum(["OWNER", "MANAGER"]).default("OWNER"),
    approval_token_ttl_sec: z.number().int().positive().default(3600)
  })
});

function inferStageFromGoal(goalType = "") {
  const normalized = String(goalType || "").trim().toUpperCase();
  if (normalized === "ACQUISITION") {
    return "ACQUISITION";
  }
  if (normalized === "ACTIVATION") {
    return "ACTIVATION";
  }
  if (normalized === "REVENUE") {
    return "EXPANSION";
  }
  if (normalized === "RETENTION") {
    return "RETENTION";
  }
  if (normalized === "SOCIAL_VIRAL" || normalized === "MINI_GAME_OPS") {
    return "ENGAGEMENT";
  }
  if (POLICY_STAGES.includes(normalized)) {
    return normalized;
  }
  return "ENGAGEMENT";
}

function normalizeObjectiveContract(objective) {
  const safe = objective && typeof objective === "object" ? objective : {};
  return policyObjectiveContractSchema.parse({
    targetMetric: safe.targetMetric || OBJECTIVE_TARGET_METRIC,
    windowDays: safe.windowDays || OBJECTIVE_WINDOW_DAYS
  });
}

function toFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

function normalizeDecisionSignalsContract(decisionSignals) {
  const safe = decisionSignals && typeof decisionSignals === "object" ? decisionSignals : {};
  const upliftProbability = toFiniteNumber(safe.upliftProbability, safe.intentScore, 0.5);
  const expectedMerchantProfitLift30d = toFiniteNumber(
    safe.expectedMerchantProfitLift30d,
    safe.merchantValue,
    safe.expectedProfit30dProxy,
    safe.customerValue,
    1
  );
  const expectedMerchantRevenueLift30d = toFiniteNumber(
    safe.expectedMerchantRevenueLift30d,
    safe.customerValue,
    expectedMerchantProfitLift30d
  );
  return decisionSignalsContractSchema.parse({
    upliftProbability,
    expectedMerchantProfitLift30d,
    expectedMerchantRevenueLift30d,
    fatigueScore: toFiniteNumber(safe.fatigueScore, 0),
    riskScore: toFiniteNumber(safe.riskScore, 0),
    uncertainty: toFiniteNumber(safe.uncertainty, 0.15)
  });
}

function normalizePolicySpecContract(spec) {
  const safe = spec && typeof spec === "object" ? spec : {};
  const objective = normalizeObjectiveContract(safe.objective);
  const decisionSignals = normalizeDecisionSignalsContract(safe.decisionSignals);
  const gameSupport =
    safe.gameSupport && typeof safe.gameSupport === "object"
      ? safe.gameSupport
      : gameSupportSchema.parse({});
  return {
    ...safe,
    stage: safe.stage || inferStageFromGoal(safe.goal && safe.goal.type),
    objective,
    decisionSignals,
    gameSupport
  };
}

const policyJsonSchemaV1 = {
  $id: POLICY_SCHEMA_VERSION,
  type: "object",
  required: [
    "schema_version",
    "policy_key",
    "name",
    "goal",
    "stage",
    "objective",
    "segment",
    "triggers",
    "program",
    "actions",
    "constraints",
    "scoring",
    "resource_scope",
    "governance"
  ],
  properties: {
    schema_version: { type: "string", const: POLICY_SCHEMA_VERSION },
    policy_key: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    lane: { enum: ["GUARDED", "NORMAL", "BACKGROUND"] },
    tie_breaker: { enum: ["UTILITY_DESC", "EXPIRY_SOONER", "HIGHER_MARGIN", "RANDOM_JITTER"] },
    stage: { enum: POLICY_STAGES }
  }
};

const storyJsonSchemaV1 = {
  $id: STORY_SCHEMA_VERSION,
  type: "object",
  required: ["schema_version", "templateId", "narrative", "assets", "triggers"],
  properties: {
    schema_version: { type: "string", const: STORY_SCHEMA_VERSION },
    templateId: { type: "string", minLength: 1 },
    narrative: { type: "string", minLength: 1 },
    assets: { type: "array" },
    triggers: { type: "array" }
  }
};

function flattenIssues(issues = []) {
  return issues.map((item) => ({
    path: item.path.join("."),
    message: item.message
  }));
}

function createSchemaRegistry() {
  const schemas = new Map([
    [POLICY_SCHEMA_VERSION, policyJsonSchemaV1],
    [STORY_SCHEMA_VERSION, storyJsonSchemaV1]
  ]);

  function listSchemas() {
    return Array.from(schemas.entries()).map(([version, schema]) => ({
      version,
      schema
    }));
  }

  function validateStory(payload) {
    const result = storySchema.safeParse(payload);
    if (!result.success) {
      const error = new Error("invalid story schema");
      error.code = "POLICY_SCHEMA_INVALID";
      error.details = flattenIssues(result.error.issues);
      throw error;
    }
    return result.data;
  }

  function validatePolicySpec(payload) {
    const result = policySpecSchema.safeParse(payload);
    if (!result.success) {
      const error = new Error("invalid policy schema");
      error.code = "POLICY_SCHEMA_INVALID";
      error.details = flattenIssues(result.error.issues);
      throw error;
    }
    let normalized;
    try {
      normalized = normalizePolicySpecContract(result.data);
    } catch (error) {
      if (error && Array.isArray(error.issues)) {
        const schemaError = new Error("invalid policy schema");
        schemaError.code = "POLICY_SCHEMA_INVALID";
        schemaError.details = flattenIssues(error.issues);
        throw schemaError;
      }
      throw error;
    }
    if (normalized.story) {
      validateStory(normalized.story);
    }
    return normalized;
  }

  function getSchema(version) {
    return schemas.get(version) || null;
  }

  return {
    getSchema,
    listSchemas,
    validatePolicySpec,
    validateStory
  };
}

module.exports = {
  OBJECTIVE_TARGET_METRIC,
  OBJECTIVE_WINDOW_DAYS,
  POLICY_SCHEMA_VERSION,
  STORY_SCHEMA_VERSION,
  createSchemaRegistry
};
