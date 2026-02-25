const {
  createCampaignFromTemplate,
  listStrategyTemplates,
} = require("./strategyLibrary");
const { Annotation, StateGraph, START, END } = require("@langchain/langgraph");
const { createLangChainModelGateway } = require("./aiStrategy/langchainModelGateway");
const {
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
  DEFAULT_CIRCUIT_COOLDOWN_MS,
} = require("./aiStrategy/resilience");

const DEFAULT_REMOTE_PROVIDER = "openai_compatible";
const REMOTE_PROVIDERS = new Set(["deepseek", "openai_compatible", "bigmodel"]);
const BIGMODEL_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const BIGMODEL_DEFAULT_MODEL = "glm-4.7-flash";
const BIGMODEL_DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_MAX_RETRIES = DEFAULT_RETRY_MAX_ATTEMPTS;
const DEFAULT_RETRY_BACKOFF = DEFAULT_RETRY_BACKOFF_MS;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = DEFAULT_CIRCUIT_FAILURE_THRESHOLD;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = DEFAULT_CIRCUIT_COOLDOWN_MS;

const SLOT_QUESTION_BANK = {
  goal: "你这次更想要哪个目标：拉新、召回、提客单还是去库存？",
  audience: "目标人群是新客、老客、会员还是高价值用户？",
  time_window: "希望在哪个时段生效：今天/明天/午市/晚市/周末？",
  budget_cap: "本次活动预算上限希望控制在多少元？",
};

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
  // Backward-compatible alias.
  if (normalized === "mock") {
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

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function findTemplateById(templates, templateId) {
  const normalized = asString(templateId);
  if (!normalized) {
    return null;
  }
  return templates.find((item) => item.templateId === normalized) || null;
}

function findBranchById(template, branchId) {
  const normalized = asString(branchId);
  if (!template || !normalized) {
    return null;
  }
  return template.branches.find((item) => item.branchId === normalized) || null;
}

function parseBudgetCapFromIntent(intent) {
  const normalized = asString(intent).toLowerCase();
  if (!normalized) {
    return null;
  }
  const patterns = [
    /预算(?:控制在|不超过|上限|约|为)?\s*([0-9]{2,5})\s*(?:元|块|rmb|yuan)?/i,
    /([0-9]{2,5})\s*(?:元|块)\s*(?:预算|投放|成本)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) {
      continue;
    }
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return Math.round(clampNumber(parsed, 30, 5000, parsed));
    }
  }
  return null;
}

function parseGoalScores(intent) {
  const normalized = asString(intent).toLowerCase();
  const scores = {
    acquisition: 0,
    activation: 0,
    revenue: 0,
    retention: 0,
  };
  if (!normalized) {
    return scores;
  }
  if (includesAny(normalized, ["拉新", "新客", "首单", "获客", "acquire", "new user"])) {
    scores.acquisition += 2;
  }
  if (includesAny(normalized, ["活跃", "会员日", "天气", "高温", "雨天", "签到", "activation"])) {
    scores.activation += 2;
  }
  if (includesAny(normalized, ["客单", "收入", "营收", "充值", "支付", "库存", "急售", "revenue"])) {
    scores.revenue += 2;
  }
  if (includesAny(normalized, ["召回", "复购", "沉默", "流失", "回流", "retention", "winback"])) {
    scores.retention += 2;
  }
  return scores;
}

function parseTimeWindow(intent) {
  const normalized = asString(intent).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (includesAny(normalized, ["今天", "today", "今晚", "tonight", "立即", "马上", "now"])) {
    return "TODAY";
  }
  if (includesAny(normalized, ["明天", "tomorrow", "次日"])) {
    return "TOMORROW";
  }
  if (includesAny(normalized, ["午市", "午餐", "中午", "lunch"])) {
    return "LUNCH";
  }
  if (includesAny(normalized, ["晚市", "晚餐", "晚上", "dinner"])) {
    return "DINNER";
  }
  if (includesAny(normalized, ["周末", "weekend"])) {
    return "WEEKEND";
  }
  return "";
}

