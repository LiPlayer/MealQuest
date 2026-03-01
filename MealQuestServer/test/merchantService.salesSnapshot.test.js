const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createMerchantService } = require("../src/services/merchantService");

test("merchant strategy chat does not forward payment sales snapshot into agent input", async () => {
  const db = createInMemoryDb();
  const now = Date.now();
  db.merchants.m_store_001 = {
    merchantId: "m_store_001",
    name: "Snapshot Test Merchant",
    killSwitchEnabled: false,
    budgetCap: 300,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" },
    ],
  };
  db.merchantUsers.m_store_001 = {};
  db.paymentsByMerchant.m_store_001 = {};
  db.invoicesByMerchant.m_store_001 = {};
  db.strategyConfigs.m_store_001 = {};
  db.strategyChats.m_store_001 = {
    activeSessionId: null,
    sessions: {},
  };
  db.allianceConfigs.m_store_001 = {
    merchantId: "m_store_001",
    clusterId: "cluster_snapshot_test",
    stores: ["m_store_001"],
    walletShared: false,
    tierShared: false,
    updatedAt: new Date(now).toISOString(),
  };

  db.setPayment("m_store_001", "txn_recent_paid_wallet", {
    paymentTxnId: "txn_recent_paid_wallet",
    merchantId: "m_store_001",
    userId: "u_fixture_001",
    status: "PAID",
    orderAmount: 100,
    refundedAmount: 20,
    externalPayment: null,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  let capturedInput = null;
  const merchantService = createMerchantService(db, {
    strategyAgentService: {
      async *streamStrategyChatTurn(input) {
        capturedInput = input;
        return {
          status: "CHAT_REPLY",
          assistantMessage: "ok",
        };
      },
    },
  });

  const turn = await merchantService.sendStrategyChatMessage({
    merchantId: "m_store_001",
    operatorId: "staff_owner",
    content: "Summarize sales and suggest next strategy.",
  });

  assert.equal(turn.status, "CHAT_REPLY");
  assert.ok(capturedInput);
  assert.equal(capturedInput.merchantId, "m_store_001");
  assert.equal(typeof capturedInput.sessionId, "string");
  assert.equal(capturedInput.userMessage, "Summarize sales and suggest next strategy.");
  assert.equal(Object.prototype.hasOwnProperty.call(capturedInput, "salesSnapshot"), false);
});
