const test = require("node:test");
const assert = require("node:assert/strict");

const { createStrategyChatService } = require("../src/services/strategyChatService");

test("strategy chat service streams official mode/chunk tuples with chat reply", async () => {
  let capturedInput = null;
  let capturedConfig = null;
  const service = createStrategyChatService({
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

  const gen = service.streamStrategyChatTurn({
    merchantId: "m_store_001",
    sessionId: "sc_m_store_001",
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
  assert.equal(result.status, "CHAT_REPLY");
  assert.equal(result.assistantMessage, "hello world");
  assert.deepEqual(capturedInput, {
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
  });
  assert.equal(capturedConfig.runName, "mq.strategy_chat.turn");
  assert.deepEqual(capturedConfig.tags, ["mealquest", "merchant", "strategy-chat"]);
  assert.deepEqual(capturedConfig.metadata, {
    merchantId: "m_store_001",
    sessionId: "sc_m_store_001",
    channel: "sse",
    streamMode: ["messages", "updates", "custom"],
  });
});

test("strategy chat service returns AI_UNAVAILABLE when agent is missing", async () => {
  const service = createStrategyChatService({
    loadAgent: async () => null,
  });

  const gen = service.streamStrategyChatTurn({
    merchantId: "m_store_001",
    sessionId: "sc_m_store_001",
    userMessage: "hello",
  });
  const first = await gen.next();
  assert.equal(first.done, true);
  assert.equal(first.value.status, "AI_UNAVAILABLE");
});
