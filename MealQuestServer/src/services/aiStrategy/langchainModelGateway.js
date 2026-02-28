const { ChatOpenAI } = require("@langchain/openai");

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
      if (part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildRawMessageSnapshot(message) {
  const safe = message && typeof message === "object" ? message : {};
  return {
    id: typeof safe.id === "string" ? safe.id : "",
    content: safe.content,
    additional_kwargs:
      safe.additional_kwargs && typeof safe.additional_kwargs === "object"
        ? safe.additional_kwargs
        : {},
    response_metadata:
      safe.response_metadata && typeof safe.response_metadata === "object"
        ? safe.response_metadata
        : {},
    tool_calls: Array.isArray(safe.tool_calls) ? safe.tool_calls : [],
    invalid_tool_calls: Array.isArray(safe.invalid_tool_calls)
      ? safe.invalid_tool_calls
      : [],
    usage_metadata:
      safe.usage_metadata && typeof safe.usage_metadata === "object"
        ? safe.usage_metadata
        : {},
  };
}

function createLangChainModelGateway(options = {}) {
  const {
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    maxRetries,
    parseJsonLoose,
  } = options;
  if (typeof parseJsonLoose !== "function") {
    throw new Error("langchain model gateway requires parseJsonLoose");
  }

  const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
    ? Math.max(0, Math.floor(Number(maxRetries)))
    : 2;
  const sharedOptions = {
    model,
    apiKey,
    timeout: Number(timeoutMs) || 15000,
    maxRetries: resolvedMaxRetries,
    configuration: {
      baseURL: asString(baseUrl).replace(/\/+$/, ""),
    },
    modelKwargs: provider === "bigmodel" ? { thinking: { type: "disabled" } } : {},
  };
  const chatModel = new ChatOpenAI({
    ...sharedOptions,
    temperature: 0.2,
    maxTokens: 2048,
  });

  async function invokeJson(messages, modelClient) {
    const response = await modelClient.invoke(messages);
    const rawContent = response && response.content;
    const content = normalizeMessageContent(rawContent);
    return parseJsonLoose(content);
  }

  function invokeChat(messages) {
    return invokeJson(messages, chatModel);
  }

  async function invokeChatRaw(messages) {
    const verbose = await invokeChatRawVerbose(messages);
    return verbose.content;
  }

  async function invokeChatRawVerbose(messages) {
    const response = await chatModel.invoke(messages);
    return {
      content: normalizeMessageContent(response && response.content),
      raw: buildRawMessageSnapshot(response),
    };
  }

  async function* streamChat(messages) {
    const stream = streamChatWithRaw(messages);
    for await (const item of stream) {
      yield item.text;
    }
  }

  async function* streamChatWithRaw(messages) {
    const stream = await chatModel.stream(messages);
    for await (const chunk of stream) {
      const raw = buildRawMessageSnapshot(chunk);
      const text = normalizeMessageContent(raw.content);
      yield {
        text,
        raw,
      };
    }
  }

  async function* streamChatLegacy(messages) {
    const stream = await chatModel.stream(messages);
    for await (const chunk of stream) {
      if (chunk.content) {
        const content = normalizeMessageContent(chunk.content);
        yield content;
      }
    }
  }

  return {
    invokeChat,
    invokeChatRaw,
    invokeChatRawVerbose,
    streamChat,
    streamChatWithRaw,
    streamChatLegacy,
    getRuntimeInfo() {
      return {
        retry: { maxRetries: resolvedMaxRetries },
        modelClient: "langchain_chatopenai",
      };
    },
  };
}

module.exports = {
  createLangChainModelGateway,
};
