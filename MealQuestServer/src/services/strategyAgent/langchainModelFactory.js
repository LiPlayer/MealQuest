const { ChatOpenAI } = require("@langchain/openai");
const { ChatDeepSeek } = require("@langchain/deepseek");
const { ChatZhipuAI } = require("@langchain/community/chat_models/zhipuai");

const DEFAULT_PROVIDER = "deepseek";
const PROVIDER_BINDINGS = {
  openai: {
    modelClient: "langchain_chat_openai",
    transport: "responses_api",
    structuredOutputMethod: "providerStrategy",
    createModel({
      model,
      apiKey,
      baseUrl,
      timeoutMs,
      maxRetries,
      temperature,
      maxTokens,
    }) {
      const options = {
        model,
        apiKey,
        timeout: timeoutMs,
        maxRetries,
        temperature,
        maxTokens,
        useResponsesApi: true,
      };
      const normalizedBaseUrl = asString(baseUrl).replace(/\/+$/, "");
      if (normalizedBaseUrl) {
        options.configuration = {
          baseURL: normalizedBaseUrl,
        };
      }
      return new ChatOpenAI(options);
    },
  },
  deepseek: {
    modelClient: "langchain_chat_deepseek",
    transport: "provider_sdk",
    structuredOutputMethod: "toolStrategy",
    createModel({
      model,
      apiKey,
      baseUrl,
      timeoutMs,
      maxRetries,
      temperature,
      maxTokens,
    }) {
      const options = {
        model,
        apiKey,
        timeout: timeoutMs,
        maxRetries,
        temperature,
        maxTokens,
      };
      const normalizedBaseUrl = asString(baseUrl).replace(/\/+$/, "");
      if (normalizedBaseUrl) {
        options.configuration = {
          baseURL: normalizedBaseUrl,
        };
      }
      return new ChatDeepSeek(options);
    },
  },
  zhipuai: {
    modelClient: "langchain_chat_zhipuai",
    transport: "provider_sdk",
    structuredOutputMethod: "toolStrategy",
    createModel({
      model,
      apiKey,
      timeoutMs,
      maxRetries,
      temperature,
      maxTokens,
    }) {
      return new ChatZhipuAI({
        model,
        zhipuAIApiKey: apiKey,
        timeout: timeoutMs,
        maxRetries,
        temperature,
        maxTokens,
      });
    },
  },
};
const SUPPORTED_PROVIDERS = new Set(Object.keys(PROVIDER_BINDINGS));

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) {
    return DEFAULT_PROVIDER;
  }
  if (SUPPORTED_PROVIDERS.has(normalized)) {
    return normalized;
  }
  return DEFAULT_PROVIDER;
}

function resolveProviderBinding(provider) {
  const normalized = normalizeProvider(provider);
  return {
    provider: normalized,
    binding: PROVIDER_BINDINGS[normalized],
  };
}

function createChatModel({
  provider,
  model,
  baseUrl,
  apiKey,
  timeoutMs,
  maxRetries,
  temperature = 0.2,
  maxTokens = 2048,
}) {
  const { binding, provider: normalizedProvider } = resolveProviderBinding(provider);
  return {
    provider: normalizedProvider,
    chatModel: binding.createModel({
      model,
      baseUrl,
      apiKey,
      timeoutMs,
      maxRetries,
      temperature,
      maxTokens,
    }),
    runtime: {
      modelClient: binding.modelClient,
      transport: binding.transport,
      structuredOutputMethod: binding.structuredOutputMethod,
    },
  };
}

module.exports = {
  createChatModel,
  normalizeProvider,
  resolveProviderBinding,
};

