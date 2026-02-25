const { ChatOpenAI } = require("@langchain/openai");
const {
  createCircuitBreaker,
  isRetriableError,
  runWithRetry,
} = require("./resilience");

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
    retryBackoffMs,
    circuitFailureThreshold,
    circuitCooldownMs,
    queue,
    parseJsonLoose,
  } = options;
  if (!queue || typeof queue.run !== "function") {
    throw new Error("langchain model gateway requires a queue with run(task)");
  }
  if (typeof parseJsonLoose !== "function") {
    throw new Error("langchain model gateway requires parseJsonLoose");
  }

  const sharedOptions = {
    model,
    apiKey,
    timeout: Number(timeoutMs) || 15000,
    maxRetries: 0,
    configuration: {
      baseURL: asString(baseUrl).replace(/\/+$/, ""),
    },
    modelKwargs: provider === "bigmodel" ? { thinking: { type: "disabled" } } : {},
  };
  const plannerModel = new ChatOpenAI({
    ...sharedOptions,
    temperature: 0.2,
    maxTokens: 512,
  });
  const chatModel = new ChatOpenAI({
    ...sharedOptions,
    temperature: 0.2,
    maxTokens: 768,
  });
  const circuitBreaker = createCircuitBreaker({
    failureThreshold: circuitFailureThreshold,
    cooldownMs: circuitCooldownMs,
  });

  async function invokeJson(messages, modelClient) {
    return queue.run(() =>
      runWithRetry(
        async () => {
          circuitBreaker.throwIfOpen();
          try {
            const response = await modelClient.invoke(messages);
            const rawContent = response && response.content;
            const content = normalizeMessageContent(rawContent);
            const parsed = parseJsonLoose(content);
            circuitBreaker.recordSuccess();
            return parsed;
          } catch (error) {
            circuitBreaker.recordFailure(error);
            throw error;
          }
        },
        {
          maxAttempts: maxRetries,
          backoffMs: retryBackoffMs,
          shouldRetry: (error) => isRetriableError(error),
        },
      ),
    );
  }

  function invokePlanner(messages) {
    return invokeJson(messages, plannerModel);
  }

  function invokeChat(messages) {
    return invokeJson(messages, chatModel);
  }

  return {
    invokePlanner,
    invokeChat,
    getRuntimeInfo() {
      return {
        circuitBreaker: circuitBreaker.snapshot(),
        retry: {
          maxAttempts: Number(maxRetries) || 2,
          backoffMs: Number(retryBackoffMs) || 180,
        },
      };
    },
  };
}

module.exports = {
  createLangChainModelGateway,
};
