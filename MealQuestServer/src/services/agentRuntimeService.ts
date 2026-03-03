const DEFAULT_AGENT_ID = "merchant-omni-agent";
const MAX_SESSION_MESSAGES = 80;
const KEEP_SESSION_MESSAGES = 32;
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

function migrateLegacyBucket(bucket) {
  if (bucket.assistants && !bucket.agents) {
    bucket.agents = bucket.assistants;
  }
  if (bucket.threads && !bucket.sessions) {
    bucket.sessions = bucket.threads;
  }
  if (bucket.threadByMerchant && !bucket.sessionByMerchant) {
    bucket.sessionByMerchant = bucket.threadByMerchant;
  }
  if (bucket.runs && !bucket.tasks) {
    bucket.tasks = bucket.runs;
  }

  if (bucket.agents && typeof bucket.agents === "object") {
    for (const item of Object.values(bucket.agents)) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (!item.agent_id && item.assistant_id) {
        item.agent_id = item.assistant_id;
      }
      if (!item.workflow_id && item.graph_id) {
        item.workflow_id = item.graph_id;
      }
    }
  }

  if (bucket.sessions && typeof bucket.sessions === "object") {
    for (const item of Object.values(bucket.sessions)) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (!item.session_id && item.thread_id) {
        item.session_id = item.thread_id;
      }
    }
  }

  if (bucket.tasks && typeof bucket.tasks === "object") {
    for (const item of Object.values(bucket.tasks)) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (!item.task_id && item.run_id) {
        item.task_id = item.run_id;
      }
      if (!item.session_id && item.thread_id) {
        item.session_id = item.thread_id;
      }
      if (!item.agent_id && item.assistant_id) {
        item.agent_id = item.assistant_id;
      }
    }
  }
}

function ensureAgentRuntimeBucket(db) {
  if (!db.agentRuntime || typeof db.agentRuntime !== "object") {
    db.agentRuntime =
      db.agentServer && typeof db.agentServer === "object" ? db.agentServer : {};
  }
  const bucket = db.agentRuntime;
  migrateLegacyBucket(bucket);

  if (!bucket.agents || typeof bucket.agents !== "object") {
    bucket.agents = {};
  }
  if (!bucket.sessions || typeof bucket.sessions !== "object") {
    bucket.sessions = {};
  }
  if (!bucket.sessionByMerchant || typeof bucket.sessionByMerchant !== "object") {
    bucket.sessionByMerchant = {};
  }
  if (!bucket.tasks || typeof bucket.tasks !== "object") {
    bucket.tasks = {};
  }

  const agent = bucket.agents[DEFAULT_AGENT_ID];
  if (!agent || typeof agent !== "object") {
    const createdAt = nowIso();
    bucket.agents[DEFAULT_AGENT_ID] = {
      agent_id: DEFAULT_AGENT_ID,
      workflow_id: "mealquest-merchant-omni-agent",
      config: {},
      context: {},
      metadata: {},
      version: 1,
      name: "MealQuest AI Digital Operations Officer",
      description: "Omnipotent merchant operations agent for strategy and execution.",
      created_at: createdAt,
      updated_at: createdAt,
    };
  }
  return bucket;
}

function buildCheckpoint(session) {
  return {
    session_id: session.session_id,
    checkpoint_ns: "",
    checkpoint_id: `cp_${Date.now()}`,
    checkpoint_map: null,
  };
}

function ensureSessionValues(session) {
  if (!session.values || typeof session.values !== "object") {
    session.values = {};
  }
  if (!Array.isArray(session.messages)) {
    session.messages = [];
  }
  if (!Array.isArray(session.values.messages)) {
    session.values.messages = session.messages;
  }
  if (!Array.isArray(session.values.__interrupt__)) {
    session.values.__interrupt__ = [];
  }
  session.values.messages = session.messages;
  session.values.memory_summary = safeString(session.memory_summary);
  return session.values;
}

function buildSessionState(session) {
  const values = ensureSessionValues(session);
  const interrupts = Array.isArray(values.__interrupt__) ? values.__interrupt__ : [];
  const hasInterrupt = interrupts.length > 0;
  return {
    values,
    next: hasInterrupt ? ["interrupt"] : [],
    checkpoint: buildCheckpoint(session),
    metadata: session.metadata || {},
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

function compactSessionMemory(session) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  if (messages.length <= MAX_SESSION_MESSAGES) {
    return;
  }
  const splitIndex = Math.max(0, messages.length - KEEP_SESSION_MESSAGES);
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
    const previous = safeString(session.memory_summary);
    const merged = [previous, `[${nowIso()}]\n${archiveText}`]
      .filter(Boolean)
      .join("\n\n");
    session.memory_summary = merged.slice(-MAX_MEMORY_SUMMARY_CHARS);
  }
  session.messages = recent;
}

function buildAgentInput(session, userText) {
  const summary = safeString(session.memory_summary).trim();
  if (!summary) {
    return userText;
  }
  return `Conversation summary:\n${summary}\n\nUser:\n${userText}`;
}

