function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildMessages(systemText, userContent) {
  return [
    {
      role: "system",
      content: asString(systemText),
    },
    {
      role: "user",
      content:
        typeof userContent === "string"
          ? userContent
          : JSON.stringify(userContent || {}),
    },
  ];
}

function buildChatPromptPayload({ userMessage }) {
  const promptUserMessage = asString(userMessage);
  return {
    messages: buildMessages(
      [
        "You are MealQuest strategy copilot for merchants.",
        "Keep responses concise, practical, and aligned with the merchant language.",
        "Do not output markdown code fences.",
      ].join(" "),
      promptUserMessage || "Please ask a clarifying question.",
    ),
  };
}

function buildDecisionMessages({
  userMessage,
  assistantMessage,
  templateCatalog,
  schemaVersion,
}) {
  return buildMessages(
    [
      "Decide whether this turn should remain chat or become a strategy proposal.",
      "Return mode=PROPOSAL only when the user clearly asks to draft/create/publish a strategy.",
      "If mode=PROPOSAL, proposals must use valid templateId and branchId from templateCatalog.",
      "Always return assistantMessage in the same language as the user message.",
    ].join(" "),
    {
      schemaVersion,
      userMessage: asString(userMessage),
      assistantMessage: asString(assistantMessage),
      templateCatalog: Array.isArray(templateCatalog) ? templateCatalog : [],
    },
  );
}

function buildCriticMessages({
  merchantId,
  sessionId,
  round,
  userMessage,
  proposals,
}) {
  return buildMessages(
    [
      "You are a strategy proposal critic.",
      "Review current proposals and return whether revision is needed.",
    ].join(" "),
    {
      merchantId: asString(merchantId),
      sessionId: asString(sessionId),
      round,
      userMessage: asString(userMessage),
      proposals: Array.isArray(proposals) ? proposals : [],
    },
  );
}

function buildReviseMessages({
  merchantId,
  sessionId,
  round,
  userMessage,
  criticDecision,
  validationIssues,
  proposals,
}) {
  return buildMessages(
    [
      "You are a strategy proposal reviser.",
      "Revise proposals to satisfy critic feedback and policy patch allowlist constraints.",
    ].join(" "),
    {
      merchantId: asString(merchantId),
      sessionId: asString(sessionId),
      round,
      userMessage: asString(userMessage),
      criticDecision: criticDecision && typeof criticDecision === "object" ? criticDecision : {},
      validationIssues: Array.isArray(validationIssues) ? validationIssues : [],
      proposals: Array.isArray(proposals) ? proposals : [],
    },
  );
}

module.exports = {
  buildChatPromptPayload,
  buildDecisionMessages,
  buildCriticMessages,
  buildReviseMessages,
};

