const test = require("node:test");
const assert = require("node:assert/strict");

const { createStrategyChatService } = require("../src/services/strategyChatService");

test("strategy chat service streams START -> TOKEN* -> END with chat reply", async () => {
  const fakeModel = {
    async *stream() {
      yield { content: "hello " };
      yield { content: "world" };
    },
  };
  const service = createStrategyChatService({ modelInstance: fakeModel });

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

  assert.equal(events[0].type, "START");
  assert.equal(events[1].type, "TOKEN");
  assert.equal(events[1].text, "hello ");
  assert.equal(events[2].type, "TOKEN");
  assert.equal(events[2].text, "world");
  assert.equal(events[3].type, "END");
  assert.equal(result.status, "CHAT_REPLY");
  assert.equal(result.assistantMessage, "hello world");
});

test("strategy chat service returns AI_UNAVAILABLE when model is missing", async () => {
  const service = createStrategyChatService({
    loadModel: async () => null,
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