function createAgentRuntimeService(db, { omniAgentService } = {}) {
  function listAgents() {
    const bucket = ensureAgentRuntimeBucket(db);
    return Object.values(bucket.agents);
  }

  function getAgent(agentId) {
    const bucket = ensureAgentRuntimeBucket(db);
    return bucket.agents[String(agentId || "").trim()] || null;
  }

  function getOrCreateSessionForMerchant({
    merchantId,
    sessionId,
    metadata = {},
  }) {
    const bucket = ensureAgentRuntimeBucket(db);
    const normalizedMerchantId = String(merchantId || "").trim();
    if (!normalizedMerchantId) {
      throw new Error("merchantId is required");
    }

    const mappedSessionId = safeString(bucket.sessionByMerchant[normalizedMerchantId]).trim();
    if (mappedSessionId && bucket.sessions[mappedSessionId]) {
      return bucket.sessions[mappedSessionId];
    }

    const normalizedSessionId =
      String(sessionId || "").trim() || `session_${normalizedMerchantId}`;
    if (bucket.sessions[normalizedSessionId]) {
      const existing = bucket.sessions[normalizedSessionId];
      if (existing.merchant_id !== normalizedMerchantId) {
        throw new Error("session scope denied");
      }
      bucket.sessionByMerchant[normalizedMerchantId] = normalizedSessionId;
      return existing;
    }

    const createdAt = nowIso();
    const created = {
      session_id: normalizedSessionId,
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
    bucket.sessions[normalizedSessionId] = created;
    bucket.sessionByMerchant[normalizedMerchantId] = normalizedSessionId;
    db.save();
    return created;
  }

  function getSession({ merchantId, sessionId }) {
    const bucket = ensureAgentRuntimeBucket(db);
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return null;
    }
    const session = bucket.sessions[normalizedSessionId];
    if (!session) {
      return null;
    }
    if (merchantId && session.merchant_id !== merchantId) {
      return null;
    }
    return session;
  }

  function copySession({ merchantId, sessionId }) {
    const source = getSession({ merchantId, sessionId });
    if (!source) {
      throw new Error("session not found");
    }
    const copiedId = `${source.session_id}_copy_${Math.random().toString(36).slice(2, 8)}`;
    const copied = {
      ...JSON.parse(JSON.stringify(source)),
      session_id: copiedId,
      created_at: nowIso(),
      updated_at: nowIso(),
      state_updated_at: nowIso(),
      status: "idle",
      metadata: {
        ...(source.metadata || {}),
        copiedFrom: source.session_id,
      },
    };
    const bucket = ensureAgentRuntimeBucket(db);
    bucket.sessions[copiedId] = copied;
    db.save();
    return copied;
  }

  function appendSessionMessage(session, message) {
    if (!Array.isArray(session.messages)) {
      session.messages = [];
    }
    session.messages.push(message);
    compactSessionMemory(session);
    ensureSessionValues(session);
    session.updated_at = nowIso();
    session.state_updated_at = session.updated_at;
  }

  function createTaskRecord({
    session,
    agentId,
    metadata = {},
    multitaskStrategy = null,
  }) {
    const bucket = ensureAgentRuntimeBucket(db);
    const taskId = randomId("task");
    const createdAt = nowIso();
    const task = {
      task_id: taskId,
      session_id: session.session_id,
      agent_id: String(agentId || DEFAULT_AGENT_ID),
      merchant_id: session.merchant_id,
      created_at: createdAt,
      updated_at: createdAt,
      status: "pending",
      metadata: metadata || {},
      multitask_strategy: multitaskStrategy,
    };
    bucket.tasks[taskId] = task;
    return task;
  }

  function updateTaskStatus(task, status) {
    task.status = status;
    task.updated_at = nowIso();
  }

  function listTasksForSession({ merchantId, sessionId }) {
    const bucket = ensureAgentRuntimeBucket(db);
    return Object.values(bucket.tasks).filter(
      (item) =>
        item && item.session_id === sessionId && (!merchantId || item.merchant_id === merchantId),
    );
  }

  function getTask({ merchantId, sessionId, taskId }) {
    const bucket = ensureAgentRuntimeBucket(db);
    const task = bucket.tasks[String(taskId || "").trim()];
    if (!task) {
      return null;
    }
    if (sessionId && task.session_id !== sessionId) {
      return null;
    }
    if (merchantId && task.merchant_id !== merchantId) {
      return null;
    }
    return task;
  }

  function cancelTask({ merchantId, sessionId, taskId }) {
    const task = getTask({ merchantId, sessionId, taskId });
    if (!task) {
      throw new Error("task not found");
    }
    if (task.status !== "pending" && task.status !== "running") {
      return task;
    }
    updateTaskStatus(task, "interrupted");
    db.save();
    return task;
  }

  async function runWithStream({
    merchantId,
    sessionId,
    agentId = DEFAULT_AGENT_ID,
    payload = {},
    onTaskCreated,
    onEvent,
  }) {
    const streamModes = normalizeStreamModes(
      (payload && payload.stream_mode) || (payload && payload.streamMode),
    );
    const session = getOrCreateSessionForMerchant({
      merchantId,
      sessionId,
      metadata: (payload && payload.metadata) || {},
    });
    const task = createTaskRecord({
      session,
      agentId,
      metadata: (payload && payload.metadata) || {},
      multitaskStrategy:
        (payload && payload.multitask_strategy) || (payload && payload.multitaskStrategy) || null,
    });
    updateTaskStatus(task, "running");
    if (typeof onTaskCreated === "function") {
      onTaskCreated({ task, session });
    }

    ensureSessionValues(session);
    const emitValues = () => {
      ensureSessionValues(session);
      if (typeof onEvent === "function" && streamModes.includes("values")) {
        onEvent("values", session.values);
      }
    };

    const command =
      payload && payload.command && typeof payload.command === "object" ? payload.command : null;
    const resume =
      command && command.resume && typeof command.resume === "object" ? command.resume : null;
    if (resume) {
      updateTaskStatus(task, "error");
      db.save();
      throw new Error("resume command is not supported in current agent runtime");
    }

    const input = payload && payload.input ? payload.input : {};
    const userText = extractLatestHumanText(input);
    if (!userText) {
      updateTaskStatus(task, "error");
      db.save();
      throw new Error("input.messages with latest human text is required");
    }

    const userMessage = {
      id: randomId("msg_human"),
      type: "human",
      content: userText,
    };
    appendSessionMessage(session, userMessage);
    emitValues();

    const aiMessageId = randomId("msg_ai");
    let aiMessage = null;
    let aiText = "";

    if (!omniAgentService || typeof omniAgentService.streamAgentTurn !== "function") {
      aiText = "AI Digital Operations Officer is temporarily unavailable. Please retry.";
      aiMessage = {
        id: aiMessageId,
        type: "ai",
        content: aiText,
      };
      appendSessionMessage(session, aiMessage);
      updateTaskStatus(task, "error");
      db.save();
      emitValues();
      return {
        task,
        session,
      };
    }

    const agentInput = {
      merchantId,
      sessionId: session.session_id,
      userMessage: buildAgentInput(session, userText),
      streamMode: ["messages", "updates", "custom"],
    };

    try {
      const generator = omniAgentService.streamAgentTurn(agentInput);
      let next = await generator.next();
      while (!next.done) {
        if (task.status === "interrupted") {
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
              appendSessionMessage(session, aiMessage);
            }
            aiMessage.content = aiText;
            ensureSessionValues(session);
            session.updated_at = nowIso();
            session.state_updated_at = session.updated_at;
            if (typeof onEvent === "function") {
              if (streamModes.includes("messages-tuple")) {
                onEvent("messages", [
                  {
                    id: aiMessageId,
                    type: "AIMessageChunk",
                    content: token,
                  },
                  {
                    checkpoint_ns: "",
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
            onEvent("custom", (item && item.chunk) || {});
          }
          if (mode === "updates" && streamModes.includes("updates")) {
            onEvent("updates", (item && item.chunk) || {});
          }
        }
        next = await generator.next();
      }

      if (task.status === "interrupted") {
        ensureSessionValues(session);
        session.updated_at = nowIso();
        session.state_updated_at = session.updated_at;
        db.save();
        emitValues();
        return {
          task,
          session,
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
        appendSessionMessage(session, aiMessage);
      } else if (!safeString(aiMessage.content).trim()) {
        aiMessage.content = finalAssistantText || "Received.";
      }

      ensureSessionValues(session);
      session.interrupts = {};
      session.updated_at = nowIso();
      session.state_updated_at = session.updated_at;

      updateTaskStatus(task, "success");
      db.save();
      emitValues();
    } catch (error) {
      updateTaskStatus(task, "error");
      if (!aiMessage) {
        const message = error && error.message ? String(error.message) : "stream failed";
        aiMessage = {
          id: aiMessageId,
          type: "ai",
          content: `Error: ${message}`,
        };
        appendSessionMessage(session, aiMessage);
      }
      db.save();
      throw error;
    }

    return {
      task,
      session,
    };
  }

  async function runAndWait({
    merchantId,
    sessionId,
    agentId,
    payload,
  }) {
    const result = await runWithStream({
      merchantId,
      sessionId,
      agentId,
      payload,
      onTaskCreated: null,
      onEvent: null,
    });
    return {
      task: result.task,
      state: buildSessionState(result.session),
    };
  }

  return {
    DEFAULT_AGENT_ID,
    listAgents,
    getAgent,
    getOrCreateSessionForMerchant,
    getSession,
    copySession,
    getSessionState: buildSessionState,
    listTasksForSession,
    getTask,
    cancelTask,
    runWithStream,
    runAndWait,
  };
}

module.exports = {
  createAgentRuntimeService,
};
