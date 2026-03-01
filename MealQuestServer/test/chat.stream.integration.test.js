const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";

function seedMerchant(db, merchantId = "m_chat_001") {
  db.merchants[merchantId] = {
    merchantId,
    name: "Chat Merchant",
    killSwitchEnabled: false,
    budgetCap: 500,
    budgetUsed: 0,
    staff: [{ uid: "staff_owner", role: "OWNER" }],
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
    clusterId: "cluster_chat",
    stores: [merchantId],
    walletShared: false,
    tierShared: false,
    updatedAt: new Date().toISOString(),
  };
}

test("chat stream endpoint emits metadata/messages/updates", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    strategyChatOptions: {
      loadModel: async () => ({
        async *stream() {
          yield { content: "hello " };
          yield { content: "merchant" };
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_001");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_001",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET
  );

  try {
    const res = await fetch(`${baseUrl}/api/merchant/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        context: {
          merchantId: "m_chat_001",
        },
        input: {
          text: "hello",
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.match(String(res.headers.get("content-type")), /text\/event-stream/i);
    const payload = await res.text();
    assert.match(payload, /event: metadata/);
    assert.match(payload, /event: updates/);
    assert.match(payload, /event: messages/);
    assert.match(payload, /hello merchant/);
  } finally {
    await app.stop();
  }
});
