const {
  createCampaignFromTemplate,
  listStrategyTemplates,
} = require("./strategyLibrary");
const { Annotation, StateGraph, START, END } = require("@langchain/langgraph");
const { createLangChainModelGateway } = require("./aiStrategy/langchainModelGateway");

const DEFAULT_REMOTE_PROVIDER = "openai_compatible";
const REMOTE_PROVIDERS = new Set(["deepseek", "openai_compatible", "bigmodel"]);
const BIGMODEL_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const BIGMODEL_DEFAULT_MODEL = "glm-4.7-flash";
const BIGMODEL_DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_PROPOSAL_CANDIDATES = 12;
const MAX_HISTORY_ITEMS_FOR_PROMPT = 48;
const MAX_HISTORY_TOKENS_FOR_PROMPT = 2600;
const MAX_HISTORY_TEXT_CHARS = 640;
const MAX_MEMORY_PREFIX_HISTORY_ITEMS = 2;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
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
  if (["bigmodel", "zhipu", "zhipuai"].includes(normalized)) {
    return "bigmodel";
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

function parseJsonLoose(raw) {
  const direct = asString(raw);
  if (!direct) {
    throw new Error("empty ai response");
  }
  try {
    return JSON.parse(direct);
  } catch {
    // continue
  }
  const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    return JSON.parse(fencedMatch[1]);
  }
  const first = direct.indexOf("{");
  const last = direct.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(direct.slice(first, last + 1));
  }
  throw new Error("invalid ai response json");
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
  const mergedOverrides = mergePatch(decision.campaignPatch || {}, input.overrides || {});
  const { campaign, template, branch } = createCampaignFromTemplate({
    merchantId: input.merchantId,
    templateId: resolved.templateId,
    branchId: resolved.branchId,
    overrides: mergedOverrides,
  });
  const aiConfidence = Number(decision.confidence);
  const confidence = Number.isFinite(aiConfidence)
    ? Math.max(0, Math.min(1, aiConfidence))
    : null;
  const strategyMeta = {
    ...campaign.strategyMeta,
    source: "AI_MODEL",
    provider: provider.toUpperCase(),
    model: asString(model) || "unknown",
    rationale: asString(decision.rationale),
    confidence,
  };
  campaign.strategyMeta = strategyMeta;

  return {
    title: asString(decision.title) || `${template.name} - ${branch.name} - AI`,
    campaign,
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

function buildChatPromptPayload({
  merchantId,
  sessionId,
  userMessage,
  history = [],
  activeCampaigns = [],
  approvedStrategies = [],
  executionHistory = [],
  salesSnapshot = null,
}) {
  const safeHistory = sanitizeHistoryForPrompt(history);

  const safeActiveCampaigns = Array.isArray(activeCampaigns)
    ? activeCampaigns.slice(0, 12).map((item) => ({
        id: asString(item.id),
        name: truncateText(item.name || "", 120),
        status: asString(item.status || "UNKNOWN").toUpperCase(),
        triggerEvent: asString(item.trigger && item.trigger.event),
        priority: Number(item.priority) || 0,
      }))
    : [];

  const safeApprovedStrategies = Array.isArray(approvedStrategies)
    ? approvedStrategies.slice(0, 12).map((item) => ({
        proposalId: asString(item.proposalId),
        campaignId: asString(item.campaignId),
        title: truncateText(item.title || "", 120),
        templateId: asString(item.templateId),
        branchId: asString(item.branchId),
        approvedAt: asString(item.approvedAt || ""),
      }))
    : [];
  const safeExecutionHistory = sanitizeExecutionHistory(executionHistory);
  const safeSalesSnapshot = sanitizeSalesSnapshot(salesSnapshot);

  const userPayload = {
    task: "STRATEGY_CHAT",
    merchantId,
    sessionId,
    userMessage: asString(userMessage),
    history: safeHistory,
    activeCampaigns: safeActiveCampaigns,
    approvedStrategies: safeApprovedStrategies,
    executionHistory: safeExecutionHistory,
    salesSnapshot: safeSalesSnapshot,
    outputSchema: {
      mode: "CHAT_REPLY|PROPOSAL",
      assistantMessage: "string",
      proposals: [
        {
          templateId: "string",
          branchId: "string",
          title: "string",
          rationale: "string",
          confidence: "number",
          campaignPatch: {
            name: "string",
            priority: "number",
            trigger: { event: "string" },
            conditions: [
              { field: "string", op: "eq|neq|gte|lte|includes", value: "any" },
            ],
            budget: { cap: "number", used: "number", costPerHit: "number" },
            ttlHours: "number",
            action: {
              type: "GRANT_SILVER|GRANT_BONUS|GRANT_PRINCIPAL|GRANT_FRAGMENT|GRANT_VOUCHER|STORY_CARD|COMPOSITE",
            },
          },
        },
      ],
      proposal: {
        templateId: "string",
        branchId: "string",
        title: "string",
        rationale: "string",
        confidence: "number",
        campaignPatch: {
          name: "string",
          priority: "number",
          trigger: { event: "string" },
          conditions: [
            { field: "string", op: "eq|neq|gte|lte|includes", value: "any" },
          ],
          budget: { cap: "number", used: "number", costPerHit: "number" },
          ttlHours: "number",
          action: {
            type: "GRANT_SILVER|GRANT_BONUS|GRANT_PRINCIPAL|GRANT_FRAGMENT|GRANT_VOUCHER|STORY_CARD|COMPOSITE",
          },
        },
      },
    },
    rules: [
      "Keep assistantMessage concise and practical.",
      "Output strict JSON only.",
      "Use mode=PROPOSAL only when user clearly requests to create/finalize a strategy.",
      "When mode=PROPOSAL, return non-empty proposals[] (max 12) or proposal object.",
      "Avoid repeating already approved strategies with the same templateId+branchId unless user asks.",
      "Use executionHistory to avoid repeating already executed marketing operations unless user asks.",
      "Reference salesSnapshot when recommending optimization direction.",
    ],
  };

  return {
    messages: [
      {
        role: "system",
        content:
          "You are MealQuest merchant strategy copilot. Continue multi-turn conversation and return strict JSON.",
      },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
  };
}

function createStrategyChatGraph({
  resolveRemoteChatDecision,
  normalizeAiDecision,
  provider,
  model,
}) {
  const ChatState = Annotation.Root({
    input: Annotation(),
    remoteDecision: Annotation({ default: () => null }),
    turn: Annotation({ default: () => null }),
  });

  const prepareInput = (state) => ({
    input: isObjectLike(state.input) ? state.input : {},
  });

  const remoteDecide = async (state) => {
    try {
      const remoteDecision = await resolveRemoteChatDecision(state.input);
      return {
        remoteDecision: isObjectLike(remoteDecision) ? remoteDecision : {},
      };
    } catch (error) {
      return {
        turn: createAiUnavailableResult(summarizeError(error)),
      };
    }
  };

  const finalizeTurn = (state) => {
    if (state.turn && state.turn.status === "AI_UNAVAILABLE") {
      return {};
    }

    const decision = isObjectLike(state.remoteDecision) ? state.remoteDecision : {};
    const mode = asString(decision.mode || "").toUpperCase();
    const assistantMessage = asString(decision.assistantMessage);

    if (mode === "PROPOSAL") {
      const input = isObjectLike(state.input) ? state.input : {};
      const rawCandidates = [];
      if (Array.isArray(decision.proposals)) {
        rawCandidates.push(...decision.proposals.filter((item) => isObjectLike(item)));
      }
      if (isObjectLike(decision.proposal)) {
        rawCandidates.push(decision.proposal);
      }
      const normalizedCandidates = [];
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
        } catch {
          // skip invalid candidate and continue
        }
      }
      if (normalizedCandidates.length === 0) {
        return {
          turn: {
            status: "CHAT_REPLY",
            assistantMessage:
              assistantMessage || "Please tell me your goal, budget, and expected time window.",
          },
        };
      }
      return {
        turn: {
          status: "PROPOSAL_READY",
          assistantMessage: assistantMessage || "Strategy proposal drafted. Please review immediately.",
          proposals: normalizedCandidates,
          proposal: normalizedCandidates[0],
        },
      };
    }

    return {
      turn: {
        status: "CHAT_REPLY",
        assistantMessage: assistantMessage || "Please tell me your goal, budget, and expected time window.",
      },
    };
  };

  return new StateGraph(ChatState)
    .addNode("prepare_input", prepareInput)
    .addNode("remote_decide", remoteDecide)
    .addNode("finalize_turn", finalizeTurn)
    .addEdge(START, "prepare_input")
    .addEdge("prepare_input", "remote_decide")
    .addEdge("remote_decide", "finalize_turn")
    .addEdge("finalize_turn", END)
    .compile();
}

