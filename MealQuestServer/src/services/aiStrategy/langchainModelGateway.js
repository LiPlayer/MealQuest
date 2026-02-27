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
    const response = await chatModel.invoke(messages);
    const rawContent = response && response.content;
    return normalizeMessageContent(rawContent);
  }

  async function* streamChat(messages) {
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
    streamChat,
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
