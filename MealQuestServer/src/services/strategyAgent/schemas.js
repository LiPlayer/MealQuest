const { z } = require("zod");
const { MAX_PROPOSAL_CANDIDATES } = require("./constants");

const CRITIC_OUTPUT_ZOD_SCHEMA = z.object({
  needRevision: z.boolean(),
  summary: z.string(),
  issues: z.array(z.string()).max(8),
  focus: z.array(z.string()).max(6),
}).strict();

const REVISE_OUTPUT_ZOD_SCHEMA = z.object({
  assistantMessage: z.string(),
  proposals: z.array(
    z.object({
      templateId: z.string(),
      branchId: z.string(),
      title: z.string(),
      rationale: z.string(),
      confidence: z.number(),
      policyPatch: z.record(z.string(), z.unknown()),
    }).strict(),
  ).min(1).max(MAX_PROPOSAL_CANDIDATES),
}).strict();

const PROPOSAL_TOOL_INPUT_ZOD_SCHEMA = z.object({
  templateId: z.string(),
  branchId: z.string(),
  title: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  policyPatch: z.record(z.string(), z.unknown()).optional(),
}).strict();

module.exports = {
  CRITIC_OUTPUT_ZOD_SCHEMA,
  REVISE_OUTPUT_ZOD_SCHEMA,
  PROPOSAL_TOOL_INPUT_ZOD_SCHEMA,
};
