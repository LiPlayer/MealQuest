function createOmniAgentService(options = {}) {
  const {
    modelName = process.env.DEEPSEEK_MODEL || "deepseek-chat",
    temperature = 0.2,
    timeoutMs = 45000,
    systemPrompt =
      "You are MealQuest AI Digital Operations Officer. Be concise, practical, and execution-oriented.",
    modelInstance = null,
    loadModel = null,
    agentInstance = null,
    loadAgent = null,
  } = options;

  let cachedModelPromise = null;
  let cachedAgentPromise = null;

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
        if (typeof part.delta === "string") {
          return part.delta;
        }
        if (typeof part.output_text === "string") {
          return part.output_text;
        }
        if (part.kwargs && typeof part.kwargs === "object") {
          return extractTokenText(part.kwargs);
        }
        return "";
      })
      .join("");
  }

  function extractTokenText(chunk) {
    const messageChunk = Array.isArray(chunk) ? chunk[0] : chunk;
    if (!messageChunk) {
      return "";
    }
    if (typeof messageChunk === "string") {
      return messageChunk;
    }
    if (typeof messageChunk !== "object") {
      return "";
    }
    if (typeof messageChunk.text === "string") {
      return messageChunk.text;
    }
    if (typeof messageChunk.delta === "string") {
      return messageChunk.delta;
    }
    if (typeof messageChunk.content === "string") {
      return messageChunk.content;
    }
    if (Array.isArray(messageChunk.content)) {
      return extractChunkText(messageChunk.content);
    }
    if (Array.isArray(messageChunk.contentBlocks)) {
      return extractChunkText(messageChunk.contentBlocks);
    }
    if (messageChunk.kwargs && typeof messageChunk.kwargs === "object") {
      return extractTokenText(messageChunk.kwargs);
    }
    if (messageChunk.message && typeof messageChunk.message === "object") {
      return extractTokenText(messageChunk.message);
    }
    return "";
  }

  function extractModelText(output) {
    if (typeof output === "string") {
      return output;
    }
    if (!output || typeof output !== "object") {
      return "";
    }
    if (typeof output.text === "string") {
      return output.text;
    }
    if (typeof output.content === "string") {
      return output.content;
    }
    if (Array.isArray(output.content)) {
      return extractChunkText(output.content);
    }
    if (output.kwargs && typeof output.kwargs === "object") {
      return extractModelText(output.kwargs);
    }
    if (output.message && typeof output.message === "object") {
      return extractModelText(output.message);
    }
    return "";
  }

  async function buildModel() {
    if (modelInstance) {
      return modelInstance;
    }
    if (typeof loadModel === "function") {
      return loadModel();
    }
    const { ChatDeepSeek } = await import("@langchain/deepseek");
    return new ChatDeepSeek({
      model: modelName,
      temperature,
      timeout: timeoutMs,
      streaming: true,
    });
  }

  async function getModel() {
    if (!cachedModelPromise) {
      cachedModelPromise = buildModel();
    }
    return cachedModelPromise;
  }

  async function buildAgent() {
    if (agentInstance) {
      return agentInstance;
    }
    if (typeof loadAgent === "function") {
      return loadAgent();
    }
    const { createAgent } = await import("langchain");
    const model = await getModel();
    return createAgent({
      model,
      tools: [],
      systemPrompt,
    });
  }

  async function getAgent() {
    if (!cachedAgentPromise) {
      cachedAgentPromise = buildAgent();
    }
    return cachedAgentPromise;
  }

  function normalizeStreamMode(streamMode) {
    const source = Array.isArray(streamMode)
      ? streamMode
      : ["messages", "updates", "custom"];
    const deduped = [];
    for (const item of source) {
      const mode = String(item || "").trim();
      if (!mode || deduped.includes(mode)) {
        continue;
      }
      deduped.push(mode);
    }
    return deduped.length > 0 ? deduped : ["messages", "updates", "custom"];
  }

  async function* streamAgentTurn(input = {}) {
    const merchantId = String(input.merchantId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const userMessage = String(input.userMessage || "").trim();
    const streamMode = normalizeStreamMode(input.streamMode);
    if (!merchantId || !sessionId || !userMessage) {
      return {
        status: "AI_UNAVAILABLE",
        reason: "invalid_input",
      };
    }

    let agent = null;
    try {
      agent = await getAgent();
    } catch (error) {
      return {
        status: "AI_UNAVAILABLE",
        reason: error && error.message ? String(error.message) : "agent_init_failed",
      };
    }
    if (!agent || typeof agent.stream !== "function") {
      return {
        status: "AI_UNAVAILABLE",
        reason: "agent_unavailable",
      };
    }

    let fullText = "";
    try {
      const stream = await agent.stream(
        {
          messages: [
            {
              role: "user",
              content: userMessage,
            },
          ],
        },
        {
          streamMode,
          runName: "mq.agent.task.turn",
          tags: ["mealquest", "merchant", "agent-os"],
          metadata: {
            merchantId,
            sessionId,
            channel: "sse",
            streamMode,
          },
        }
      );

      for await (const chunk of stream) {
        if (!Array.isArray(chunk) || chunk.length < 2) {
          continue;
        }
        const mode = String(chunk[0] || "").trim();
        const payload = chunk[1];
        if (!mode) {
          continue;
        }
        const tokenText = mode === "messages" ? extractTokenText(payload) : "";
        if (tokenText) {
          fullText += tokenText;
        }
        yield {
          type: "STREAM_CHUNK",
          mode,
          chunk: payload,
          tokenText,
        };
      }

      return {
        status: "AGENT_REPLY",
        assistantMessage:
          fullText.trim() ||
          "Received. Please share more details about goals, budget, and timeline.",
        protocol: {
          name: "LANGCHAIN_AGENT_STREAM",
          provider: "deepseek",
          streamMode,
        },
      };
    } catch (error) {
      return {
        status: "AI_UNAVAILABLE",
        reason: error && error.message ? String(error.message) : "model_stream_failed",
      };
    }
  }

  async function summarizeSessionMemory(input = {}) {
    const merchantId = String(input.merchantId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const archiveText = String(input.archiveText || "").trim();
    const previousSummary = String(input.previousSummary || "").trim();
    if (!merchantId || !sessionId || !archiveText) {
      throw new Error("invalid memory compression input");
    }

    let model = null;
    try {
      model = await getModel();
    } catch (error) {
      throw new Error(
        error && error.message
          ? `deepseek model unavailable: ${String(error.message)}`
          : "deepseek model unavailable",
      );
    }
    if (!model || typeof model.invoke !== "function") {
      throw new Error("deepseek model unavailable");
    }

    const archiveSnippet = archiveText.slice(-20000);
    const previousSnippet = previousSummary.slice(-4000);
    const response = await model.invoke(
      [
        {
          role: "system",
          content:
            "You compress conversation memory for a merchant operations agent. Output concise plain text only.",
        },
        {
          role: "user",
          content: [
            `Merchant ID: ${merchantId}`,
            `Session ID: ${sessionId}`,
            "",
            "Task:",
            "- Merge previous summary and archived dialogue into one rolling memory summary.",
            "- Keep only durable facts: goals, constraints, decisions, commitments, risks, unresolved questions.",
            "- Remove duplicated or obsolete details.",
            "- Output max 12 bullet points.",
            "",
            "Previous summary:",
            previousSnippet || "(none)",
            "",
            "Archived dialogue:",
            archiveSnippet,
          ].join("\n"),
        },
      ],
      {
        runName: "mq.agent.memory.compress",
        tags: ["mealquest", "agent-os", "memory-compression"],
        metadata: {
          merchantId,
          sessionId,
          provider: "deepseek",
        },
      },
    );
    const summary = extractModelText(response).trim();
    if (!summary) {
      throw new Error("deepseek memory compression returned empty summary");
    }
    return summary;
  }

  return {
    streamAgentTurn,
    summarizeSessionMemory,
  };
}

module.exports = {
  createOmniAgentService,
};