function parseAudience(intent) {
  const normalized = asString(intent).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (includesAny(normalized, ["新客", "new user"])) {
    return "NEW_USER";
  }
  if (includesAny(normalized, ["老客", "老用户", "regular", "returning"])) {
    return "EXISTING_USER";
  }
  if (includesAny(normalized, ["会员", "member"])) {
    return "MEMBER";
  }
  if (includesAny(normalized, ["高价值", "vip", "high value"])) {
    return "HIGH_VALUE";
  }
  return "";
}

function buildIntentProfile(intent) {
  const normalized = asString(intent).toLowerCase();
  const goalScores = parseGoalScores(intent);
  const entries = Object.entries(goalScores);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const topScore = sorted[0] ? sorted[0][1] : 0;
  const secondScore = sorted[1] ? sorted[1][1] : 0;
  const primaryGoal = topScore > 0 && sorted[0] ? sorted[0][0] : "";
  const ambiguousGoal = topScore === 0 || (secondScore > 0 && topScore - secondScore <= 1);

  return {
    normalized,
    budgetCap: parseBudgetCapFromIntent(intent),
    timeWindow: parseTimeWindow(intent),
    audience: parseAudience(intent),
    primaryGoal,
    ambiguousGoal,
    tokenCount: normalized.split(/\s+/).filter(Boolean).length,
  };
}

function buildClarificationResult({ missingSlots, profile }) {
  const uniqueSlots = [...new Set(missingSlots)].slice(0, 3);
  const questions = uniqueSlots.map((slot) => SLOT_QUESTION_BANK[slot]).filter(Boolean);
  return {
    status: "NEED_CLARIFICATION",
    missingSlots: uniqueSlots,
    questions,
    rationale: "Intent is ambiguous or incomplete. Clarification is required before generating safe strategy proposals.",
    confidence: profile && profile.ambiguousGoal ? 0.35 : 0.45,
  };
}

