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

function normalizeToolCallArgs(rawArgs) {
  if (typeof rawArgs === "string") {
    return rawArgs.trim();
  }
  if (rawArgs && typeof rawArgs === "object") {
    return JSON.stringify(rawArgs);
  }
  return "";
}

function toResponsesTools(tools) {
  const safeTools = Array.isArray(tools) ? tools : [];
  return safeTools.map((tool) => {
    if (!tool || typeof tool !== "object") {
      return tool;
    }
    if (tool.type === "function" && tool.function && typeof tool.function === "object") {
      return {
        type: "function",
        function: {
          name: asString(tool.function.name),
          description: asString(tool.function.description),
          parameters:
            tool.function.parameters && typeof tool.function.parameters === "object"
              ? tool.function.parameters
              : { type: "object" },
          strict: tool.function.strict === true,
        },
      };
    }
    return tool;
  });
}

function toToolChoice(toolChoice) {
  if (typeof toolChoice === "string") {
    return toolChoice;
  }
  if (!toolChoice || typeof toolChoice !== "object") {
    return toolChoice;
  }
  if (toolChoice.type === "function") {
    const directName = asString(toolChoice.name);
    const nestedName = asString(toolChoice.function && toolChoice.function.name);
    const name = directName || nestedName;
    if (name) {
      return {
        type: "function",
        function: { name },
      };
    }
  }
  return toolChoice;
}

function toLangChainCallOptions(invokeOptions = {}) {
  const next = {};
  if (
    invokeOptions.responseFormat &&
    typeof invokeOptions.responseFormat === "object" &&
    invokeOptions.responseFormat.type === "json_schema" &&
    invokeOptions.responseFormat.json_schema &&
    typeof invokeOptions.responseFormat.json_schema === "object"
  ) {
    const schemaSpec = invokeOptions.responseFormat.json_schema;
    next.response_format = {
      type: "json_schema",
      json_schema: {
        name: asString(schemaSpec.name) || "structured_output",
        schema:
          schemaSpec.schema && typeof schemaSpec.schema === "object"
            ? schemaSpec.schema
            : { type: "object" },
        strict: schemaSpec.strict === true,
      },
    };
  }
  if (Array.isArray(invokeOptions.tools) && invokeOptions.tools.length > 0) {
    next.tools = toResponsesTools(invokeOptions.tools);
    if (next.tools.some((tool) => Boolean(tool && tool.function && tool.function.strict === true))) {
      next.strict = true;
    }
  }
  if (invokeOptions.toolChoice !== undefined && invokeOptions.toolChoice !== null) {
    next.tool_choice = toToolChoice(invokeOptions.toolChoice);
  }
  return next;
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
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length > 0) {
    const args = normalizeToolCallArgs((toolCalls[0] || {}).args);
    if (args) {
      return args;
    }
  }
  const rawToolCalls =
    message.additional_kwargs &&
    Array.isArray(message.additional_kwargs.tool_calls)
      ? message.additional_kwargs.tool_calls
      : [];
  if (rawToolCalls.length > 0) {
    const first = rawToolCalls[0] || {};
    const args = normalizeToolCallArgs(
      first.args ||
      (first.function && first.function.arguments)
    );
    if (args) {
      return args;
    }
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

  const modelKwargs = {};
  if (provider === "bigmodel") {
    modelKwargs.reasoning = { effort: "low" };
  }

  const chatModel = new ChatOpenAI({
    model,
    apiKey,
    timeout: resolvedTimeoutMs,
    maxRetries: resolvedMaxRetries,
    temperature: 0.2,
    maxTokens: 2048,
    useResponsesApi: true,
    configuration: {
      baseURL: asString(baseUrl).replace(/\/+$/, ""),
    },
    modelKwargs,
  });

  async function invokeJsonWithRaw(messages, invokeOptions = {}) {
    const callOptions = toLangChainCallOptions(invokeOptions);
    const response = await chatModel.invoke(messages, callOptions);
    const rawText = extractRawTextFromAiMessage(response);
    return {
      rawText,
      parsed: parseJsonStrict(rawText),
    };
  }

  async function invokeJson(messages, invokeOptions = {}) {
    const { parsed } = await invokeJsonWithRaw(messages, invokeOptions);
    return parsed;
  }

  function invokeChat(messages, invokeOptions) {
    return invokeJson(messages, invokeOptions);
  }

  function invokeChatWithRaw(messages, invokeOptions) {
    return invokeJsonWithRaw(messages, invokeOptions);
  }

  async function* streamChatWithRaw(messages) {
    const stream = await chatModel.stream(messages);
    for await (const chunk of stream) {
      const text = normalizeMessageContent(chunk && chunk.content);
      yield {
        text,
        raw: chunk,
      };
    }
  }

  return {
    invokeChat,
    invokeChatWithRaw,
    streamChatWithRaw,
    getRuntimeInfo() {
      return {
        retry: { maxRetries: resolvedMaxRetries },
        modelClient: "langchain_chatopenai_responses",
      };
    },
  };
}

module.exports = {
  createLangChainModelGateway,
};
