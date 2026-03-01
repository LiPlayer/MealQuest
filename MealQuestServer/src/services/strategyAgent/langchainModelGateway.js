const { createLangChainAgentRuntime } = require("./langchainAgentRuntime");
const {
  createChatModel,
  normalizeProvider,
} = require("./langchainModelFactory");

function createLangChainModelGateway(options = {}) {
  const {
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    maxRetries,
  } = options;

  const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
    ? Math.max(0, Math.floor(Number(maxRetries)))
    : 2;
  const resolvedTimeoutMs = Number(timeoutMs) || 15000;
  const normalizedProvider = normalizeProvider(provider);
  const modelRuntime = createChatModel({
    provider: normalizedProvider,
    model,
    baseUrl,
    apiKey,
    timeoutMs: resolvedTimeoutMs,
    maxRetries: resolvedMaxRetries,
    temperature: 0.2,
    maxTokens: 2048,
  });
  const agentRuntime = createLangChainAgentRuntime({
    chatModel: modelRuntime.chatModel,
    structuredOutputMethod: modelRuntime.runtime.structuredOutputMethod,
  });

  return {
    invokeChatWithRaw: agentRuntime.invokeChatWithRaw,
    streamChatEvents(messages, streamOptions = {}) {
      return agentRuntime.streamChatEvents(messages, streamOptions);
    },
    getRuntimeInfo() {
      return {
        retry: { maxRetries: resolvedMaxRetries },
        modelClient: modelRuntime.runtime.modelClient,
        transport: modelRuntime.runtime.transport,
        structuredOutput: {
          defaultMethod: modelRuntime.runtime.structuredOutputMethod,
        },
        streaming: {
          mode: "langchain_create_agent_stream_events_v2",
        },
      };
    },
  };
}

module.exports = {
  createLangChainModelGateway,
};
