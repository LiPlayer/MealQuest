const test = require("node:test");
const assert = require("node:assert/strict");

const { createOmniAgentService } = require("../src/services/omniAgentService");

test("omni agent service streams official mode/chunk tuples with agent reply", async () => {
  let capturedInput = null;
  let capturedConfig = null;
  const service = createOmniAgentService({
    loadAgent: async () => ({
      async *stream(input, config) {
        capturedInput = input;
        capturedConfig = config;
        yield ["custom", { phase: "AGENT_EXECUTION_START", status: "running" }];
        yield ["messages", [{ content: "hello " }, { node: "model" }]];
        yield ["messages", [{ content: "world" }, { node: "model" }]];
      },
    }),
  });

  const gen = service.streamAgentTurn({
    merchantId: "m_store_001",
    sessionId: "session_m_store_001",
    userMessage: "say hello",
  });

  const events = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    next = await gen.next();
  }
  const result = next.value;

  assert.equal(events[0].type, "STREAM_CHUNK");
  assert.equal(events[0].mode, "custom");
  assert.equal(events[1].type, "STREAM_CHUNK");
  assert.equal(events[1].mode, "messages");
  assert.equal(events[1].tokenText, "hello ");
  assert.equal(events[2].type, "STREAM_CHUNK");
  assert.equal(events[2].mode, "messages");
  assert.equal(events[2].tokenText, "world");
  assert.equal(result.status, "AGENT_REPLY");
  assert.equal(result.assistantMessage, "hello world");
  assert.equal(result.protocol.provider, "deepseek");

  assert.deepEqual(capturedInput, {
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
  });
  assert.equal(capturedConfig.runName, "mq.agent.task.turn");
  assert.deepEqual(capturedConfig.tags, ["mealquest", "merchant", "agent-os"]);
  assert.deepEqual(capturedConfig.metadata, {
    merchantId: "m_store_001",
    sessionId: "session_m_store_001",
    channel: "sse",
    streamMode: ["messages", "updates", "custom"],
  });
});

test("omni agent service returns AI_UNAVAILABLE when agent is missing", async () => {
  const service = createOmniAgentService({
    loadAgent: async () => null,
  });

  const gen = service.streamAgentTurn({
    merchantId: "m_store_001",
    sessionId: "session_m_store_001",
    userMessage: "hello",
  });
  const first = await gen.next();
  assert.equal(first.done, true);
  assert.equal(first.value.status, "AI_UNAVAILABLE");
});

test("omni agent service supports provider-agnostic memory compressor", async () => {
  let captured = null;
  const service = createOmniAgentService({
    provider: "mock-llm",
    memoryCompressor: async (input) => {
      captured = input;
      return "- Keep pricing guardrail\n- Next action: run weekend promotion";
    },
  });

  const summary = await service.summarizeSessionMemory({
    merchantId: "m_store_002",
    sessionId: "thread_m_store_002_staff_001",
    previousSummary: "- Goal: increase lunch traffic",
    archiveText: "USER: launch weekend campaign\nASSISTANT: approved with discount cap",
  });

  assert.match(summary, /pricing guardrail/i);
  assert.deepEqual(captured, {
    merchantId: "m_store_002",
    sessionId: "thread_m_store_002_staff_001",
    archiveText: "USER: launch weekend campaign\nASSISTANT: approved with discount cap",
    previousSummary: "- Goal: increase lunch traffic",
    provider: "mock-llm",
  });
});
