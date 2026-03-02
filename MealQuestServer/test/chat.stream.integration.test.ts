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

test("langgraph runs/stream emits values and messages events", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    strategyChatOptions: {
      loadAgent: async () => ({
        async *stream() {
          yield [
            "custom",
            {
              phase: "AGENT_EXECUTION_START",
              status: "running",
            },
          ];
          yield ["messages", [{ content: "hello " }, { node: "model" }]];
          yield ["messages", [{ content: "merchant" }, { node: "model" }]];
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
    const createThreadRes = await fetch(`${baseUrl}/api/langgraph/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createThreadRes.status, 200);
    const createdThread = await createThreadRes.json();
    const threadId = String(createdThread && createdThread.thread_id ? createdThread.thread_id : "");
    assert.ok(threadId);

    const res = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        assistant_id: "merchant-agent",
        input: {
          messages: [
            {
              type: "human",
              content: "hello",
            },
          ],
        },
        stream_mode: ["messages-tuple", "values", "custom", "updates"],
      }),
    });

    assert.equal(res.status, 200);
    assert.match(String(res.headers.get("content-type")), /text\/event-stream/i);
    assert.match(String(res.headers.get("content-location")), /\/threads\/.+\/runs\/.+/);
    const payload = await res.text();
    assert.match(payload, /event: values/);
    assert.match(payload, /event: messages/);
    assert.match(payload, /event: end/);
    assert.match(payload, /hello /);
    assert.match(payload, /merchant/);
  } finally {
    await app.stop();
  }
});

test("langgraph thread state and history are queryable after stream", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    strategyChatOptions: {
      loadAgent: async () => ({
        async *stream() {
          yield [
            "custom",
            {
              phase: "AGENT_EXECUTION_START",
              status: "running",
            },
          ];
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_002");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_002",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET
  );

  try {
    const createThreadRes = await fetch(`${baseUrl}/api/langgraph/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createThreadRes.status, 200);
    const createdThread = await createThreadRes.json();
    const threadId = String(createdThread && createdThread.thread_id ? createdThread.thread_id : "");
    assert.ok(threadId);

    const streamRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        assistant_id: "merchant-agent",
        input: {
          messages: [
            {
              type: "human",
              content: "hello",
            },
          ],
        },
        stream_mode: ["values"],
      }),
    });
    assert.equal(streamRes.status, 200);
    const contentLocation = String(streamRes.headers.get("content-location") || "");
    const runMatch = contentLocation.match(/\/threads\/([^/]+)\/runs\/([^/]+)$/);
    assert.ok(runMatch);
    const runId = runMatch[2];
    await streamRes.text();

    const stateRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/state`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(stateRes.status, 200);
    const statePayload = await stateRes.json();
    assert.ok(statePayload && statePayload.values && Array.isArray(statePayload.values.messages));
    assert.ok(statePayload.values.messages.length >= 2);

    const historyRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ limit: 10 }),
    });
    assert.equal(historyRes.status, 200);
    const historyPayload = await historyRes.json();
    assert.ok(Array.isArray(historyPayload));
    assert.ok(historyPayload.length >= 1);

    const runRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/${runId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(runRes.status, 200);
    const runPayload = await runRes.json();
    assert.equal(runPayload.run_id, runId);
  } finally {
    await app.stop();
  }
});
