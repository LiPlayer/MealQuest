const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildMessages(systemText, userContent) {
  return [
    new SystemMessage(asString(systemText)),
    new HumanMessage(
      typeof userContent === "string"
        ? userContent
        : JSON.stringify(userContent || {})
    ),
  ];
}

function buildChatPromptPayload({ userMessage, templateCatalog }) {
  const promptUserMessage = asString(userMessage);
  return {
    messages: buildMessages(
      [
        "You are MealQuest strategy copilot for merchants.",
        "Keep responses concise, practical, and aligned with the merchant language.",
        "Do not output markdown code fences.",
        "When user explicitly asks to draft/create/publish a strategy, call tool propose_policy_draft with valid templateId and branchId.",
        "When user only chats, do not call any tool.",
        `Available templates: ${JSON.stringify(Array.isArray(templateCatalog) ? templateCatalog : [])}`,
      ].join(" "),
      promptUserMessage || "Please ask a clarifying question.",
    ),
  };
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
  buildCriticMessages,
  buildReviseMessages,
};
