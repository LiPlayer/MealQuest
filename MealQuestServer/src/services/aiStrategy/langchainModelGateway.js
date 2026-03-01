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

function createLangChainModelGateway(options = {}) {
  const {
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    maxRetries,
    parseJsonStrict,
  } = options;
  if (typeof parseJsonStrict !== "function") {
    throw new Error("langchain model gateway requires parseJsonStrict");
  }

  const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
    ? Math.max(0, Math.floor(Number(maxRetries)))
    : 2;
  const resolvedTimeoutMs = Number(timeoutMs) || 15000;
  const normalizedProvider = asString(provider).toLowerCase();
  const resolvedUseResponsesApi = normalizedProvider === "openai";
  const defaultStructuredOutputMethod =
    normalizedProvider === "deepseek" ? "jsonMode" : "jsonSchema";

  const chatModel = new ChatOpenAI({
    model,
    apiKey,
    timeout: resolvedTimeoutMs,
    maxRetries: resolvedMaxRetries,
    temperature: 0.2,
    maxTokens: 2048,
    useResponsesApi: resolvedUseResponsesApi,
    configuration: {
      baseURL: asString(baseUrl).replace(/\/+$/, ""),
    },
  });

  async function invokeJsonWithRaw(messages, invokeOptions = {}) {
    if (
      invokeOptions &&
      typeof invokeOptions === "object" &&
      invokeOptions.structuredOutput &&
      typeof invokeOptions.structuredOutput === "object"
    ) {
      const structured = invokeOptions.structuredOutput;
      const schema =
        structured.schema && typeof structured.schema === "object"
          ? structured.schema
          : { type: "object" };
      const structuredConfig = {
        name: asString(structured.name) || "structured_output",
        method: defaultStructuredOutputMethod,
        includeRaw: true,
      };
      if (
        structured.strict !== undefined &&
        defaultStructuredOutputMethod !== "jsonMode"
      ) {
        structuredConfig.strict = Boolean(structured.strict);
      }
      const structuredModel = chatModel.withStructuredOutput(schema, structuredConfig);
      const result = await structuredModel.invoke(messages);
      const hasParsedContainer =
        result &&
        typeof result === "object" &&
        Object.prototype.hasOwnProperty.call(result, "parsed");
      const parsedValue = hasParsedContainer ? result.parsed : result;
      const rawText = hasParsedContainer
        ? extractRawTextFromAiMessage(result.raw) || coerceRawText(parsedValue)
        : coerceRawText(parsedValue);
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
    const response = await chatModel.invoke(messages);
    const rawText = extractRawTextFromAiMessage(response);
    return {
      rawText,
      parsed: parseJsonStrict(rawText),
    };
  }

  function invokeChatWithRaw(messages, invokeOptions) {
    return invokeJsonWithRaw(messages, invokeOptions);
  }

  async function* streamChatEvents(messages) {
    const runStartAt = new Date().toISOString();
    let emittedStart = false;
    try {
      const eventStream = await chatModel.streamEvents(messages, {
        version: "v2",
      });
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
    } catch (error) {
      void error;
      yield {
        type: "start",
        at: runStartAt,
        runId: "",
        raw: null,
      };
      const stream = await chatModel.stream(messages);
      for await (const chunk of stream) {
        const text = normalizeMessageContent(chunk && chunk.content);
        if (!text) {
          continue;
        }
        yield {
          type: "token",
          text,
          raw: chunk,
        };
      }
      yield {
        type: "end",
        at: new Date().toISOString(),
        runId: "",
        raw: null,
      };
    }
  }

  return {
    invokeChatWithRaw,
    streamChatEvents,
    getRuntimeInfo() {
      return {
        retry: { maxRetries: resolvedMaxRetries },
        modelClient: resolvedUseResponsesApi
          ? "langchain_chatopenai_responses"
          : "langchain_chatopenai_chat_completions",
        transport: resolvedUseResponsesApi ? "responses_api" : "chat_completions",
        structuredOutput: {
          defaultMethod: defaultStructuredOutputMethod,
        },
        streaming: {
          mode: "langchain_stream_events_v2",
        },
      };
    },
  };
}

module.exports = {
  createLangChainModelGateway,
};
