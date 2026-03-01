const {
  createPolicySpecFromTemplate,
  listStrategyTemplates,
  validatePolicyPatchForTemplate,
} = require("./strategyTemplateCatalog");
const { createLangChainModelGateway } = require("./aiStrategy/langchainModelGateway");

const DEFAULT_REMOTE_PROVIDER = "deepseek";
const REMOTE_PROVIDERS = new Set(["deepseek", "openai"]);
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_TIMEOUT_MS = 30000;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";
const DEEPSEEK_DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_PROPOSAL_CANDIDATES = 12;
const MAX_HISTORY_ITEMS_FOR_PROMPT = 48;
const MAX_HISTORY_TOKENS_FOR_PROMPT = 2600;
const MAX_HISTORY_TEXT_CHARS = 640;
const MAX_MEMORY_PREFIX_HISTORY_ITEMS = 2;
const DEFAULT_CRITIC_ENABLED = true;
const DEFAULT_CRITIC_MAX_ROUNDS = 1;
const DEFAULT_CRITIC_MIN_PROPOSALS = 2;
const DEFAULT_CRITIC_MIN_CONFIDENCE = 0.72;
const CRITIC_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["needRevision", "summary", "issues", "focus"],
  properties: {
    needRevision: { type: "boolean" },
    summary: { type: "string" },
    issues: {
      type: "array",
      items: { type: "string" },
      maxItems: 8
    },
    focus: {
      type: "array",
      items: { type: "string" },
      maxItems: 6
    }
  }
};
const REVISE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "proposals"],
  properties: {
    assistantMessage: { type: "string" },
    proposals: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PROPOSAL_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "templateId",
          "branchId",
          "title",
          "rationale",
          "confidence",
          "policyPatch"
        ],
        properties: {
          templateId: { type: "string" },
          branchId: { type: "string" },
          title: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number" },
          policyPatch: { type: "object" }
        }
      }
    }
  }
};

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBooleanLike(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = asString(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toRawLogText(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
}

function printRawBlock(enabled, label, payload) {
  if (!enabled) {
    return;
  }
  const text = toRawLogText(payload);
  console.log(`[ai-strategy] [raw] ${label}_BEGIN`);
  console.log(text);
  console.log(`[ai-strategy] [raw] ${label}_END`);
}

function buildStructuredOutputOptions(name, schema) {
  return {
    structuredOutput: {
      name: asString(name) || "mq_structured_output",
      strict: true,
      schema: isObjectLike(schema) ? schema : { type: "object" }
    }
  };
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeProvider(value) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) {
    return DEFAULT_REMOTE_PROVIDER;
  }
  if (REMOTE_PROVIDERS.has(normalized)) {
    return normalized;
  }
  return DEFAULT_REMOTE_PROVIDER;
}

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

function parseJsonStrict(raw) {
  const direct = asString(raw);
  if (!direct) {
    throw new Error("empty ai response");
  }
  return JSON.parse(direct);
}

function findTemplateById(templates, templateId) {
  const normalized = asString(templateId);
  if (!normalized) {
    return null;
  }
  return templates.find((item) => item.templateId === normalized) || null;
}

function resolveTemplateAndBranch({
  templateId,
  branchId,
  aiTemplateId,
  aiBranchId,
  templates,
}) {
  const template =
    findTemplateById(templates, aiTemplateId) ||
    findTemplateById(templates, templateId) ||
    templates[0] ||
    null;
  if (!template) {
    throw new Error("strategy template not found");
  }

  const resolvedBranchId =
    asString(aiBranchId) ||
    asString(branchId) ||
    asString(template.defaultBranchId);
  const branch =
    template.branches.find((item) => item.branchId === resolvedBranchId) ||
    template.branches.find((item) => item.branchId === template.defaultBranchId) ||
    template.branches[0];
  if (!branch) {
    throw new Error("strategy branch not found");
  }
  return {
    templateId: template.templateId,
    branchId: branch.branchId,
  };
}

function normalizeAiDecision({
  input,
  rawDecision,
  provider,
  model,
  templates,
}) {
  const resolvedTemplates =
    Array.isArray(templates) && templates.length > 0
      ? templates
      : listStrategyTemplates();
  const decision = isObjectLike(rawDecision) ? rawDecision : {};
  const resolved = resolveTemplateAndBranch({
    templateId: input.templateId,
    branchId: input.branchId,
    aiTemplateId: decision.templateId,
    aiBranchId: decision.branchId,
    templates: resolvedTemplates,
  });
  const mergedOverrides = mergePatch(
    decision.policyPatch || decision.spec || {},
    input.overrides || {}
  );
  const patchValidation = validatePolicyPatchForTemplate({
    templateId: resolved.templateId,
    branchId: resolved.branchId,
    policyPatch: mergedOverrides
  });
  if (!patchValidation.ok) {
    const error = new Error("policyPatch contains illegal fields");
    error.patchViolations = patchValidation.violations;
    throw error;
  }
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: input.merchantId,
    templateId: resolved.templateId,
    branchId: resolved.branchId,
    policyPatch: mergedOverrides,
  });
  const aiConfidence = Number(decision.confidence);
  const confidence = Number.isFinite(aiConfidence)
    ? Math.max(0, Math.min(1, aiConfidence))
    : null;
  const strategyMeta = {
    templateId: template.templateId,
    templateName: template.name,
    branchId: branch.branchId,
    branchName: branch.name,
    category: template.category,
    source: "AI_MODEL",
    provider: provider.toUpperCase(),
    model: asString(model) || "unknown",
    rationale: asString(decision.rationale),
    confidence,
  };

  return {
    title: asString(decision.title) || spec.name || `${template.name} - ${branch.name} - AI`,
    spec,
    template,
    branch,
    strategyMeta,
  };
}

function summarizeError(error) {
  const raw =
    (error && typeof error.message === "string" && error.message) ||
    String(error || "unknown error");
  return raw.replace(/\s+/g, " ").slice(0, 180);
}

function createAiUnavailableResult(reason) {
  return {
    status: "AI_UNAVAILABLE",
    reason: asString(reason) || "AI model is unavailable",
  };
}