function createAiStrategyService(options = {}) {
  const provider = normalizeProvider(
    options.provider || process.env.MQ_AI_PROVIDER || DEFAULT_REMOTE_PROVIDER,
  );
  const model = asString(
    options.model ||
      process.env.MQ_AI_MODEL ||
      (provider === "bigmodel" ? BIGMODEL_DEFAULT_MODEL : "qwen2.5:7b-instruct"),
  );
  const baseUrl = asString(
    options.baseUrl ||
      process.env.MQ_AI_BASE_URL ||
      (provider === "bigmodel" ? BIGMODEL_BASE_URL : "http://127.0.0.1:11434/v1"),
  );
  const apiKey = asString(options.apiKey || process.env.MQ_AI_API_KEY);
  const timeoutMs = Number(
    options.timeoutMs ||
      process.env.MQ_AI_TIMEOUT_MS ||
      (provider === "bigmodel" ? BIGMODEL_DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
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
    parseJsonLoose,
  });
  const strategyChatGraph = createStrategyChatGraph({
    resolveRemoteChatDecision,
    normalizeAiDecision,
    provider,
    model,
  });

  async function resolveRemoteChatDecision(input) {
    if (provider === "bigmodel" && !apiKey) {
      throw new Error("MQ_AI_API_KEY is required for provider=bigmodel");
    }
    const prompt = buildChatPromptPayload({
      merchantId: input.merchantId,
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      history: input.history,
      activeCampaigns: input.activeCampaigns,
      approvedStrategies: input.approvedStrategies,
      executionHistory: input.executionHistory,
      salesSnapshot: input.salesSnapshot,
    });
    return modelGateway.invokeChat(prompt.messages);
  }

  async function generateStrategyChatTurn(input) {
    try {
      const result = await strategyChatGraph.invoke({
        input: isObjectLike(input) ? input : {},
      });
      if (result && isObjectLike(result.turn)) {
        return result.turn;
      }
      return createAiUnavailableResult("strategy chat returned empty result");
    } catch (error) {
      return createAiUnavailableResult(`langgraph strategy chat failed: ${summarizeError(error)}`);
    }
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
      plannerEngine: "langgraph",
      retryPolicy: gatewayInfo.retry,
      modelClient: gatewayInfo.modelClient,
    };
  }

  return {
    generateStrategyChatTurn,
    getRuntimeInfo,
  };
}

module.exports = {
  createAiStrategyService,
};
