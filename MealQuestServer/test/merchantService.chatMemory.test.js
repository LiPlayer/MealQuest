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

test("merchant strategy chat compacts long dialogue into structured memory", async () => {
  const db = createInMemoryDb();
  seedMerchant(db);

  const capturedInputs = [];
  const merchantService = createMerchantService(db, {
    aiStrategyService: {
      async generateStrategyChatTurn(input) {
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
      `第${index}轮：目标是提升复购和GMV，预算上限 ${300 + index * 10}，不要超预算，主要针对新客和会员，本周末晚高峰执行。` +
      " 用户反馈：希望低打扰，避免过度折扣，保持毛利。" +
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
  assert.ok(String(session.memorySummary || "").length > 0);
  assert.ok(session.memoryFacts && typeof session.memoryFacts === "object");
  assert.ok(Array.isArray(session.memoryFacts.goals));
  assert.ok(Array.isArray(session.memoryFacts.constraints));
  assert.ok(session.memoryFacts.goals.length > 0);
  assert.ok(session.memoryFacts.constraints.length > 0);

  const lastInput = capturedInputs[capturedInputs.length - 1];
  assert.ok(lastInput && Array.isArray(lastInput.history));
  assert.ok(lastInput.history.length > 0);
  assert.ok(
    lastInput.history.some(
      (item) => item && item.role === "SYSTEM" && ["MEMORY_SUMMARY", "MEMORY_FACTS"].includes(item.type),
    ),
  );
  assert.ok(lastInput.history.length <= 42);

  const latestMessage = lastInput.history[lastInput.history.length - 1];
  assert.ok(latestMessage);
  assert.equal(latestMessage.role, "USER");
  assert.match(String(latestMessage.text || ""), /第16轮/);
});