function truncateText(value, maxLen = 240) {
  const text = asString(value);
  if (!text) {
    return "";
  }
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...`;
}

function estimateTokenCount(value) {
  const text = asString(value);
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4) + 4;
}

function estimateHistoryItemTokens(item) {
  if (!isObjectLike(item)) {
    return 0;
  }
  return (
    estimateTokenCount(item.role) +
    estimateTokenCount(item.type) +
    estimateTokenCount(item.text) +
    8
  );
}

function sanitizeHistoryForPrompt(history) {
  const normalized = Array.isArray(history)
    ? history.map((item) => ({
      role: asString(item && item.role ? item.role : "ASSISTANT").toUpperCase(),
      type: asString(item && item.type ? item.type : "TEXT").toUpperCase(),
      text: truncateText(item && item.text ? item.text : "", MAX_HISTORY_TEXT_CHARS),
      proposalId: asString(item && item.proposalId ? item.proposalId : ""),
      createdAt: asString(item && item.createdAt ? item.createdAt : ""),
    }))
    : [];
  if (normalized.length === 0) {
    return [];
  }

  const memoryPrefix = [];
  const stream = [];
  for (const item of normalized) {
    const isMemoryPrefix =
      item.role === "SYSTEM" && (item.type === "MEMORY_SUMMARY" || item.type === "MEMORY_FACTS");
    if (isMemoryPrefix) {
      memoryPrefix.push(item);
      continue;
    }
    stream.push(item);
  }

  const pinnedMemory = memoryPrefix.slice(-MAX_MEMORY_PREFIX_HISTORY_ITEMS);
  const pinnedTokens = pinnedMemory.reduce((sum, item) => sum + estimateHistoryItemTokens(item), 0);
  const tokenBudget = Math.max(600, MAX_HISTORY_TOKENS_FOR_PROMPT - pinnedTokens);
  const selected = [];
  let usedTokens = 0;
  for (let idx = stream.length - 1; idx >= 0; idx -= 1) {
    const item = stream[idx];
    const tokenCost = Math.max(1, estimateHistoryItemTokens(item));
    if (
      selected.length > 0 &&
      (usedTokens + tokenCost > tokenBudget ||
        selected.length + pinnedMemory.length >= MAX_HISTORY_ITEMS_FOR_PROMPT)
    ) {
      break;
    }
    selected.push(item);
    usedTokens += tokenCost;
  }
  selected.reverse();
  return [...pinnedMemory, ...selected].slice(-MAX_HISTORY_ITEMS_FOR_PROMPT);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value) {
  return Math.round(Math.max(0, toFiniteNumber(value, 0)) * 100) / 100;
}

function toRatio(value) {
  const parsed = toFiniteNumber(value, 0);
  const clamped = Math.max(0, Math.min(1, parsed));
  return Number(clamped.toFixed(4));
}

function sanitizeSalesAggregate(input) {
  const aggregate = isObjectLike(input) ? input : {};
  const ordersPaidCount = Math.max(0, Math.floor(toFiniteNumber(aggregate.ordersPaidCount, 0)));
  const externalPaidCount = Math.max(0, Math.floor(toFiniteNumber(aggregate.externalPaidCount, 0)));
  const walletOnlyPaidCount = Math.max(0, Math.floor(toFiniteNumber(aggregate.walletOnlyPaidCount, 0)));
  return {
    ordersPaidCount,
    externalPaidCount,
    walletOnlyPaidCount,
    gmvPaid: toMoney(aggregate.gmvPaid),
    refundAmount: toMoney(aggregate.refundAmount),
    netRevenue: toMoney(aggregate.netRevenue),
    aov: toMoney(aggregate.aov),
    refundRate: toRatio(aggregate.refundRate),
  };
}

function sanitizeSalesSnapshot(input) {
  if (!isObjectLike(input)) {
    return null;
  }

  const windows = Array.isArray(input.windows)
    ? input.windows.slice(0, 3).map((item) => ({
      days: Math.max(1, Math.floor(toFiniteNumber(item && item.days, 0))),
      ...sanitizeSalesAggregate(item),
    }))
    : [];

  return {
    generatedAt: asString(input.generatedAt),
    currency: asString(input.currency || "CNY").toUpperCase(),
    totals: sanitizeSalesAggregate(input.totals),
    windows,
    paymentStatusSummary: {
      totalPayments: Math.max(0, Math.floor(toFiniteNumber(input.paymentStatusSummary && input.paymentStatusSummary.totalPayments, 0))),
      paidCount: Math.max(0, Math.floor(toFiniteNumber(input.paymentStatusSummary && input.paymentStatusSummary.paidCount, 0))),
      pendingExternalCount: Math.max(
        0,
        Math.floor(toFiniteNumber(input.paymentStatusSummary && input.paymentStatusSummary.pendingExternalCount, 0)),
      ),
      failedExternalCount: Math.max(
        0,
        Math.floor(toFiniteNumber(input.paymentStatusSummary && input.paymentStatusSummary.failedExternalCount, 0)),
      ),
    },
  };
}

function inferIntentFrame({
  userMessage,
  salesSnapshot = null
}) {
  const text = asString(userMessage);
  const lower = text.toLowerCase();
  const matchAny = (patterns) => patterns.some((item) => lower.includes(item));
  const containsChinese = (patterns) => patterns.some((item) => text.includes(item));

  let primaryGoal = "GENERAL";
  if (matchAny(["acquisition", "new user", "onboard"]) || containsChinese(["拉新", "新客", "获客"])) {
    primaryGoal = "ACQUISITION";
  } else if (matchAny(["retention", "wake up", "reactivate", "winback"]) || containsChinese(["复购", "召回", "唤醒", "沉默"])) {
    primaryGoal = "RETENTION";
  } else if (matchAny(["clear stock", "inventory", "sell-through"]) || containsChinese(["清库存", "库存", "滞销"])) {
    primaryGoal = "CLEAR_STOCK";
  } else if (matchAny(["aov", "average order", "basket"]) || containsChinese(["客单", "客单价", "连带"])) {
    primaryGoal = "AOV";
  }

  let urgency = "LOW";
  if (matchAny(["urgent", "asap", "immediately", "right now"]) || containsChinese(["紧急", "马上", "立刻", "立即"])) {
    urgency = "HIGH";
  } else if (matchAny(["today", "tonight", "this week"]) || containsChinese(["今天", "今晚", "本周"])) {
    urgency = "MEDIUM";
  }

  let riskPreference = "BALANCED";
  if (matchAny(["aggressive", "extreme", "max growth"]) || containsChinese(["激进", "冲量", "放量"])) {
    riskPreference = "AGGRESSIVE";
  } else if (matchAny(["conservative", "safe", "low risk"]) || containsChinese(["保守", "稳健", "低风险"])) {
    riskPreference = "CONSERVATIVE";
  }

  const budgetPatterns = [
    /budget\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    /预算\s*[:：]?\s*(\d+(?:\.\d+)?)/,
  ];
  let budgetHint = null;
  for (const pattern of budgetPatterns) {
    const matched = text.match(pattern);
    if (matched && matched[1]) {
      const parsed = Number(matched[1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        budgetHint = Math.round(parsed * 100) / 100;
        break;
      }
    }
  }

  let timeWindowHint = "";
  if (matchAny(["today", "tonight"]) || containsChinese(["今天", "今晚"])) {
    timeWindowHint = "TODAY";
  } else if (matchAny(["this week", "weekend"]) || containsChinese(["本周", "周末"])) {
    timeWindowHint = "THIS_WEEK";
  } else if (matchAny(["this month"]) || containsChinese(["本月"])) {
    timeWindowHint = "THIS_MONTH";
  }

  const requiresProposal =
    matchAny(["create", "generate", "draft", "proposal", "publish strategy"]) ||
    containsChinese(["生成", "创建", "提案", "策略", "上活动", "发布策略"]);

  return {
    primaryGoal,
    urgency,
    riskPreference,
    budgetHint,
    timeWindowHint,
    requiresProposal,
    salesSnapshotAvailable: Boolean(salesSnapshot),
  };
}

function sanitizeExecutionHistory(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.slice(-20).map((item) => {
    const details = isObjectLike(item && item.details) ? item.details : {};
    const compactDetails = {};
    for (const [key, value] of Object.entries(details)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        compactDetails[key] = value;
        continue;
      }
      compactDetails[key] = truncateText(value, 120);
    }
    return {
      timestamp: asString(item && item.timestamp),
      action: asString(item && item.action).toUpperCase(),
      status: asString(item && item.status).toUpperCase(),
      details: compactDetails,
    };
  });
}

const PROTOCOL_NAME = "MQ_STRATEGY_CHAT";
const PROTOCOL_VERSION = "2.0";
const STRUCTURED_SCHEMA_VERSION = "2026-02-27";
const DECISION_ENVELOPE_START_MARKERS = [
  "\n{\"schemaVersion\"",
  "{\"schemaVersion\"",
];
const DECISION_ENVELOPE_MAX_MARKER_LEN = DECISION_ENVELOPE_START_MARKERS.reduce(
  (max, marker) => Math.max(max, marker.length),
  0
);

function findDecisionEnvelopeStart(text, fromIndex = 0) {
  const source = asString(text);
  if (!source) {
    return -1;
  }
  const start = Math.max(0, Math.floor(Number(fromIndex) || 0));
  let first = -1;
  for (const marker of DECISION_ENVELOPE_START_MARKERS) {
    const idx = source.indexOf(marker, start);
    if (idx >= 0) {
      if (first < 0 || idx < first) {
        first = idx;
      }
    }
  }
  return first;
}

function coerceProposalCandidates(decision) {
  const safeDecision = isObjectLike(decision) ? decision : {};
  const rawCandidates = [];
  if (Array.isArray(safeDecision.proposals)) {
    rawCandidates.push(...safeDecision.proposals.filter(isObjectLike));
  }
  if (isObjectLike(safeDecision.proposal)) {
    rawCandidates.push(safeDecision.proposal);
  }
  return rawCandidates.slice(0, MAX_PROPOSAL_CANDIDATES);
}

function normalizeCandidatesFromRaw({ rawCandidates, input, provider, model }) {
  const normalizedCandidates = [];
  const invalidCandidates = [];
  for (const candidate of rawCandidates.slice(0, MAX_PROPOSAL_CANDIDATES)) {
    try {
      const normalized = normalizeAiDecision({
        input: {
          merchantId: input.merchantId,
          templateId: asString(candidate.templateId) || input.templateId,
          branchId: asString(candidate.branchId) || input.branchId,
          overrides: {},
        },
        rawDecision: candidate,
        provider,
        model,
        templates: listStrategyTemplates(),
      });
      normalizedCandidates.push(normalized);
    } catch (error) {
      invalidCandidates.push({
        templateId: asString(candidate && candidate.templateId),
        branchId: asString(candidate && candidate.branchId),
        title: asString(candidate && candidate.title),
        reason: error && error.message ? String(error.message) : "invalid candidate",
        violations:
          Array.isArray(error && error.patchViolations) && error.patchViolations.length > 0
            ? error.patchViolations.map((item) => ({
              path: asString(item && item.path),
              reason: asString(item && item.reason)
            }))
            : []
      });
    }
  }
  return {
    normalizedCandidates,
    invalidCandidates
  };
}

function summarizeProposalsForCritic(proposals) {
  const safeItems = Array.isArray(proposals) ? proposals : [];
  return safeItems.slice(0, MAX_PROPOSAL_CANDIDATES).map((item, idx) => {
    const spec = isObjectLike(item && item.spec) ? item.spec : {};
    const constraints = Array.isArray(spec.constraints) ? spec.constraints : [];
    const budget = constraints.find((entry) =>
      entry && (entry.plugin === "budget_guard_v1" || entry.plugin === "global_budget_guard_v1")
    );
    return {
      rank: idx + 1,
      title: asString(item && item.title),
      templateId: asString(item && item.template && item.template.templateId),
      branchId: asString(item && item.branch && item.branch.branchId),
      confidence: toFiniteNumber(item && item.strategyMeta && item.strategyMeta.confidence, 0),
      triggerEvent: asString(spec && spec.triggers && spec.triggers[0] && spec.triggers[0].event).toUpperCase(),
      lane: asString(spec && spec.lane).toUpperCase(),
      ttlSec: Math.max(0, Math.floor(toFiniteNumber(spec && spec.program && spec.program.ttl_sec, 0))),
      budgetCap: Math.max(
        0,
        Math.floor(toFiniteNumber(budget && budget.params && budget.params.cap, 0))
      ),
      costPerHit: Math.max(
        0,
        Math.floor(toFiniteNumber(budget && budget.params && budget.params.cost_per_hit, 0))
      ),
      rationale: truncateText(item && item.strategyMeta && item.strategyMeta.rationale, 180)
    };
  });
}

function normalizeCriticDecision(raw) {
  const input = isObjectLike(raw) ? raw : {};
  const issues = Array.isArray(input.issues)
    ? input.issues.map((item) => truncateText(item, 160)).filter(Boolean).slice(0, 8)
    : [];
  const focus = Array.isArray(input.focus)
    ? input.focus.map((item) => truncateText(item, 120)).filter(Boolean).slice(0, 6)
    : [];
  const needRevision = Boolean(input.needRevision || input.need_revision);
  return {
    needRevision,
    issues,
    focus,
    summary: truncateText(input.summary, 240)
  };
}

function summarizeValidationIssues(validationIssues) {
  const items = Array.isArray(validationIssues) ? validationIssues : [];
  const lines = [];
  for (const item of items.slice(0, MAX_PROPOSAL_CANDIDATES)) {
    const title = asString(item && item.title) || `${asString(item && item.templateId)}:${asString(item && item.branchId)}`;
    const baseReason = asString(item && item.reason) || "invalid candidate";
    lines.push(`${title || "candidate"}: ${baseReason}`);
    const violations = Array.isArray(item && item.violations) ? item.violations : [];
    for (const violation of violations.slice(0, 4)) {
      const path = asString(violation && violation.path) || "policyPatch";
      const reason = asString(violation && violation.reason) || "invalid";
      lines.push(`${path}: ${reason}`);
    }
  }
  return lines.slice(0, 12);
}

function shouldRunCriticLoop({
  turn,
  minProposals,
  minConfidence
}) {
  if (!turn || turn.status !== "PROPOSAL_READY") {
    return false;
  }
  const proposals = Array.isArray(turn.proposals) ? turn.proposals : [];
  if (proposals.length === 0) {
    return false;
  }
  if (proposals.length >= Math.max(1, Math.floor(toFiniteNumber(minProposals, 2)))) {
    return true;
  }
  const threshold = Math.max(0, Math.min(1, toFiniteNumber(minConfidence, DEFAULT_CRITIC_MIN_CONFIDENCE)));
  return proposals.some(
    (item) => toFiniteNumber(item && item.strategyMeta && item.strategyMeta.confidence, 0) < threshold
  );
}

function parseAssistantDecisionEnvelope(rawText) {
  const text = asString(rawText);
  const envelopeStartIdx = findDecisionEnvelopeStart(text);
  if (envelopeStartIdx < 0) {
    return {
      assistantMessage: text,
      sourceFormat: "text_only",
      schemaVersion: STRUCTURED_SCHEMA_VERSION,
      decision: {},
      forceProposal: false,
      rawCandidates: [],
      parseError: false,
    };
  }
  const assistantPrefix = text.slice(0, envelopeStartIdx).trim();
  const decisionText = text.slice(envelopeStartIdx).trim();
  try {
    const parsed = parseJsonStrict(decisionText);
    const decision = isObjectLike(parsed) ? parsed : {};
    const mode = asString(decision.mode).toUpperCase();
    return {
      assistantMessage: asString(decision.assistantMessage) || assistantPrefix,
      sourceFormat: "text_plus_json",
      schemaVersion: asString(decision.schemaVersion) || STRUCTURED_SCHEMA_VERSION,
      decision,
      forceProposal: mode === "PROPOSAL",
      rawCandidates: coerceProposalCandidates(decision),
      parseError: false,
    };
  } catch {
    return {
      assistantMessage: assistantPrefix || text,
      sourceFormat: "invalid_json",
      schemaVersion: STRUCTURED_SCHEMA_VERSION,
      decision: {},
      forceProposal: false,
      rawCandidates: [],
      parseError: true,
    };
  }
}

function buildTurnFromCandidateEvaluation({
  assistantMessage,
  sourceFormat,
  schemaVersion,
  forceProposal,
  parseError = false,
  normalizedCandidates = [],
  invalidCandidates = [],
}) {
  if (parseError) {
    return {
      status: "CHAT_REPLY",
      assistantMessage: assistantMessage || "",
      protocol: {
        name: PROTOCOL_NAME,
        version: PROTOCOL_VERSION,
        constrained: true,
        sourceFormat: "parse_error",
        schemaVersion: STRUCTURED_SCHEMA_VERSION,
      },
    };
  }

  const safeNormalized = Array.isArray(normalizedCandidates) ? normalizedCandidates : [];
  const safeInvalid = Array.isArray(invalidCandidates) ? invalidCandidates : [];
  const resolvedSchemaVersion = asString(schemaVersion) || STRUCTURED_SCHEMA_VERSION;

  if (forceProposal && safeNormalized.length === 0 && safeInvalid.length > 0) {
    return {
      status: "PROPOSAL_READY",
      assistantMessage:
        assistantMessage || "I drafted options but need to revise invalid fields before submission.",
      proposals: [],
      proposal: null,
      validationIssues: safeInvalid,
      protocol: {
        name: PROTOCOL_NAME,
        version: PROTOCOL_VERSION,
        constrained: true,
        sourceFormat,
        schemaVersion: resolvedSchemaVersion,
        validationIssueCount: safeInvalid.length
      },
    };
  }
  if (forceProposal && safeNormalized.length === 0) {
    return {
      status: "CHAT_REPLY",
      assistantMessage:
        assistantMessage || "I can draft strategy options once budget and audience are confirmed.",
      protocol: {
        name: PROTOCOL_NAME,
        version: PROTOCOL_VERSION,
        constrained: true,
        sourceFormat,
        schemaVersion: resolvedSchemaVersion,
      },
    };
  }
  if (safeNormalized.length > 0) {
    return {
      status: "PROPOSAL_READY",
      assistantMessage: assistantMessage || "Strategy proposal drafted. Please review immediately.",
      proposals: safeNormalized,
      proposal: safeNormalized[0],
      validationIssues: safeInvalid,
      protocol: {
        name: PROTOCOL_NAME,
        version: PROTOCOL_VERSION,
        constrained: true,
        sourceFormat,
        schemaVersion: resolvedSchemaVersion,
        validationIssueCount: safeInvalid.length
      },
    };
  }
  return {
    status: "CHAT_REPLY",
    assistantMessage: assistantMessage || "Please tell me your goal, budget, and expected time window.",
    protocol: {
      name: PROTOCOL_NAME,
      version: PROTOCOL_VERSION,
      constrained: true,
      sourceFormat,
      schemaVersion: resolvedSchemaVersion,
    },
  };
}

function toRankNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeExpectedRange(raw) {
  if (!isObjectLike(raw)) {
    return null;
  }
  const min = toRankNumber(raw.min, 0);
  const max = toRankNumber(raw.max, 0);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return {
    min,
    max
  };
}

function normalizeEvaluationPayload(raw, proposalCount) {
  const payload = isObjectLike(raw) ? raw : {};
  const source = asString(payload.source) || "UNKNOWN";
  const rawItems = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(raw)
      ? raw
      : [];
  const items = rawItems.map((item, idx) => {
    const safe = isObjectLike(item) ? item : {};
    const index = Math.max(
      0,
      Math.min(
        Math.max(0, proposalCount - 1),
        Math.floor(toRankNumber(
          safe.proposalIndex !== undefined ? safe.proposalIndex : safe.index,
          idx
        ))
      )
    );
    return {
      proposalIndex: index,
      blocked: Boolean(safe.blocked),
      score: toRankNumber(safe.score, Number.NaN),
      reasonCodes: Array.isArray(safe.reason_codes)
        ? safe.reason_codes.map((entry) => asString(entry)).filter(Boolean).slice(0, 8)
        : [],
      riskFlags: Array.isArray(safe.risk_flags)
        ? safe.risk_flags.map((entry) => asString(entry)).filter(Boolean).slice(0, 8)
        : [],
      expectedRange: normalizeExpectedRange(safe.expected_range),
      selectedCount: Math.max(0, Math.floor(toRankNumber(safe.selected_count, 0))),
      rejectedCount: Math.max(0, Math.floor(toRankNumber(safe.rejected_count, 0))),
      estimatedCost: Math.max(0, toRankNumber(safe.estimated_cost, 0)),
      error: asString(safe.error),
      decisionId: asString(safe.decision_id),
      source
    };
  });
  return {
    source,
    userId: asString(payload.userId),
    items
  };
}

function computeProposalRankScore({ proposal, evaluation }) {
  const confidence = toRankNumber(
    proposal && proposal.strategyMeta && proposal.strategyMeta.confidence,
    0
  );
  const expectedRange = evaluation && evaluation.expectedRange ? evaluation.expectedRange : null;
  const expectedMid = expectedRange ? (expectedRange.min + expectedRange.max) / 2 : 0;
  const riskPenalty =
    Math.max(0, toRankNumber(evaluation && evaluation.riskFlags && evaluation.riskFlags.length, 0)) * 2;
  const rejectPenalty = Math.max(0, toRankNumber(evaluation && evaluation.rejectedCount, 0));
  const selectedBoost = Math.max(0, toRankNumber(evaluation && evaluation.selectedCount, 0));
  const estimatedCost = Math.max(0, toRankNumber(evaluation && evaluation.estimatedCost, 0));
  const evalScore = evaluation ? toRankNumber(evaluation.score, Number.NaN) : Number.NaN;
  const baseScore =
    Number.isFinite(evalScore)
      ? evalScore
      : expectedMid + confidence * 10 - riskPenalty - rejectPenalty + selectedBoost - estimatedCost;
  return {
    rankScore: Number(baseScore.toFixed(4)),
    expectedMid: Number(expectedMid.toFixed(4)),
    confidence: Number(confidence.toFixed(4))
  };
}

function buildExplainPackFromRanked({ ranked, source = "NONE" }) {
  return {
    source,
    generatedAt: new Date().toISOString(),
    items: ranked.slice(0, MAX_PROPOSAL_CANDIDATES).map((item, idx) => ({
      rank: idx + 1,
      title: asString(item && item.proposal && item.proposal.title),
      templateId: asString(item && item.proposal && item.proposal.template && item.proposal.template.templateId),
      branchId: asString(item && item.proposal && item.proposal.branch && item.proposal.branch.branchId),
      rankScore: toRankNumber(item && item.rankScore, 0),
      blocked: Boolean(item && item.evaluation && item.evaluation.blocked),
      reason_codes:
        Array.isArray(item && item.evaluation && item.evaluation.reasonCodes)
          ? item.evaluation.reasonCodes
          : [],
      risk_flags:
        Array.isArray(item && item.evaluation && item.evaluation.riskFlags)
          ? item.evaluation.riskFlags
          : [],
      expected_range:
        item && item.evaluation && item.evaluation.expectedRange
          ? item.evaluation.expectedRange
          : null,
      selected_count: Math.max(0, Math.floor(toRankNumber(item && item.evaluation && item.evaluation.selectedCount, 0))),
      rejected_count: Math.max(0, Math.floor(toRankNumber(item && item.evaluation && item.evaluation.rejectedCount, 0))),
      estimated_cost: Math.max(0, toRankNumber(item && item.evaluation && item.evaluation.estimatedCost, 0)),
      decision_id: asString(item && item.evaluation && item.evaluation.decisionId),
      evaluation_error: asString(item && item.evaluation && item.evaluation.error),
    }))
  };
}

function normalizeApprovalDecision(raw, required = true) {
  const payload = isObjectLike(raw) ? raw : {};
  return {
    required: Boolean(required),
    approved: Boolean(payload.approved),
    approvalId: asString(payload.approvalId || payload.approval_id),
    reason: asString(payload.reason) || (payload.approved ? "" : "approval denied"),
    source: asString(payload.source) || "APPROVAL_TOOL",
  };
}

function normalizePublishResult(raw, proposalCount) {
  const payload = isObjectLike(raw) ? raw : {};
  const source = asString(payload.source) || "PUBLISH_TOOL";
  const items = [];
  if (Array.isArray(payload.items)) {
    for (const [idx, entry] of payload.items.entries()) {
      const item = isObjectLike(entry) ? entry : {};
      const proposalIndex = Math.max(
        0,
        Math.min(
          Math.max(0, proposalCount - 1),
          Math.floor(toRankNumber(
            item.proposalIndex !== undefined ? item.proposalIndex : item.index,
            idx
          ))
        )
      );
      items.push({
        proposalIndex,
        ok: Boolean(item.ok),
        policyId: asString(item.policyId || item.policy_id),
        draftId: asString(item.draftId || item.draft_id),
        publishId: asString(item.publishId || item.publish_id),
        error: asString(item.error),
      });
    }
  } else {
    const published = Array.isArray(payload.published) ? payload.published : [];
    for (const [idx, entry] of published.entries()) {
      const item = isObjectLike(entry) ? entry : {};
      const proposalIndex = Math.max(
        0,
        Math.min(
          Math.max(0, proposalCount - 1),
          Math.floor(toRankNumber(
            item.proposalIndex !== undefined ? item.proposalIndex : item.index,
            idx
          ))
        )
      );
      items.push({
        proposalIndex,
        ok: true,
        policyId: asString(item.policyId || item.policy_id),
        draftId: asString(item.draftId || item.draft_id),
        publishId: asString(item.publishId || item.publish_id),
        error: "",
      });
    }
    const failed = Array.isArray(payload.failed) ? payload.failed : [];
    for (const [idx, entry] of failed.entries()) {
      const item = isObjectLike(entry) ? entry : {};
      const proposalIndex = Math.max(
        0,
        Math.min(
          Math.max(0, proposalCount - 1),
          Math.floor(toRankNumber(
            item.proposalIndex !== undefined ? item.proposalIndex : item.index,
            idx
          ))
        )
      );
      items.push({
        proposalIndex,
        ok: false,
        policyId: asString(item.policyId || item.policy_id),
        draftId: asString(item.draftId || item.draft_id),
        publishId: asString(item.publishId || item.publish_id),
        error: asString(item.error) || "publish failed",
      });
    }
  }
  const publishedCount = items.filter((item) => item.ok).length;
  const failedCount = Math.max(0, items.length - publishedCount);
  return {
    source,
    items,
    publishedCount,
    failedCount,
  };
}

function attachApprovalPublishToTurn({
  turn,
  publishIntent,
  approvalDecision = null,
  publishResult = null,
}) {
  const safeTurn = isObjectLike(turn) ? turn : null;
  if (!safeTurn || safeTurn.status !== "PROPOSAL_READY") {
    return safeTurn;
  }
  const safeApproval = isObjectLike(approvalDecision)
    ? approvalDecision
    : {
      required: Boolean(publishIntent),
      approved: false,
      approvalId: "",
      reason: publishIntent ? "approval not requested" : "",
      source: "NONE",
    };
  const safePublish = isObjectLike(publishResult)
    ? publishResult
    : {
      source: "NONE",
      items: [],
      publishedCount: 0,
      failedCount: 0,
    };
  const proposalItems = Array.isArray(safeTurn.proposals) ? safeTurn.proposals : [];
  const publishByIndex = new Map();
  for (const item of Array.isArray(safePublish.items) ? safePublish.items : []) {
    const current = publishByIndex.get(item.proposalIndex);
    if (!current || (!current.ok && item.ok)) {
      publishByIndex.set(item.proposalIndex, item);
    }
  }
  const proposals = proposalItems.map((proposal, idx) => {
    const publish = publishByIndex.get(idx);
    return {
      ...proposal,
      publish: publish
        ? {
          ok: Boolean(publish.ok),
          policy_id: asString(publish.policyId),
          draft_id: asString(publish.draftId),
          publish_id: asString(publish.publishId),
          error: asString(publish.error),
        }
        : null,
    };
  });
  const protocol = {
    ...(isObjectLike(safeTurn.protocol) ? safeTurn.protocol : {}),
    approval: {
      required: Boolean(safeApproval.required),
      approved: Boolean(safeApproval.approved),
      approvalId: asString(safeApproval.approvalId),
      reason: asString(safeApproval.reason),
      source: asString(safeApproval.source),
    },
    publish: {
      intent: Boolean(publishIntent),
      source: asString(safePublish.source),
      publishedCount: Math.max(0, Math.floor(toRankNumber(safePublish.publishedCount, 0))),
      failedCount: Math.max(0, Math.floor(toRankNumber(safePublish.failedCount, 0))),
    }
  };
  let assistantMessage = asString(safeTurn.assistantMessage);
  if (publishIntent && safeApproval.approved && toRankNumber(safePublish.publishedCount, 0) > 0) {
    if (!assistantMessage) {
      assistantMessage = "Strategy proposal drafted and published.";
    }
  } else if (publishIntent && !safeApproval.approved) {
    if (!assistantMessage) {
      assistantMessage = "Strategy proposal drafted. Approval is required before publish.";
    }
  }
  return {
    ...safeTurn,
    assistantMessage,
    proposals,
    proposal: proposals[0] || safeTurn.proposal || null,
    publishReport: {
      approval: safeApproval,
      publish: safePublish,
    },
    protocol,
  };
}

function normalizePostPublishMonitorReport(raw, { publishedCount = 0 } = {}) {
  const payload = isObjectLike(raw) ? raw : {};
  const alerts = Array.isArray(payload.alerts)
    ? payload.alerts
      .map((item) => asString(item))
      .filter(Boolean)
      .slice(0, 12)
    : [];
  const recommendations = Array.isArray(payload.recommendations)
    ? payload.recommendations
      .map((item) => asString(item))
      .filter(Boolean)
      .slice(0, 12)
    : [];
  return {
    source: asString(payload.source) || "MONITOR_TOOL",
    publishedCount: Math.max(0, Math.floor(toRankNumber(payload.publishedCount, publishedCount))),
    alerts,
    recommendations,
    summary: asString(payload.summary),
  };
}

function buildFallbackPostPublishMonitorReport({ turn, publishedProposals = [] }) {
  const alerts = [];
  const recommendations = [];
  for (const proposal of publishedProposals) {
    const evaluation = isObjectLike(proposal && proposal.evaluation) ? proposal.evaluation : {};
    const riskFlags = Array.isArray(evaluation.risk_flags) ? evaluation.risk_flags : [];
    const rejectedCount = Math.max(0, Math.floor(toRankNumber(evaluation.rejected_count, 0)));
    if (riskFlags.length > 0) {
      alerts.push(`risk_flags:${riskFlags.join(",")}`);
      recommendations.push("monitor_risk_flags_hourly");
    }
    if (rejectedCount > 0) {
      alerts.push(`rejected_count:${rejectedCount}`);
      recommendations.push("consider_pause_or_threshold_adjustment");
    }
  }
  const uniqueAlerts = [...new Set(alerts)].slice(0, 12);
  const uniqueRecommendations = [...new Set(recommendations)].slice(0, 12);
  const count = publishedProposals.length;
  return {
    source: "HEURISTIC",
    publishedCount: count,
    alerts: uniqueAlerts,
    recommendations: uniqueRecommendations,
    summary: count > 0
      ? `Published ${count} policies; ${uniqueAlerts.length} alerts detected.`
      : "No published policy to monitor."
  };
}

function attachPostPublishMonitorToTurn({ turn, report }) {
  const safeTurn = isObjectLike(turn) ? turn : null;
  if (!safeTurn) {
    return safeTurn;
  }
  const safeReport = isObjectLike(report)
    ? report
    : {
      source: "NONE",
      publishedCount: 0,
      alerts: [],
      recommendations: [],
      summary: ""
    };
  return {
    ...safeTurn,
    postPublishMonitor: safeReport,
    protocol: {
      ...(isObjectLike(safeTurn.protocol) ? safeTurn.protocol : {}),
      post_publish_monitor: {
        source: asString(safeReport.source),
        publishedCount: Math.max(0, Math.floor(toRankNumber(safeReport.publishedCount, 0))),
        alertCount: Array.isArray(safeReport.alerts) ? safeReport.alerts.length : 0,
        recommendationCount: Array.isArray(safeReport.recommendations) ? safeReport.recommendations.length : 0,
      }
    }
  };
}

function buildMemoryFactsFromInput({ input, turn, intentFrame, monitorReport }) {
  const goals = [];
  const constraints = [];
  const audience = [];
  const timing = [];
  const decisions = [];
  const userMessage = asString(input && input.userMessage);
  if (userMessage) {
    goals.push(truncateText(userMessage, 120));
  }
  const goalType = asString(intentFrame && intentFrame.primaryGoal);
  if (goalType) {
    goals.push(`goal:${goalType}`);
  }
  const riskPreference = asString(intentFrame && intentFrame.riskPreference);
  if (riskPreference) {
    constraints.push(`risk:${riskPreference}`);
  }
  const budgetHint = toRankNumber(intentFrame && intentFrame.budgetHint, Number.NaN);
  if (Number.isFinite(budgetHint)) {
    constraints.push(`budget_hint:${budgetHint}`);
  }
  const timeWindowHint = asString(intentFrame && intentFrame.timeWindowHint);
  if (timeWindowHint) {
    timing.push(`window:${timeWindowHint}`);
  }
  const turnStatus = asString(turn && turn.status);
  if (turnStatus) {
    decisions.push(`turn_status:${turnStatus}`);
  }
  if (turn && Array.isArray(turn.proposals) && turn.proposals.length > 0) {
    const top = turn.proposals[0];
    const templateId = asString(top && top.template && top.template.templateId);
    const branchId = asString(top && top.branch && top.branch.branchId);
    if (templateId) {
      decisions.push(`top_template:${templateId}`);
    }
    if (branchId) {
      decisions.push(`top_branch:${branchId}`);
    }
    const blocked = Boolean(top && top.evaluation && top.evaluation.blocked);
    decisions.push(`top_blocked:${blocked ? "yes" : "no"}`);
  }
  if (monitorReport && Array.isArray(monitorReport.recommendations) && monitorReport.recommendations.length > 0) {
    decisions.push(...monitorReport.recommendations.map((item) => `monitor:${asString(item)}`));
  }
  return {
    goals: [...new Set(goals)].slice(0, 8),
    constraints: [...new Set(constraints)].slice(0, 8),
    audience: [...new Set(audience)].slice(0, 8),
    timing: [...new Set(timing)].slice(0, 8),
    decisions: [...new Set(decisions)].slice(0, 12),
  };
}

function summarizeMemoryFacts(memoryFacts) {
  const safe = isObjectLike(memoryFacts) ? memoryFacts : {};
  const segments = [];
  const pushBucket = (label, key) => {
    const items = Array.isArray(safe[key]) ? safe[key].slice(0, 3) : [];
    if (items.length > 0) {
      segments.push(`${label}: ${items.join(" | ")}`);
    }
  };
  pushBucket("Goals", "goals");
  pushBucket("Constraints", "constraints");
  pushBucket("Timing", "timing");
  pushBucket("Decisions", "decisions");
  return segments.join("; ");
}

function normalizeMemoryUpdateResult(raw, memoryFacts, summaryText) {
  const payload = isObjectLike(raw) ? raw : {};
  const source = asString(payload.source) || "INLINE";
  const persisted = payload.persisted === undefined ? false : Boolean(payload.persisted);
  const memoryId = asString(payload.memoryId || payload.memory_id);
  return {
    source,
    persisted,
    memoryId,
    summary: asString(payload.summary) || summaryText,
    facts: isObjectLike(payload.facts) ? payload.facts : memoryFacts,
  };
}

function attachMemoryUpdateToTurn({ turn, memoryUpdate }) {
  const safeTurn = isObjectLike(turn) ? turn : null;
  if (!safeTurn) {
    return safeTurn;
  }
  const payload = isObjectLike(memoryUpdate)
    ? memoryUpdate
    : {
      source: "NONE",
      persisted: false,
      memoryId: "",
      summary: "",
      facts: {}
    };
  const factCount = Object.values(isObjectLike(payload.facts) ? payload.facts : {}).reduce((sum, bucket) => {
    if (!Array.isArray(bucket)) {
      return sum;
    }
    return sum + bucket.length;
  }, 0);
  return {
    ...safeTurn,
    memoryUpdate: payload,
    protocol: {
      ...(isObjectLike(safeTurn.protocol) ? safeTurn.protocol : {}),
      memory_update: {
        source: asString(payload.source),
        persisted: Boolean(payload.persisted),
        memoryId: asString(payload.memoryId),
        factCount: Math.max(0, Math.floor(toRankNumber(factCount, 0))),
      }
    }
  };
}

function buildEmptyLlmMessages() {
  return [
    { role: "system", content: "" },
    { role: "user", content: "" },
  ];
}

function buildChatPromptPayload({
  merchantId,
  sessionId,
  userMessage,
  history = [],
  activePolicies = [],
  approvedStrategies = [],
  executionHistory = [],
  salesSnapshot = null,
  intentFrame = null,
}) {
  return {
    messages: buildEmptyLlmMessages(),
  };
}

function createAiStrategyService(options = {}) {
  const provider = normalizeProvider(
    options.provider || process.env.MQ_AI_PROVIDER || DEFAULT_REMOTE_PROVIDER,
  );
  const model = asString(
    options.model ||
    process.env.MQ_AI_MODEL ||
    (provider === "openai" ? OPENAI_DEFAULT_MODEL : DEEPSEEK_DEFAULT_MODEL),
  );
  const baseUrl = asString(
    options.baseUrl ||
    process.env.MQ_AI_BASE_URL ||
    (provider === "openai" ? OPENAI_BASE_URL : DEEPSEEK_BASE_URL),
  );
  const apiKey = asString(options.apiKey || process.env.MQ_AI_API_KEY);
  const timeoutMs = Number(
    options.timeoutMs ||
    process.env.MQ_AI_TIMEOUT_MS ||
    (provider === "openai" ? OPENAI_DEFAULT_TIMEOUT_MS : DEEPSEEK_DEFAULT_TIMEOUT_MS),
  );
  const maxRetries = toPositiveInt(
    options.maxRetries || process.env.MQ_AI_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
  );
  const modelGateway = createLangChainModelGateway({
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    maxRetries,
    parseJsonStrict,
  });
  const rawDebugEnabled =
    options.rawDebugEnabled !== undefined
      ? Boolean(options.rawDebugEnabled)
      : parseBooleanLike(process.env.MQ_AI_DEBUG_RAW, true);
  const criticEnabled = options.criticEnabled !== undefined
    ? Boolean(options.criticEnabled)
    : DEFAULT_CRITIC_ENABLED;
  const criticMaxRounds = Math.max(
    0,
    Math.floor(
      toFiniteNumber(
        options.criticMaxRounds !== undefined ? options.criticMaxRounds : DEFAULT_CRITIC_MAX_ROUNDS,
        DEFAULT_CRITIC_MAX_ROUNDS
      )
    )
  );
  const criticMinProposals = Math.max(
    1,
    Math.floor(
      toFiniteNumber(
        options.criticMinProposals !== undefined
          ? options.criticMinProposals
          : DEFAULT_CRITIC_MIN_PROPOSALS,
        DEFAULT_CRITIC_MIN_PROPOSALS
      )
    )
  );
  const criticMinConfidence = Math.max(
    0,
    Math.min(
      1,
      toFiniteNumber(
        options.criticMinConfidence !== undefined
          ? options.criticMinConfidence
          : DEFAULT_CRITIC_MIN_CONFIDENCE,
        DEFAULT_CRITIC_MIN_CONFIDENCE
      )
    )
  );
  function buildCriticMessages({ input, turn, round }) {
    return buildEmptyLlmMessages();
  }

function buildReviseMessages({ input, turn, criticDecision, round, validationIssues = [] }) {
    return buildEmptyLlmMessages();
  }

  function attachCriticProtocol(protocol, metadata) {
    const safeProtocol = isObjectLike(protocol) ? protocol : {};
    return {
      ...safeProtocol,
      critic: {
        applied: true,
        round: metadata.round,
        issues: Array.isArray(metadata.issues) ? metadata.issues : [],
        summary: asString(metadata.summary)
      }
    };
  }

  async function maybeRunCriticReviseLoop({ input, turn }) {
    if (!criticEnabled || criticMaxRounds <= 0) {
      return turn;
    }
    let currentTurn = turn;
    let pendingValidationIssues = Array.isArray(currentTurn && currentTurn.validationIssues)
      ? currentTurn.validationIssues
      : [];

    const needQualityRevision = shouldRunCriticLoop({
      turn: currentTurn,
      minProposals: criticMinProposals,
      minConfidence: criticMinConfidence
    });
    if (!needQualityRevision && pendingValidationIssues.length === 0) {
      return currentTurn;
    }

    for (let round = 0; round < criticMaxRounds; round += 1) {
      let criticDecision = null;
      if (pendingValidationIssues.length > 0) {
        criticDecision = {
          needRevision: true,
          issues: summarizeValidationIssues(pendingValidationIssues),
          focus: ["policyPatch compliance"],
          summary: "proposal violates policyPatch allowlist"
        };
      } else {
        try {
          const criticMessages = buildCriticMessages({
            input,
            turn: currentTurn,
            round
          });
          printRawBlock(rawDebugEnabled, "CRITIC_INPUT_MESSAGES", criticMessages);
          const criticCall = await modelGateway.invokeChatWithRaw(criticMessages, {
            ...buildStructuredOutputOptions(
              "mq_strategy_critic_decision",
              CRITIC_OUTPUT_JSON_SCHEMA
            )
          });
          printRawBlock(rawDebugEnabled, "CRITIC_OUTPUT_RAW", criticCall.rawText || "");
          criticDecision = normalizeCriticDecision(criticCall.parsed);
        } catch (error) {
          void error;
          break;
        }
      }
      if (!criticDecision.needRevision) {
        break;
      }

      try {
        const reviseMessages = buildReviseMessages({
          input,
          turn: currentTurn,
          criticDecision,
          round,
          validationIssues: pendingValidationIssues
        });
        printRawBlock(rawDebugEnabled, "REVISE_INPUT_MESSAGES", reviseMessages);
        const reviseCall = await modelGateway.invokeChatWithRaw(reviseMessages, {
          ...buildStructuredOutputOptions(
            "mq_strategy_revise_output",
            REVISE_OUTPUT_JSON_SCHEMA
          )
        });
        printRawBlock(rawDebugEnabled, "REVISE_OUTPUT_RAW", reviseCall.rawText || "");
        const revisedRaw = reviseCall.parsed;
        const { normalizedCandidates, invalidCandidates } = normalizeCandidatesFromRaw({
          rawCandidates: coerceProposalCandidates(revisedRaw),
          input,
          provider,
          model,
        });
        if (normalizedCandidates.length === 0) {
          pendingValidationIssues = invalidCandidates;
          currentTurn = {
            ...currentTurn,
            validationIssues: invalidCandidates,
            protocol: attachCriticProtocol(currentTurn.protocol, {
              round: round + 1,
              issues: criticDecision.issues,
              summary: criticDecision.summary
            })
          };
          continue;
        }
        currentTurn = {
          ...currentTurn,
          status: "PROPOSAL_READY",
          assistantMessage:
            asString(revisedRaw && revisedRaw.assistantMessage) ||
            currentTurn.assistantMessage ||
            "Strategy proposal drafted. Please review immediately.",
          proposals: normalizedCandidates,
          proposal: normalizedCandidates[0],
          validationIssues: invalidCandidates,
          protocol: attachCriticProtocol(currentTurn.protocol, {
            round: round + 1,
            issues: criticDecision.issues,
            summary: criticDecision.summary
          })
        };
        pendingValidationIssues = invalidCandidates;
        if (
          pendingValidationIssues.length === 0 &&
          !shouldRunCriticLoop({
            turn: currentTurn,
            minProposals: criticMinProposals,
            minConfidence: criticMinConfidence
          })
        ) {
          break;
        }
      } catch (error) {
        void error;
        break;
      }
    }
    if (
      currentTurn &&
      currentTurn.status === "PROPOSAL_READY" &&
      (!Array.isArray(currentTurn.proposals) || currentTurn.proposals.length === 0)
    ) {
      return {
        status: "CHAT_REPLY",
        assistantMessage:
          "I need a quick clarification before drafting a compliant strategy proposal.",
        protocol: attachCriticProtocol(currentTurn.protocol, {
          round: criticMaxRounds,
          issues: summarizeValidationIssues(currentTurn.validationIssues || []),
          summary: "proposal validation failed"
        })
      };
    }
    return currentTurn;
  }

  async function maybeRunEvaluationRankExplain({ input, turn }) {
    if (!turn || turn.status !== "PROPOSAL_READY" || !Array.isArray(turn.proposals) || turn.proposals.length === 0) {
      return turn;
    }
    const evaluateTool = typeof input.evaluatePolicyCandidates === "function"
      ? input.evaluatePolicyCandidates
      : null;
    const intentFrame = inferIntentFrame({
      userMessage: input.userMessage,
      salesSnapshot: sanitizeSalesSnapshot(input.salesSnapshot),
    });
    let evaluationPayload = {
      source: "UNAVAILABLE",
      userId: "",
      items: []
    };
    if (evaluateTool) {
      try {
        const rawPayload = await evaluateTool({
          proposals: turn.proposals,
          merchantId: input.merchantId,
          sessionId: input.sessionId,
          userMessage: input.userMessage,
          intentFrame,
        });
        evaluationPayload = normalizeEvaluationPayload(rawPayload, turn.proposals.length);
      } catch (error) {
        evaluationPayload = normalizeEvaluationPayload({
          source: "TOOL_ERROR",
          results: turn.proposals.map((_, idx) => ({
            proposalIndex: idx,
            blocked: true,
            error: summarizeError(error),
            reason_codes: ["evaluate_tool_error"],
            risk_flags: ["EVALUATION_ERROR"],
            selected_count: 0,
            rejected_count: 1,
            estimated_cost: 0,
            score: -100
          }))
        }, turn.proposals.length);
      }
    }
    const evaluationByIndex = new Map();
    for (const item of evaluationPayload.items) {
      evaluationByIndex.set(item.proposalIndex, item);
    }
    const hasEvaluationData = evaluationPayload.items.length > 0;
    const rankedBase = turn.proposals.map((proposal, idx) => {
      const evaluation = evaluationByIndex.get(idx) || null;
      const scorePack = computeProposalRankScore({ proposal, evaluation });
      return {
        proposal,
        evaluation,
        rankScore: scorePack.rankScore,
        expectedMid: scorePack.expectedMid,
        confidence: scorePack.confidence
      };
    });
    const ranked = hasEvaluationData
      ? rankedBase.sort((left, right) => {
      const leftBlocked = Boolean(left.evaluation && left.evaluation.blocked);
      const rightBlocked = Boolean(right.evaluation && right.evaluation.blocked);
      if (leftBlocked !== rightBlocked) {
        return leftBlocked ? 1 : -1;
      }
      if (right.rankScore !== left.rankScore) {
        return right.rankScore - left.rankScore;
      }
      return right.confidence - left.confidence;
      })
      : rankedBase;
    const rankedProposals = ranked.map((item) => ({
      ...item.proposal,
      evaluation: {
        rank_score: item.rankScore,
        expected_mid: item.expectedMid,
        confidence: item.confidence,
        blocked: Boolean(item.evaluation && item.evaluation.blocked),
        reason_codes: item.evaluation && Array.isArray(item.evaluation.reasonCodes)
          ? item.evaluation.reasonCodes
          : [],
        risk_flags: item.evaluation && Array.isArray(item.evaluation.riskFlags)
          ? item.evaluation.riskFlags
          : [],
        expected_range: item.evaluation && item.evaluation.expectedRange ? item.evaluation.expectedRange : null,
        selected_count: item.evaluation ? item.evaluation.selectedCount : 0,
        rejected_count: item.evaluation ? item.evaluation.rejectedCount : 0,
        estimated_cost: item.evaluation ? item.evaluation.estimatedCost : 0,
        decision_id: item.evaluation ? item.evaluation.decisionId : "",
        evaluation_error: item.evaluation ? item.evaluation.error : "",
      }
    }));
    const explainPack = buildExplainPackFromRanked({
      ranked,
      source: evaluationPayload.source
    });
    return {
      ...turn,
      proposals: rankedProposals,
      proposal: rankedProposals[0] || null,
      explainPack,
      protocol: {
        ...(isObjectLike(turn.protocol) ? turn.protocol : {}),
        evaluation: {
          source: evaluationPayload.source,
          count: explainPack.items.length
        },
        ranking: {
          strategy: "VALUE_RISK_COST_V1",
          count: explainPack.items.length
        }
      }
    };
  }

  async function maybeRunApprovalPublish({ input, turn }) {
    if (!turn || turn.status !== "PROPOSAL_READY" || !Array.isArray(turn.proposals) || turn.proposals.length === 0) {
      return turn;
    }
    const publishIntent = Boolean(input && input.publishIntent);
    if (!publishIntent) {
      return turn;
    }
    const approvalToken = asString(input && input.approvalToken);
    const validator = input && typeof input.validateApproval === "function"
      ? input.validateApproval
      : null;
    let approvalDecision = null;
    if (!approvalToken) {
      approvalDecision = normalizeApprovalDecision({
        approved: false,
        reason: "approval token is required",
        source: "MISSING_TOKEN"
      }, true);
    } else if (!validator) {
      approvalDecision = normalizeApprovalDecision({
        approved: false,
        reason: "approval validator is not configured",
        source: "VALIDATOR_MISSING"
      }, true);
    } else {
      try {
        const rawApproval = await validator({
          merchantId: input.merchantId,
          sessionId: input.sessionId,
          approvalToken,
          proposals: turn.proposals
        });
        approvalDecision = normalizeApprovalDecision(rawApproval, true);
      } catch (error) {
        approvalDecision = normalizeApprovalDecision({
          approved: false,
          reason: summarizeError(error),
          source: "VALIDATOR_ERROR"
        }, true);
      }
    }

    let publishResult = {
      source: "SKIPPED",
      items: [],
      publishedCount: 0,
      failedCount: 0,
    };
    if (approvalDecision.approved) {
      const publishFn = input && typeof input.publishPolicies === "function"
        ? input.publishPolicies
        : null;
      if (!publishFn) {
        publishResult = normalizePublishResult({
          source: "UNAVAILABLE",
          items: []
        }, turn.proposals.length);
      } else {
        try {
          const rawPublish = await publishFn({
            merchantId: input.merchantId,
            sessionId: input.sessionId,
            approvalId: asString(approvalDecision.approvalId),
            approvalToken,
            proposals: turn.proposals,
          });
          publishResult = normalizePublishResult(rawPublish, turn.proposals.length);
        } catch (error) {
          publishResult = normalizePublishResult({
            source: "PUBLISH_TOOL_ERROR",
            failed: turn.proposals.map((_, idx) => ({
              proposalIndex: idx,
              error: summarizeError(error)
            }))
          }, turn.proposals.length);
        }
      }
    }
    return attachApprovalPublishToTurn({
      turn,
      publishIntent,
      approvalDecision,
      publishResult,
    });
  }

  async function maybeRunPostPublishMonitorAndMemory({ input, turn }) {
    if (!turn || turn.status === "AI_UNAVAILABLE") {
      return turn;
    }
    const proposals = Array.isArray(turn.proposals) ? turn.proposals : [];
    const publishedProposals = proposals.filter(
      (item) => isObjectLike(item && item.publish) && Boolean(item.publish.ok)
    );
    let nextTurn = turn;
    let monitorReport;
    if (publishedProposals.length === 0) {
      monitorReport = normalizePostPublishMonitorReport({
        source: "SKIPPED",
        summary: "No published policy to monitor.",
        alerts: [],
        recommendations: [],
        publishedCount: 0
      }, { publishedCount: 0 });
    } else {
      const monitorFn = typeof input.monitorPublishedPolicies === "function"
        ? input.monitorPublishedPolicies
        : null;
      if (!monitorFn) {
        monitorReport = buildFallbackPostPublishMonitorReport({ turn: nextTurn, publishedProposals });
      } else {
        try {
          const rawMonitor = await monitorFn({
            merchantId: input.merchantId,
            sessionId: input.sessionId,
            proposals,
            publishedProposals,
            intentFrame: inferIntentFrame({
              userMessage: input.userMessage,
              salesSnapshot: sanitizeSalesSnapshot(input.salesSnapshot),
            }),
            explainPack: nextTurn.explainPack,
            publishReport: nextTurn.publishReport,
          });
          monitorReport = normalizePostPublishMonitorReport(rawMonitor, { publishedCount: publishedProposals.length });
        } catch (error) {
          monitorReport = normalizePostPublishMonitorReport({
            source: "MONITOR_ERROR",
            summary: summarizeError(error),
            alerts: ["monitor_tool_failed"],
            recommendations: ["fallback_to_manual_review"],
            publishedCount: publishedProposals.length
          }, { publishedCount: publishedProposals.length });
        }
      }
    }
    nextTurn = attachPostPublishMonitorToTurn({
      turn: nextTurn,
      report: monitorReport
    });

    const intentFrame = inferIntentFrame({
      userMessage: input.userMessage,
      salesSnapshot: sanitizeSalesSnapshot(input.salesSnapshot),
    });
    const memoryFacts = buildMemoryFactsFromInput({
      input,
      turn: nextTurn,
      intentFrame,
      monitorReport
    });
    const summaryText = summarizeMemoryFacts(memoryFacts);
    const updateFn = typeof input.updateStrategyMemory === "function"
      ? input.updateStrategyMemory
      : null;
    let memoryUpdate;
    if (!updateFn) {
      memoryUpdate = normalizeMemoryUpdateResult({
        source: "INLINE",
        persisted: false,
        summary: summaryText,
        facts: memoryFacts
      }, memoryFacts, summaryText);
    } else {
      try {
        const rawMemory = await updateFn({
          merchantId: input.merchantId,
          sessionId: input.sessionId,
          userMessage: asString(input.userMessage),
          intentFrame,
          turn: nextTurn,
          monitorReport,
          memoryFacts,
          summary: summaryText
        });
        memoryUpdate = normalizeMemoryUpdateResult(rawMemory, memoryFacts, summaryText);
      } catch (error) {
        memoryUpdate = normalizeMemoryUpdateResult({
          source: "MEMORY_ERROR",
          persisted: false,
          summary: summarizeError(error),
          facts: memoryFacts
        }, memoryFacts, summaryText);
      }
    }
    return attachMemoryUpdateToTurn({
      turn: nextTurn,
      memoryUpdate
    });
  }

  // Parses dual-channel response:
  // plain-text assistant message + optional trailing JSON decision envelope.
  function parseTwoPartResponse(rawText, input) {
    const parsed = parseAssistantDecisionEnvelope(rawText);
    const { normalizedCandidates, invalidCandidates } = normalizeCandidatesFromRaw({
      rawCandidates: parsed.rawCandidates,
      input,
      provider,
      model,
    });
    return buildTurnFromCandidateEvaluation({
      assistantMessage: parsed.assistantMessage,
      sourceFormat: parsed.sourceFormat,
      schemaVersion: parsed.schemaVersion,
      forceProposal: parsed.forceProposal,
      parseError: parsed.parseError,
      normalizedCandidates,
      invalidCandidates,
    });
  }

  // True streaming: yields plain text tokens from the first chunk,
  // then returns the parsed turn decision at the end (no second LLM call).
  async function* streamStrategyChatTurn(input) {
    if ((provider === "openai" || provider === "deepseek") && !apiKey) {
      throw new Error("MQ_AI_API_KEY is required for provider=openai/deepseek");
    }
    const prompt = buildChatPromptPayload({
      merchantId: input.merchantId,
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      history: input.history,
      activePolicies: input.activePolicies,
      approvedStrategies: input.approvedStrategies,
      executionHistory: input.executionHistory,
      salesSnapshot: input.salesSnapshot,
    });
    printRawBlock(rawDebugEnabled, "STREAM_INPUT_MESSAGES", prompt.messages);

    let rawBuffer = "";
    let yieldedLen = 0;
    let sentinelDetected = false;
    const SENTINELS = DECISION_ENVELOPE_START_MARKERS;
    let sentinelScanFrom = 0;

    const computeSafeFlushLen = (text) => {
      let holdBack = 0;
      for (const sentinel of SENTINELS) {
        const maxPrefix = Math.min(sentinel.length - 1, text.length);
        for (let i = maxPrefix; i > 0; i -= 1) {
          if (text.endsWith(sentinel.slice(0, i))) {
            holdBack = Math.max(holdBack, i);
            break;
          }
        }
      }
      return text.length - holdBack;
    };

    const streamIterator = modelGateway.streamChatEvents(prompt.messages);
    let tokenSeq = 0;

    for await (const streamItem of streamIterator) {
      if (!isObjectLike(streamItem) || typeof streamItem.type !== "string") {
        continue;
      }
      const streamType = streamItem.type.toLowerCase();
      if (streamType === "start") {
        yield {
          type: "start",
          at:
            isObjectLike(streamItem) && typeof streamItem.at === "string"
              ? streamItem.at
              : new Date().toISOString(),
        };
        continue;
      }
      if (streamType === "end") {
        yield {
          type: "end",
          at:
            isObjectLike(streamItem) && typeof streamItem.at === "string"
              ? streamItem.at
              : new Date().toISOString(),
        };
        continue;
      }
      const chunk = typeof streamItem.text === "string" ? streamItem.text : "";
      if (!chunk) {
        continue;
      }
      rawBuffer += chunk;
      if (sentinelDetected) continue;

      const sentinelIdx = findDecisionEnvelopeStart(rawBuffer, sentinelScanFrom);
      if (sentinelIdx >= 0) {
        const textToYield = rawBuffer.slice(yieldedLen, sentinelIdx);
        if (textToYield) {
          tokenSeq += 1;
          yield {
            type: "token",
            seq: tokenSeq,
            text: textToYield
          };
        }
        yieldedLen = sentinelIdx;
        sentinelDetected = true;
      } else {
        // Keep overlap window so markers split across chunks can still be matched.
        sentinelScanFrom = Math.max(
          0,
          rawBuffer.length - Math.max(1, DECISION_ENVELOPE_MAX_MARKER_LEN - 1)
        );
        // Only hold back the tail that *could* be the start of any sentinel
        const safeLen = computeSafeFlushLen(rawBuffer);
        if (safeLen > yieldedLen) {
          const toYield = rawBuffer.slice(yieldedLen, safeLen);
          tokenSeq += 1;
          yield {
            type: "token",
            seq: tokenSeq,
            text: toYield
          };
          yieldedLen = safeLen;
        }
      }
    }

    if (!sentinelDetected && rawBuffer.length > yieldedLen) {
      tokenSeq += 1;
      yield {
        type: "token",
        seq: tokenSeq,
        text: rawBuffer.slice(yieldedLen)
      };
    }
    printRawBlock(rawDebugEnabled, "STREAM_OUTPUT_RAW", rawBuffer);

    const parsedTurn = parseTwoPartResponse(rawBuffer, input);
    const revisedTurn = await maybeRunCriticReviseLoop({
      input,
      turn: parsedTurn
    });
    const rankedTurn = await maybeRunEvaluationRankExplain({
      input,
      turn: revisedTurn
    });
    const result = await maybeRunApprovalPublish({
      input,
      turn: rankedTurn
    });
    const finalized = await maybeRunPostPublishMonitorAndMemory({
      input,
      turn: result
    });
    return finalized;
  }

  function getRuntimeInfo() {
    const remoteEnabled = REMOTE_PROVIDERS.has(provider);
    const gatewayInfo = modelGateway.getRuntimeInfo();
    return {
      provider,
      model,
      baseUrl,
      configured: true,
      remoteEnabled,
      remoteConfigured: remoteEnabled ? Boolean(apiKey) : false,
      plannerEngine: "langchain_create_agent_pipeline_v1",
      criticLoop: {
        enabled: criticEnabled,
        maxRounds: criticMaxRounds,
        minProposals: criticMinProposals,
        minConfidence: criticMinConfidence
      },
      structuredOutput: {
        critic: `langchain_createAgent_responseFormat_${gatewayInfo.structuredOutput.defaultMethod}`,
        revise: `langchain_createAgent_responseFormat_${gatewayInfo.structuredOutput.defaultMethod}`
      },
      rawDebugEnabled,
      retryPolicy: gatewayInfo.retry,
      modelClient: gatewayInfo.modelClient,
      llmTransport: gatewayInfo.transport,
      structuredOutputMethod:
        gatewayInfo.structuredOutput && gatewayInfo.structuredOutput.defaultMethod,
      useResponsesApi: gatewayInfo.transport === "responses_api",
      llmStreamingMode:
        gatewayInfo.streaming && gatewayInfo.streaming.mode
          ? gatewayInfo.streaming.mode
          : "langchain_stream",
    };
  }

  return {
    streamStrategyChatTurn,
    getRuntimeInfo,
  };
}

module.exports = {
  createAiStrategyService,
};


