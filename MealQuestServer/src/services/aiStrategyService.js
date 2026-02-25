const {
  createCampaignFromTemplate,
  listStrategyTemplates,
} = require("./strategyLibrary");

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) {
    return "mock";
  }
  if (["mock", "deepseek", "openai_compatible"].includes(normalized)) {
    return normalized;
  }
  return "mock";
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

function pickTemplateFromIntent(intent, templates) {
  const normalized = String(intent || "").toLowerCase();
  if (!normalized) {
    return templates[0] || null;
  }
  if (normalized.includes("高温") || normalized.includes("天气") || normalized.includes("rain")) {
    return templates.find((item) => item.templateId === "activation_contextual_drop") || null;
  }
  if (normalized.includes("库存") || normalized.includes("急售")) {
    return templates.find((item) => item.templateId === "revenue_dynamic_drop") || null;
  }
  if (normalized.includes("首单") || normalized.includes("新客")) {
    return templates.find((item) => item.templateId === "acquisition_first_buy") || null;
  }
  return templates[0] || null;
}

function resolveTemplateAndBranch({
  templateId,
  branchId,
  aiTemplateId,
  aiBranchId,
  templates,
  intent,
}) {
  const fallbackTemplate = pickTemplateFromIntent(intent, templates);
  const template =
    templates.find((item) => item.templateId === aiTemplateId) ||
    templates.find((item) => item.templateId === templateId) ||
    fallbackTemplate;
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

async function callOpenAiCompatible({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  payload,
}) {
  if (!apiKey) {
    throw new Error("MQ_AI_API_KEY is required for remote AI provider");
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`ai provider http ${response.status}: ${raw.slice(0, 240)}`);
    }
    return JSON.parse(raw);
  } finally {
    clearTimeout(timeout);
  }
}

function buildPromptPayload({
  merchantId,
  templateId,
  branchId,
  intent,
  overrides,
  templates,
}) {
  const compactTemplates = templates.map((item) => ({
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
    intent: String(intent || ""),
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
}) {
  const templates = listStrategyTemplates();
  const decision = isObjectLike(rawDecision) ? rawDecision : {};
  const resolved = resolveTemplateAndBranch({
    templateId: input.templateId,
    branchId: input.branchId,
    aiTemplateId: decision.templateId,
    aiBranchId: decision.branchId,
    templates,
    intent: input.intent,
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
    title:
      asString(decision.title) ||
      `${template.name} · ${branch.name} · AI`,
    campaign,
    template,
    branch,
    strategyMeta,
  };
}

function createMockDecision({
  templateId,
  branchId,
  intent,
}) {
  return {
    templateId,
    branchId,
    title: intent ? `AI策略提案：${intent}` : "AI策略提案",
    rationale: "Mock provider generated strategy for local/test environment.",
    confidence: 0.72,
    campaignPatch: {},
  };
}

function createAiStrategyService(options = {}) {
  const provider = normalizeProvider(options.provider || process.env.MQ_AI_PROVIDER || "mock");
  const model = asString(options.model || process.env.MQ_AI_MODEL || "deepseek-chat");
  const baseUrl = asString(
    options.baseUrl || process.env.MQ_AI_BASE_URL || "https://api.deepseek.com/v1",
  );
  const apiKey = asString(options.apiKey || process.env.MQ_AI_API_KEY);
  const timeoutMs = Number(options.timeoutMs || process.env.MQ_AI_TIMEOUT_MS || 15000);

  async function generateStrategyProposal(input) {
    const templates = listStrategyTemplates();
    if (provider === "mock") {
      return normalizeAiDecision({
        input,
        rawDecision: createMockDecision({
          templateId: input.templateId,
          branchId: input.branchId,
          intent: input.intent,
        }),
        provider,
        model,
      });
    }

    const prompt = buildPromptPayload({
      merchantId: input.merchantId,
      templateId: input.templateId,
      branchId: input.branchId,
      intent: input.intent,
      overrides: input.overrides,
      templates,
    });

    const remote = await callOpenAiCompatible({
      apiKey,
      baseUrl,
      model,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 15000,
      payload: {
        model,
        temperature: 0.2,
        messages: prompt.messages,
      },
    });
    const content =
      remote &&
      Array.isArray(remote.choices) &&
      remote.choices[0] &&
      remote.choices[0].message &&
      remote.choices[0].message.content;
    const parsed = parseJsonLoose(content);
    return normalizeAiDecision({
      input,
      rawDecision: parsed,
      provider,
      model,
    });
  }

  function getRuntimeInfo() {
    return {
      provider,
      model,
      baseUrl,
      configured: provider === "mock" ? true : Boolean(apiKey),
    };
  }

  return {
    generateStrategyProposal,
    getRuntimeInfo,
  };
}

module.exports = {
  createAiStrategyService,
};