function shouldClarifyIntent({ input, profile }) {
  if (asString(input.templateId) || asString(input.branchId)) {
    return null;
  }

  const intent = asString(input.intent);
  const missingSlots = [];
  if (!intent || intent.length < 6 || profile.ambiguousGoal) {
    missingSlots.push("goal");
  }
  if (!profile.budgetCap) {
    missingSlots.push("budget_cap");
  }
  if (!profile.timeWindow) {
    missingSlots.push("time_window");
  }
  if (!profile.audience) {
    missingSlots.push("audience");
  }

  const shouldClarify =
    intent.length < 6 ||
    profile.ambiguousGoal ||
    (!profile.budgetCap && !profile.timeWindow && !profile.audience && intent.length < 10);
  if (!shouldClarify) {
    return null;
  }
  return buildClarificationResult({ missingSlots, profile });
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

function buildPromptPayload({
  merchantId,
  templateId,
  branchId,
  intent,
  overrides,
  templates,
}) {
  const requestedTemplateId = asString(templateId);
  const scopedTemplates =
    requestedTemplateId && Array.isArray(templates)
      ? templates.filter((item) => item && item.templateId === requestedTemplateId)
      : templates;
  const sourceTemplates =
    Array.isArray(scopedTemplates) && scopedTemplates.length > 0
      ? scopedTemplates
      : templates;

  const compactTemplates = sourceTemplates.map((item) => ({
    templateId: item.templateId,
    category: item.category,
    name: item.name,
    triggerEvent: item.triggerEvent,
    defaultBranchId: item.defaultBranchId,
    branches: item.branches.map((branch) => ({
      branchId: branch.branchId,
      name: branch.name,
      description: branch.description,
      recommendedBudgetCap: branch.recommendedBudgetCap,
      recommendedCostPerHit: branch.recommendedCostPerHit,
      recommendedPriority: branch.recommendedPriority,
    })),
  }));
  const userPayload = {
    merchantId,
    templateId: templateId || null,
    branchId: branchId || null,
    intent: asString(intent),
    overrides: overrides || {},
    templates: compactTemplates,
    outputSchema: {
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
  };
  return {
    messages: [
      {
        role: "system",
        content:
          "You are MealQuest strategy planner. Output strict JSON only. Pick one template+branch and return campaignPatch.",
      },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
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
    title: asString(decision.title) || `${template.name} · ${branch.name} · AI`,
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

function buildChatPromptPayload({
  merchantId,
  sessionId,
  userMessage,
  history = [],
  activeCampaigns = [],
  approvedStrategies = [],
}) {
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-24)
        .map((item) => ({
          role: asString(item.role || "ASSISTANT").toUpperCase(),
          type: asString(item.type || "TEXT").toUpperCase(),
          text: truncateText(item.text || "", 320),
          proposalId: asString(item.proposalId || ""),
          createdAt: asString(item.createdAt || ""),
        }))
    : [];

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

  const userPayload = {
    task: "STRATEGY_CHAT",
    merchantId,
    sessionId,
    userMessage: asString(userMessage),
    history: safeHistory,
    activeCampaigns: safeActiveCampaigns,
    approvedStrategies: safeApprovedStrategies,
    outputSchema: {
      mode: "CHAT_REPLY|PROPOSAL",
      assistantMessage: "string",
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
      "When mode=PROPOSAL, proposal fields are required.",
      "Avoid repeating already approved strategies with the same templateId+branchId unless user asks.",
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

function createConcurrencyQueue(maxConcurrency) {
  const safeMaxConcurrency = toPositiveInt(maxConcurrency, DEFAULT_MAX_CONCURRENCY);
  const pending = [];
  let activeCount = 0;

  function scheduleNext() {
    if (activeCount >= safeMaxConcurrency) {
      return;
    }
    const item = pending.shift();
    if (!item) {
      return;
    }
    activeCount += 1;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeCount -= 1;
        scheduleNext();
      });
  }

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        pending.push({ task, resolve, reject });
        scheduleNext();
      });
    },
    snapshot() {
      return {
        maxConcurrency: safeMaxConcurrency,
        activeCount,
        pendingCount: pending.length,
      };
    },
  };
}

function createStrategyPlannerGraph({
  provider,
  model,
  resolveRemoteDecision,
  normalizeAiDecision,
  buildCandidateDecisionSet,
}) {
  const PlannerState = Annotation.Root({
    input: Annotation(),
    templates: Annotation({ default: () => [] }),
    profile: Annotation({ default: () => null }),
    clarification: Annotation({ default: () => null }),
    baseDecision: Annotation({ default: () => null }),
    plan: Annotation({ default: () => null }),
  });

  const prepareInput = (state) => {
    const input = isObjectLike(state.input) ? state.input : {};
    const templates = listStrategyTemplates();
    const profile = buildIntentProfile(input.intent);
    const clarification = shouldClarifyIntent({ input, profile });

    if (clarification) {
      return {
        input,
        templates,
        profile,
        clarification,
        plan: clarification,
      };
    }
    return {
      input,
      templates,
      profile,
    };
  };

  const remoteDecide = async (state) => {
    if (state.plan && state.plan.status === "NEED_CLARIFICATION") {
      return {};
    }

    try {
      const remoteDecision = await resolveRemoteDecision(state.input, state.templates);
      return {
        baseDecision: isObjectLike(remoteDecision) ? remoteDecision : {},
      };
    } catch (error) {
      return {
        plan: createAiUnavailableResult(summarizeError(error)),
      };
    }
  };

  const assemblePlan = (state) => {
    if (state.plan && state.plan.status === "AI_UNAVAILABLE") {
      return {};
    }
    if (state.clarification) {
      return {
        plan: state.clarification,
      };
    }

    const input = isObjectLike(state.input) ? state.input : {};
    const templates =
      Array.isArray(state.templates) && state.templates.length > 0
        ? state.templates
        : listStrategyTemplates();
    const profile = state.profile || buildIntentProfile(input.intent);
    const baseDecision = isObjectLike(state.baseDecision) ? state.baseDecision : {};

    const decisionSet = buildCandidateDecisionSet({
      input,
      baseDecision,
      profile,
    });

    const proposals = decisionSet.map((decision) =>
      normalizeAiDecision({
        input,
        rawDecision: decision,
        provider,
        model,
        templates,
      }),
    );

    return {
      plan: {
        status: "PROPOSALS",
        proposals,
        confidence: Number(baseDecision.confidence) || null,
        rationale: asString(baseDecision.rationale),
        sourceProvider: provider.toUpperCase(),
        sourceModel: asString(model) || "unknown",
      },
    };
  };

  return new StateGraph(PlannerState)
    .addNode("prepare_input", prepareInput)
    .addNode("remote_decide", remoteDecide)
    .addNode("assemble_plan", assemblePlan)
    .addEdge(START, "prepare_input")
    .addEdge("prepare_input", "remote_decide")
    .addEdge("remote_decide", "assemble_plan")
    .addEdge("assemble_plan", END)
    .compile();
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

    if (mode === "PROPOSAL" && isObjectLike(decision.proposal)) {
      const input = isObjectLike(state.input) ? state.input : {};
      const normalized = normalizeAiDecision({
        input: {
          merchantId: input.merchantId,
          templateId: asString(decision.proposal.templateId) || input.templateId,
          branchId: asString(decision.proposal.branchId) || input.branchId,
          overrides: {},
        },
        rawDecision: decision.proposal,
        provider,
        model,
        templates: listStrategyTemplates(),
      });
      return {
        turn: {
          status: "PROPOSAL_READY",
          assistantMessage: assistantMessage || "Strategy proposal drafted. Please review immediately.",
          proposal: normalized,
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

function createVariantPatch(basePatch, variantKey, indexSeed) {
  const patch = deepClone(basePatch || {});
  const budget = patch.budget || {};
  const cap = Number(budget.cap) || 120;
  const costPerHit = Number(budget.costPerHit) || 8;
  const priority = Number(patch.priority) || 70;

  const variants = {
    CONSERVATIVE: {
      label: "保守",
      capScale: 0.75,
      costScale: 0.85,
      priorityDelta: -4,
      confidenceDelta: -0.04,
    },
    BALANCED: {
      label: "稳健",
      capScale: 1,
      costScale: 1,
      priorityDelta: 0,
      confidenceDelta: 0,
    },
    AGGRESSIVE: {
      label: "激进",
      capScale: 1.25,
      costScale: 1.15,
      priorityDelta: 6,
      confidenceDelta: -0.02,
    },
  };
  const variant = variants[variantKey] || variants.BALANCED;

  patch.name = `${asString(patch.name) || "Strategy"} · ${variant.label}`;
  patch.priority = Math.round(clampNumber(priority + variant.priorityDelta, 40, 999, priority));
  patch.budget = {
    cap: Math.round(clampNumber(cap * variant.capScale, 30, 5000, cap)),
    used: 0,
    costPerHit: Math.round(clampNumber(costPerHit * variant.costScale, 1, 500, costPerHit)),
  };
  if (!patch.id) {
    patch.id = `campaign_variant_${Date.now()}_${indexSeed}_${variantKey.toLowerCase()}`;
  }
  return {
    patch,
    confidenceDelta: variant.confidenceDelta,
    label: variant.label,
    variantKey,
  };
}

function buildCandidateDecisionSet({ input, baseDecision, profile }) {
  const hasExplicitSelection = Boolean(asString(input.templateId) || asString(input.branchId));
  if (hasExplicitSelection) {
    return [
      {
        ...baseDecision,
        title: asString(baseDecision.title) || "策略提案",
      },
    ];
  }

  const variants = ["BALANCED", "CONSERVATIVE", "AGGRESSIVE"];
  return variants.map((variantKey, index) => {
    const variant = createVariantPatch(baseDecision.campaignPatch || {}, variantKey, index + 1);
    const confidence = clampNumber(
      Number(baseDecision.confidence) + variant.confidenceDelta,
      0.05,
      0.98,
      Number(baseDecision.confidence) || 0.6,
    );
    const titleBase = asString(baseDecision.title) || "策略提案";
    return {
      ...baseDecision,
      title: `${titleBase}（${variant.label}）`,
      confidence,
      campaignPatch: variant.patch,
      rationale: `${asString(baseDecision.rationale)} Variant=${variant.variantKey}; Goal=${profile.primaryGoal || "unknown"}.`,
      variant: variant.variantKey,
    };
  });
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
  const maxConcurrency = toPositiveInt(
    options.maxConcurrency || process.env.MQ_AI_MAX_CONCURRENCY,
    DEFAULT_MAX_CONCURRENCY,
  );
  const maxRetries = toPositiveInt(
    options.maxRetries || process.env.MQ_AI_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
  );
  const retryBackoffMs = toPositiveInt(
    options.retryBackoffMs || process.env.MQ_AI_RETRY_BACKOFF_MS,
    DEFAULT_RETRY_BACKOFF,
  );
  const circuitFailureThreshold = toPositiveInt(
    options.circuitFailureThreshold || process.env.MQ_AI_CIRCUIT_BREAKER_THRESHOLD,
    DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  );
  const circuitCooldownMs = toPositiveInt(
    options.circuitCooldownMs || process.env.MQ_AI_CIRCUIT_BREAKER_COOLDOWN_MS,
    DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS,
  );
  const remoteQueue = createConcurrencyQueue(maxConcurrency);
  const modelGateway = createLangChainModelGateway({
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    maxRetries,
    retryBackoffMs,
    circuitFailureThreshold,
    circuitCooldownMs,
    queue: remoteQueue,
    parseJsonLoose,
  });
  const strategyPlannerGraph = createStrategyPlannerGraph({
    provider,
    model,
    resolveRemoteDecision,
    normalizeAiDecision,
    buildCandidateDecisionSet,
  });
  const strategyChatGraph = createStrategyChatGraph({
    resolveRemoteChatDecision,
    normalizeAiDecision,
    provider,
    model,
  });

  async function resolveRemoteDecision(input, templates) {
    if (provider === "bigmodel" && !apiKey) {
      throw new Error("MQ_AI_API_KEY is required for provider=bigmodel");
    }
    const prompt = buildPromptPayload({
      merchantId: input.merchantId,
      templateId: input.templateId,
      branchId: input.branchId,
      intent: input.intent,
      overrides: input.overrides,
      templates,
    });
    return modelGateway.invokePlanner(prompt.messages);
  }

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
    });
    return modelGateway.invokeChat(prompt.messages);
  }

  async function generateStrategyPlan(input) {
    try {
      const result = await strategyPlannerGraph.invoke({
        input: isObjectLike(input) ? input : {},
      });
      if (result && isObjectLike(result.plan)) {
        return result.plan;
      }
      return createAiUnavailableResult("strategy planner returned empty result");
    } catch (error) {
      return createAiUnavailableResult(`langgraph planner failed: ${summarizeError(error)}`);
    }
  }

  async function generateStrategyProposal(input) {
    const plan = await generateStrategyPlan(input);
    if (!plan || plan.status !== "PROPOSALS") {
      if (plan && plan.status === "AI_UNAVAILABLE") {
        throw new Error(plan.reason || "ai unavailable");
      }
      throw new Error("strategy clarification required");
    }
    return plan.proposals[0];
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
    const queue = remoteQueue.snapshot();
    const gatewayInfo = modelGateway.getRuntimeInfo();
    return {
      provider,
      model,
      baseUrl,
      configured: true,
      remoteEnabled,
      remoteConfigured: remoteEnabled ? Boolean(apiKey) : false,
      plannerEngine: "langgraph",
      maxConcurrency: queue.maxConcurrency,
      queueActive: queue.activeCount,
      queuePending: queue.pendingCount,
      retryPolicy: gatewayInfo.retry,
      circuitBreaker: gatewayInfo.circuitBreaker,
    };
  }

  return {
    generateStrategyPlan,
    generateStrategyProposal,
    generateStrategyChatTurn,
    getRuntimeInfo,
  };
}

module.exports = {
  createAiStrategyService,
};
