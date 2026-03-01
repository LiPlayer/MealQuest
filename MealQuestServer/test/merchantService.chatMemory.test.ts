const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createMerchantService } = require("../src/services/merchantService");

function seedMerchant(db, merchantId = "m_store_001") {
  const now = new Date().toISOString();
  db.merchants[merchantId] = {
    merchantId,
    name: "Memory Test Merchant",
    killSwitchEnabled: false,
    budgetCap: 500,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" },
    ],
  };
  db.merchantUsers[merchantId] = {};
  db.paymentsByMerchant[merchantId] = {};
  db.invoicesByMerchant[merchantId] = {};
  db.strategyConfigs[merchantId] = {};
  db.strategyChats[merchantId] = {
    activeSessionId: null,
    sessions: {},
  };
  db.allianceConfigs[merchantId] = {
    merchantId,
    clusterId: "cluster_memory_test",
    stores: [merchantId],
    walletShared: false,
    tierShared: false,
    updatedAt: now,
  };
}

test("merchant strategy chat keeps session messages and sends minimal agent input", async () => {
  const db = createInMemoryDb();
  seedMerchant(db);

  const capturedInputs = [];
  const merchantService = createMerchantService(db, {
    strategyChatService: {
      async *streamStrategyChatTurn(input) {
        capturedInputs.push(input);
        return {
          status: "CHAT_REPLY",
          assistantMessage: "ok",
        };
      },
    },
  });

  for (let index = 1; index <= 16; index += 1) {
    const content =
      `round ${index}: goal is to improve retention and GMV, budget cap ${300 + index * 10}. ` +
      "user preference: low disturbance, avoid over-discounting, keep margin. " +
      "x".repeat(760);
    const turn = await merchantService.sendStrategyChatMessage({
      merchantId: "m_store_001",
      operatorId: "staff_owner",
      content,
    });
    assert.equal(turn.status, "CHAT_REPLY");
  }

  const bucket = db.strategyChats.m_store_001;
  const session = bucket.sessions[bucket.activeSessionId];
  assert.ok(session);
  assert.ok(Array.isArray(session.messages));
  assert.ok(session.messages.length >= 32);

  const lastInput = capturedInputs[capturedInputs.length - 1];
  assert.ok(lastInput);
  assert.equal(lastInput.merchantId, "m_store_001");
  assert.equal(lastInput.sessionId, bucket.activeSessionId);
  assert.match(String(lastInput.userMessage || ""), /round 16/);
  assert.equal(Object.prototype.hasOwnProperty.call(lastInput, "history"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(lastInput, "salesSnapshot"), false);
});

