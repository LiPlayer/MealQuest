function createStrategyChatService(options = {}) {
  const {
    apiKey = "",
    modelName = "deepseek-chat",
    temperature = 0.2,
    timeoutMs = 45000,
    systemPrompt =
      "You are MealQuest's merchant operations copilot. Keep replies concise, practical, and action-oriented.",
    modelInstance = null,
    loadModel = null,
  } = options;

  let cachedModelPromise = null;

  function extractChunkText(content) {
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
        if (typeof part.content === "string") {
          return part.content;
        }
        return "";
      })
      .join("");
  }

  async function buildModel() {
    if (modelInstance) {
      return modelInstance;
    }
    if (typeof loadModel === "function") {
      return loadModel();
    }
    if (!apiKey) {
      return null;
    }
    const { ChatDeepSeek } = await import("@langchain/deepseek");
    return new ChatDeepSeek({
      apiKey,
      model: modelName,
      temperature,
      timeout: timeoutMs,
    });
  }

  async function getModel() {
    if (!cachedModelPromise) {
      cachedModelPromise = buildModel();
    }
    return cachedModelPromise;
  }

  async function* streamStrategyChatTurn(input = {}) {
    const merchantId = String(input.merchantId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const userMessage = String(input.userMessage || "").trim();
    if (!merchantId || !sessionId || !userMessage) {
      return {
        status: "AI_UNAVAILABLE",
        reason: "invalid_input",
      };
    }

    const model = await getModel();
    if (!model || typeof model.stream !== "function") {
      return {
        status: "AI_UNAVAILABLE",
        reason: "model_unavailable",
      };
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    yield { type: "START", runId };

    let fullText = "";
    let seq = 0;
    try {
      const stream = await model.stream([
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ]);

      for await (const chunk of stream) {
        const token = extractChunkText(chunk && chunk.content);
        if (!token) {
          continue;
        }
        seq += 1;
        fullText += token;
        yield {
          type: "TOKEN",
          runId,
          seq,
          text: token,
        };
      }

      yield { type: "END", runId };
      return {
        status: "CHAT_REPLY",
        assistantMessage: fullText.trim() || "我已收到。请补充更具体的目标、预算和时间窗口。",
        protocol: {
          name: "LANGCHAIN_CHAT",
          provider: "deepseek",
          streamMode: ["messages", "updates"],
        },
      };
    } catch (error) {
      return {
        status: "AI_UNAVAILABLE",
        reason: error && error.message ? String(error.message) : "model_stream_failed",
      };
    }
  }

  return {
    streamStrategyChatTurn,
  };
}

module.exports = {
  createStrategyChatService,
};
