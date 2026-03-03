const DEFAULT_ASSISTANT_ID = "merchant-agent";
const MAX_THREAD_MESSAGES = 80;
const KEEP_THREAD_MESSAGES = 32;
const MAX_MEMORY_SUMMARY_CHARS = 4000;

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeContent(content) {
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
      return "";
    })
    .join("");
}

function extractLatestHumanText(input) {
  if (!input || typeof input !== "object") {
    return "";
  }
  if (typeof input.text === "string" && input.text.trim()) {
    return input.text.trim();
  }
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const item = messages[idx];
    if (!item || typeof item !== "object") {
      continue;
    }
    const role = String(item.type || item.role || "").trim().toLowerCase();
    if (role !== "human" && role !== "user") {
      continue;
    }
    const content = normalizeContent(item.content);
    if (content.trim()) {
      return content.trim();
    }
  }
  return "";
}

function extractTokenText(chunk) {
  const tuple = Array.isArray(chunk) ? chunk : [];
  const messageChunk = tuple.length > 0 ? tuple[0] : chunk;
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
  if (typeof messageChunk.output_text === "string") {
    return messageChunk.output_text;
  }
  if (Array.isArray(messageChunk.content)) {
    return normalizeContent(messageChunk.content);
  }
  if (Array.isArray(messageChunk.contentBlocks)) {
    return normalizeContent(messageChunk.contentBlocks);
  }
  if (messageChunk.kwargs && typeof messageChunk.kwargs === "object") {
    return extractTokenText(messageChunk.kwargs);
  }
  if (messageChunk.message && typeof messageChunk.message === "object") {
    return extractTokenText(messageChunk.message);
  }
  return "";
}

function normalizeStreamModes(source) {
  const raw = Array.isArray(source) ? source : [];
  const deduped = [];
  for (const item of raw) {
    const mode = String(item || "").trim();
    if (!mode || deduped.includes(mode)) {
      continue;
    }
    deduped.push(mode);
  }
  if (deduped.length === 0) {
    deduped.push("messages-tuple", "values", "updates", "custom");
  }
  if (!deduped.includes("values")) {
    deduped.push("values");
  }
  return deduped;
}

function ensureAgentServerBucket(db) {
  if (!db.agentServer || typeof db.agentServer !== "object") {
    db.agentServer = {};
  }
  const bucket = db.agentServer;
  if (!bucket.assistants || typeof bucket.assistants !== "object") {
    bucket.assistants = {};
  }
  if (!bucket.threads || typeof bucket.threads !== "object") {
    bucket.threads = {};
  }
  if (!bucket.threadByMerchant || typeof bucket.threadByMerchant !== "object") {
    bucket.threadByMerchant = {};
  }
  if (!bucket.runs || typeof bucket.runs !== "object") {
    bucket.runs = {};
  }

  const assistant = bucket.assistants[DEFAULT_ASSISTANT_ID];
  if (!assistant || typeof assistant !== "object") {
    const createdAt = nowIso();
    bucket.assistants[DEFAULT_ASSISTANT_ID] = {
      assistant_id: DEFAULT_ASSISTANT_ID,
      graph_id: "mealquest-merchant-chat",
      config: {},
      context: {},
      metadata: {},
      version: 1,
      name: "MealQuest Merchant Agent",
      description: "Merchant strategy and operations assistant.",
      created_at: createdAt,
      updated_at: createdAt,
    };
  }
  return bucket;
}

function buildCheckpoint(thread) {
  return {
    thread_id: thread.thread_id,
    checkpoint_ns: "",
    checkpoint_id: `cp_${Date.now()}`,
    checkpoint_map: null,
  };
}

function buildThreadState(thread) {
  const values = ensureThreadValues(thread);
  const interrupts = Array.isArray(values.__interrupt__) ? values.__interrupt__ : [];
  const hasInterrupt = interrupts.length > 0;
  return {
    values,
    next: hasInterrupt ? ["interrupt"] : [],
    checkpoint: buildCheckpoint(thread),
    metadata: thread.metadata || {},
    created_at: nowIso(),
    parent_checkpoint: null,
    tasks: hasInterrupt
      ? [
          {
            id: "task_interrupt",
            name: "interrupt",
            interrupts,
          },
        ]
      : [],
  };
}

