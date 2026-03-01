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

const TURN_DECISION_OUTPUT_ZOD_SCHEMA = z.object({
  mode: z.enum(["CHAT", "PROPOSAL"]),
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
  ).max(MAX_PROPOSAL_CANDIDATES).optional(),
}).strict();

module.exports = {
  CRITIC_OUTPUT_ZOD_SCHEMA,
  REVISE_OUTPUT_ZOD_SCHEMA,
  TURN_DECISION_OUTPUT_ZOD_SCHEMA,
};

