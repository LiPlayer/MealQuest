const { z } = require("zod");

const POLICY_SCHEMA_VERSION = "policyos.v1";
const STORY_SCHEMA_VERSION = "story.v1";

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
  lane: z.enum(["EMERGENCY", "GUARDED", "NORMAL", "BACKGROUND"]).default("NORMAL"),
  tie_breaker: z
    .enum(["UTILITY_DESC", "EXPIRY_SOONER", "HIGHER_MARGIN", "RANDOM_JITTER"])
    .default("UTILITY_DESC"),
  goal: z.object({
    type: z.string().min(1),
    kpi: z.string().min(1),
    target: z.any().optional()
  }),
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

const policyJsonSchemaV1 = {
  $id: POLICY_SCHEMA_VERSION,
  type: "object",
  required: [
    "schema_version",
    "policy_key",
    "name",
    "goal",
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
    lane: { enum: ["EMERGENCY", "GUARDED", "NORMAL", "BACKGROUND"] },
    tie_breaker: { enum: ["UTILITY_DESC", "EXPIRY_SOONER", "HIGHER_MARGIN", "RANDOM_JITTER"] }
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
    if (result.data.story) {
      validateStory(result.data.story);
    }
    return result.data;
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
  POLICY_SCHEMA_VERSION,
  STORY_SCHEMA_VERSION,
  createSchemaRegistry
};
