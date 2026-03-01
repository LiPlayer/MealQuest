const { createAgent, providerStrategy, toolStrategy } = require("langchain");

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      if (typeof part.output_text === "string") {
        return part.output_text;
      }
      if (part.type === "text" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function coerceRawText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isAssistantMessage(message) {
  if (!message || typeof message !== "object") {
    return false;
  }
  const role = asString(message.role).toLowerCase();
  if (role === "assistant") {
    return true;
  }
  const typeByField = asString(message.type).toLowerCase();
  if (typeByField === "ai" || typeByField === "assistant") {
    return true;
  }
  if (typeof message.getType === "function") {
    const type = asString(message.getType()).toLowerCase();
    if (type === "ai" || type === "assistant") {
      return true;
    }
  }
  if (typeof message._getType === "function") {
    const type = asString(message._getType()).toLowerCase();
    if (type === "ai" || type === "assistant") {
      return true;
    }
  }
  return false;
}

function extractRawTextFromAiMessage(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (
    message.additional_kwargs &&
    message.additional_kwargs.parsed &&
    typeof message.additional_kwargs.parsed === "object"
  ) {
    return JSON.stringify(message.additional_kwargs.parsed);
  }
  const content = normalizeMessageContent(message.content);
  if (content) {
    return content;
  }
  if (
    message.additional_kwargs &&
    typeof message.additional_kwargs.refusal === "string"
  ) {
    return message.additional_kwargs.refusal;
  }
  return "";
}

function extractAssistantRawTextFromAgentState(state) {
  const messages =
    state && Array.isArray(state.messages) ? state.messages : [];
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (!isAssistantMessage(message)) {
      continue;
    }
    const text = extractRawTextFromAiMessage(message);
    if (text) {
      return text;
    }
  }
  return "";
}

function buildStructuredResponseFormat({
  structuredOutputMethod,
  schema,
  strict,
}) {
  if (structuredOutputMethod === "providerStrategy") {
    if (strict === undefined) {
      return providerStrategy(schema);
    }
    return providerStrategy({
      schema,
      strict: Boolean(strict),
    });
  }
  return toolStrategy(schema);
}

function buildStructuredAgentCacheKey({
  method,
  strict,
  schema,
  schemaName,
}) {
  const normalizedMethod = asString(method) || "toolStrategy";
  const strictKey = strict === undefined ? "null" : String(Boolean(strict));
  const named = asString(schemaName);
  if (named) {
    return `${normalizedMethod}|${strictKey}|name:${named}`;
  }
  if (schema && typeof schema.safeParse === "function") {
    const schemaType =
      schema &&
      schema._def &&
      typeof schema._def.type === "string"
        ? schema._def.type
        : "zod";
    return `${normalizedMethod}|${strictKey}|zod:${schemaType}`;
  }
  try {
    return `${normalizedMethod}|${strictKey}|json:${JSON.stringify(schema)}`;
  } catch {
    return `${normalizedMethod}|${strictKey}|schema:opaque`;
  }
}

function createLangChainAgentRuntime(options = {}) {
  const {
    chatModel,
    parseJsonStrict,
    structuredOutputMethod,
  } = options;
  if (!chatModel) {
    throw new Error("langchain agent runtime requires chatModel");
  }
  if (typeof parseJsonStrict !== "function") {
    throw new Error("langchain agent runtime requires parseJsonStrict");
  }

  const baseAgent = createAgent({
    model: chatModel,
    tools: [],
  });
  const structuredAgentCache = new Map();

  function getStructuredAgent(structured) {
    const schema =
      structured && structured.schema && typeof structured.schema === "object"
        ? structured.schema
        : { type: "object" };
    const strict =
      structured &&
      Object.prototype.hasOwnProperty.call(structured, "strict")
        ? Boolean(structured.strict)
        : undefined;
    const cacheKey = buildStructuredAgentCacheKey({
      method: structuredOutputMethod,
      strict,
      schema,
      schemaName: structured && structured.name,
    });
    const cached = structuredAgentCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const responseFormat = buildStructuredResponseFormat({
      structuredOutputMethod,
      schema,
      strict,
    });
    const agent = createAgent({
      model: chatModel,
      tools: [],
      responseFormat,
    });
    structuredAgentCache.set(cacheKey, agent);
    return agent;
  }

  async function invokeChatWithRaw(messages, invokeOptions = {}) {
    if (
      invokeOptions &&
      typeof invokeOptions === "object" &&
      invokeOptions.structuredOutput &&
      typeof invokeOptions.structuredOutput === "object"
    ) {
      const structuredAgent = getStructuredAgent(invokeOptions.structuredOutput);
      const result = await structuredAgent.invoke({ messages });
      const parsedValue =
        result &&
        typeof result === "object" &&
        result.structuredResponse &&
        typeof result.structuredResponse === "object"
          ? result.structuredResponse
          : null;
      const rawText =
        extractAssistantRawTextFromAgentState(result) ||
        coerceRawText(parsedValue);
      if (parsedValue && typeof parsedValue === "object") {
        return {
          rawText,
          parsed: parsedValue,
        };
      }
      return {
        rawText,
        parsed: parseJsonStrict(rawText),
      };
    }
    const result = await baseAgent.invoke({ messages });
    const rawText = extractAssistantRawTextFromAgentState(result);
    return {
      rawText,
      parsed: parseJsonStrict(rawText),
    };
  }

  async function* streamChatEvents(messages) {
    const runStartAt = new Date().toISOString();
    let emittedStart = false;
    const eventStream = await baseAgent.streamEvents(
      { messages },
      { version: "v2" }
    );
    for await (const event of eventStream) {
      const eventName = asString(event && event.event).toLowerCase();
      if (eventName === "on_chat_model_start") {
        emittedStart = true;
        yield {
          type: "start",
          at: runStartAt,
          runId: asString(event && (event.run_id || event.runId)),
          raw: event,
        };
        continue;
      }
      if (eventName === "on_chat_model_stream") {
        const chunk = event && event.data ? event.data.chunk : null;
        const text = normalizeMessageContent(chunk && chunk.content);
        if (!text) {
          continue;
        }
        yield {
          type: "token",
          text,
          raw: event,
        };
        continue;
      }
      if (eventName === "on_chat_model_end") {
        yield {
          type: "end",
          at: new Date().toISOString(),
          runId: asString(event && (event.run_id || event.runId)),
          raw: event,
        };
      }
    }
    if (!emittedStart) {
      yield {
        type: "start",
        at: runStartAt,
        runId: "",
        raw: null,
      };
    }
    yield {
      type: "end",
      at: new Date().toISOString(),
      runId: "",
      raw: null,
    };
  }

  return {
    invokeChatWithRaw,
    streamChatEvents,
    structuredOutputMethod,
  };
}

module.exports = {
  createLangChainAgentRuntime,
};