function ensureThreadValues(thread) {
  if (!thread.values || typeof thread.values !== "object") {
    thread.values = {};
  }
  if (!Array.isArray(thread.messages)) {
    thread.messages = [];
  }
  if (!thread.values || typeof thread.values !== "object") {
    thread.values = {};
  }
  if (!Array.isArray(thread.values.messages)) {
    thread.values.messages = thread.messages;
  }
  if (!Array.isArray(thread.values.__interrupt__)) {
    thread.values.__interrupt__ = [];
  }
  thread.values.messages = thread.messages;
  thread.values.memory_summary = safeString(thread.memory_summary);
  return thread.values;
}

function compactThreadMemory(thread) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  if (messages.length <= MAX_THREAD_MESSAGES) {
    return;
  }
  const splitIndex = Math.max(0, messages.length - KEEP_THREAD_MESSAGES);
  const archived = messages.slice(0, splitIndex);
  const recent = messages.slice(splitIndex);
  const archiveText = archived
    .map((item) => {
      const role = item && item.type === "human" ? "USER" : "ASSISTANT";
      const text = safeString(item && item.content).trim();
      if (!text) {
        return "";
      }
      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
  if (archiveText) {
    const previous = safeString(thread.memory_summary);
    const merged = [previous, `[${nowIso()}]\n${archiveText}`].filter(Boolean).join("\n\n");
    thread.memory_summary = merged.slice(-MAX_MEMORY_SUMMARY_CHARS);
  }
  thread.messages = recent;
}

function buildAssistantInput(thread, userText) {
  const summary = safeString(thread.memory_summary).trim();
  if (!summary) {
    return userText;
  }
  return `Conversation summary:\n${summary}\n\nUser:\n${userText}`;
}

function createAgentServerService(db, { strategyChatService } = {}) {
  function listAssistants() {
    const bucket = ensureAgentServerBucket(db);
    return Object.values(bucket.assistants);
  }

  function getAssistant(assistantId) {
    const bucket = ensureAgentServerBucket(db);
    return bucket.assistants[String(assistantId || "").trim()] || null;
  }

  function getOrCreateThreadForMerchant({
    merchantId,
    threadId,
    metadata = {},
  }) {
    const bucket = ensureAgentServerBucket(db);
    const normalizedMerchantId = String(merchantId || "").trim();
    if (!normalizedMerchantId) {
      throw new Error("merchantId is required");
    }
    const mappedThreadId = safeString(bucket.threadByMerchant[normalizedMerchantId]).trim();
    if (mappedThreadId && bucket.threads[mappedThreadId]) {
      return bucket.threads[mappedThreadId];
    }

    const normalizedThreadId = String(threadId || "").trim() || `thread_${normalizedMerchantId}`;
    if (bucket.threads[normalizedThreadId]) {
      const existing = bucket.threads[normalizedThreadId];
      if (existing.merchant_id !== normalizedMerchantId) {
        throw new Error("thread scope denied");
      }
      bucket.threadByMerchant[normalizedMerchantId] = normalizedThreadId;
      return existing;
    }

    const createdAt = nowIso();
    const created = {
      thread_id: normalizedThreadId,
      merchant_id: normalizedMerchantId,
      created_at: createdAt,
      updated_at: createdAt,
      state_updated_at: createdAt,
      metadata: {
        merchantId: normalizedMerchantId,
        ...metadata,
      },
      status: "idle",
      values: {
        messages: [],
        __interrupt__: [],
        memory_summary: "",
      },
      interrupts: {},
      memory_summary: "",
      messages: [],
    };
    bucket.threads[normalizedThreadId] = created;
    bucket.threadByMerchant[normalizedMerchantId] = normalizedThreadId;
    db.save();
    return created;
  }

  function getThread({ merchantId, threadId }) {
    const bucket = ensureAgentServerBucket(db);
    const normalizedThreadId = String(threadId || "").trim();
    if (!normalizedThreadId) {
      return null;
    }
    const thread = bucket.threads[normalizedThreadId];
    if (!thread) {
      return null;
    }
    if (merchantId && thread.merchant_id !== merchantId) {
      return null;
    }
    return thread;
  }

  function copyThread({ merchantId, threadId }) {
    const source = getThread({ merchantId, threadId });
    if (!source) {
      throw new Error("thread not found");
    }
    const copiedId = `${source.thread_id}_copy_${Math.random().toString(36).slice(2, 8)}`;
    const copied = {
      ...JSON.parse(JSON.stringify(source)),
      thread_id: copiedId,
      created_at: nowIso(),
      updated_at: nowIso(),
      state_updated_at: nowIso(),
      status: "idle",
      metadata: {
        ...(source.metadata || {}),
        copiedFrom: source.thread_id,
      },
    };
    const bucket = ensureAgentServerBucket(db);
    bucket.threads[copiedId] = copied;
    db.save();
    return copied;
  }

  function appendThreadMessage(thread, message) {
    if (!Array.isArray(thread.messages)) {
      thread.messages = [];
    }
    thread.messages.push(message);
    compactThreadMemory(thread);
    ensureThreadValues(thread);
    thread.updated_at = nowIso();
    thread.state_updated_at = thread.updated_at;
  }

  function createRunRecord({
    thread,
    assistantId,
    metadata = {},
    multitaskStrategy = null,
  }) {
    const bucket = ensureAgentServerBucket(db);
    const runId = randomId("run");
    const createdAt = nowIso();
    const run = {
      run_id: runId,
      thread_id: thread.thread_id,
      assistant_id: String(assistantId || DEFAULT_ASSISTANT_ID),
      merchant_id: thread.merchant_id,
      created_at: createdAt,
      updated_at: createdAt,
      status: "pending",
      metadata: metadata || {},
      multitask_strategy: multitaskStrategy,
    };
    bucket.runs[runId] = run;
    return run;
  }

  function updateRunStatus(run, status) {
    run.status = status;
    run.updated_at = nowIso();
  }

  function listRunsForThread({ merchantId, threadId }) {
    const bucket = ensureAgentServerBucket(db);
    return Object.values(bucket.runs).filter(
      (item) =>
        item &&
        item.thread_id === threadId &&
        (!merchantId || item.merchant_id === merchantId),
    );
  }

  function getRun({ merchantId, threadId, runId }) {
    const bucket = ensureAgentServerBucket(db);
    const run = bucket.runs[String(runId || "").trim()];
    if (!run) {
      return null;
    }
    if (threadId && run.thread_id !== threadId) {
      return null;
    }
    if (merchantId && run.merchant_id !== merchantId) {
      return null;
    }
    return run;
  }

  function cancelRun({ merchantId, threadId, runId }) {
    const run = getRun({ merchantId, threadId, runId });
    if (!run) {
      throw new Error("run not found");
    }
    if (run.status !== "pending" && run.status !== "running") {
      return run;
    }
    updateRunStatus(run, "interrupted");
    db.save();
    return run;
  }

  async function runWithStream({
    merchantId,
    threadId,
    assistantId = DEFAULT_ASSISTANT_ID,
    payload = {},
    onRunCreated,
    onEvent,
  }) {
    const streamModes = normalizeStreamModes(payload && payload.stream_mode);
    const thread = getOrCreateThreadForMerchant({
      merchantId,
      threadId,
      metadata: payload && payload.metadata,
    });
    const run = createRunRecord({
      thread,
      assistantId,
      metadata: (payload && payload.metadata) || {},
      multitaskStrategy: (payload && payload.multitask_strategy) || null,
    });
    updateRunStatus(run, "running");
    if (typeof onRunCreated === "function") {
      onRunCreated({ run, thread });
    }
    ensureThreadValues(thread);
    const emitValues = () => {
      ensureThreadValues(thread);
      if (typeof onEvent === "function" && streamModes.includes("values")) {
        onEvent("values", thread.values);
      }
    };

    const command =
      payload && payload.command && typeof payload.command === "object"
        ? payload.command
        : null;
    const resume =
      command && command.resume && typeof command.resume === "object"
        ? command.resume
        : null;
    if (resume) {
      updateRunStatus(run, "error");
      db.save();
      throw new Error("resume command is not supported in chat-only mode");
    }

    const input = payload && payload.input ? payload.input : {};
    const userText = extractLatestHumanText(input);
    if (!userText) {
      updateRunStatus(run, "error");
      db.save();
      throw new Error("input.messages with latest human text is required");
    }

    const userMessage = {
      id: randomId("msg_human"),
      type: "human",
      content: userText,
    };
    appendThreadMessage(thread, userMessage);
    emitValues();

    const aiMessageId = randomId("msg_ai");
    let aiMessage = null;
    let aiText = "";

    if (!strategyChatService || typeof strategyChatService.streamStrategyChatTurn !== "function") {
      aiText = "AI is temporarily unavailable. Please retry in a moment.";
      aiMessage = {
        id: aiMessageId,
        type: "ai",
        content: aiText,
      };
      appendThreadMessage(thread, aiMessage);
      updateRunStatus(run, "error");
      db.save();
      if (typeof onEvent === "function") {
        onEvent("values", thread.values);
      }
      return {
        run,
        thread,
      };
    }

    const agentInput = {
      merchantId,
      sessionId: thread.thread_id,
      userMessage: buildAssistantInput(thread, userText),
      streamMode: ["messages", "updates", "custom"],
    };
    try {
      const generator = strategyChatService.streamStrategyChatTurn(agentInput);
      let next = await generator.next();
      while (!next.done) {
        if (run.status === "interrupted") {
          if (typeof generator.return === "function") {
            await generator.return(undefined);
          }
          break;
        }
        const item = next.value;
        const mode = String(item && item.mode ? item.mode : "").trim();
        if (mode === "messages") {
          const token = safeString(item && item.tokenText) || extractTokenText(item && item.chunk);
          if (token) {
            aiText += token;
            if (!aiMessage) {
              aiMessage = {
                id: aiMessageId,
                type: "ai",
                content: "",
              };
              appendThreadMessage(thread, aiMessage);
            }
            aiMessage.content = aiText;
            ensureThreadValues(thread);
            thread.updated_at = nowIso();
            thread.state_updated_at = thread.updated_at;
            if (typeof onEvent === "function") {
              if (streamModes.includes("messages-tuple")) {
                onEvent("messages", [
                  {
                    id: aiMessageId,
                    type: "AIMessageChunk",
                    content: token,
                  },
                  {
                    langgraph_checkpoint_ns: "",
                  },
                ]);
              }
              if (streamModes.includes("values")) {
                emitValues();
              }
            }
          }
        } else if (typeof onEvent === "function") {
          if (mode === "custom" && streamModes.includes("custom")) {
            onEvent("custom", item && item.chunk ? item.chunk : {});
          }
          if (mode === "updates" && streamModes.includes("updates")) {
            onEvent("updates", item && item.chunk ? item.chunk : {});
          }
        }
        next = await generator.next();
      }

      if (run.status === "interrupted") {
        ensureThreadValues(thread);
        thread.updated_at = nowIso();
        thread.state_updated_at = thread.updated_at;
        db.save();
        emitValues();
        return {
          run,
          thread,
        };
      }

      const finalResult = next.value || {};
      const finalAssistantText = safeString(finalResult.assistantMessage).trim();
      if (!aiMessage) {
        aiMessage = {
          id: aiMessageId,
          type: "ai",
          content: finalAssistantText || "Received.",
        };
        appendThreadMessage(thread, aiMessage);
      } else if (!safeString(aiMessage.content).trim()) {
        aiMessage.content = finalAssistantText || "Received.";
      }
      ensureThreadValues(thread);
      thread.interrupts = {};
      thread.updated_at = nowIso();
      thread.state_updated_at = thread.updated_at;
      if (run.status === "interrupted") {
        db.save();
        emitValues();
        return {
          run,
          thread,
        };
      }
      updateRunStatus(run, "success");
      db.save();
      emitValues();
    } catch (error) {
      updateRunStatus(run, "error");
      if (!aiMessage) {
        const message = error && error.message ? String(error.message) : "stream failed";
        aiMessage = {
          id: aiMessageId,
          type: "ai",
          content: `Error: ${message}`,
        };
        appendThreadMessage(thread, aiMessage);
      }
      db.save();
      throw error;
    }

    return {
      run,
      thread,
    };
  }

  async function runAndWait({
    merchantId,
    threadId,
    assistantId,
    payload,
  }) {
    const result = await runWithStream({
      merchantId,
      threadId,
      assistantId,
      payload,
      onRunCreated: null,
      onEvent: null,
    });
    return {
      run: result.run,
      state: buildThreadState(result.thread),
    };
  }

  return {
    DEFAULT_ASSISTANT_ID,
    listAssistants,
    getAssistant,
    getOrCreateThreadForMerchant,
    getThread,
    copyThread,
    getThreadState: buildThreadState,
    listRunsForThread,
    getRun,
    cancelRun,
    runWithStream,
    runAndWait,
  };
}

module.exports = {
  createAgentServerService,
};
