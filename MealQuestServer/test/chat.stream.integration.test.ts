const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");
const { issueToken } = require("../src/core/auth");

const TEST_JWT_SECRET = process.env.MQ_JWT_SECRET || "mealquest-dev-secret";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    assert.match(payload, /event: metadata/);
    assert.match(payload, /event: values/);
    assert.match(payload, /event: messages/);
    assert.match(payload, /event: end/);
    assert.match(payload, /hello /);
    assert.match(payload, /merchant/);
    const messageEventCount = (payload.match(/event: messages/g) || []).length;
    assert.ok(messageEventCount >= 2);
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
    assert.equal(String(runPayload.status), "success");
    assert.equal(statePayload.values.pending_review, undefined);
    assert.equal(statePayload.values.__interrupt__.length, 0);
  } finally {
    await app.stop();
  }
});

test("langgraph run cancel endpoint and join stream return official metadata/events", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    strategyChatOptions: {
      loadAgent: async () => ({
        async *stream() {
          await sleep(300);
          const chunks = ["h", "e", "l", "l", "o", " ", "m", "q"];
          for (const token of chunks) {
            await sleep(20);
            yield ["messages", [{ content: token }, { node: "model" }]];
          }
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_003");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_003",
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
              content: "interrupt me",
            },
          ],
        },
        stream_mode: ["messages-tuple", "values", "custom", "updates"],
      }),
    });
    assert.equal(streamRes.status, 200);
    const contentLocation = String(streamRes.headers.get("content-location") || "");
    const runMatch = contentLocation.match(/\/threads\/([^/]+)\/runs\/([^/]+)$/);
    assert.ok(runMatch);
    const runId = runMatch[2];

    const cancelRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/${runId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(cancelRes.status, 200);
    const cancelPayload = await cancelRes.json();
    assert.ok(["interrupted", "success"].includes(String(cancelPayload.status)));

    const streamPayload = await streamRes.text();
    assert.match(streamPayload, /event: metadata/);
    assert.match(streamPayload, /event: end/);
    assert.match(streamPayload, /"status":"(interrupted|success)"/);

    const runRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/${runId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(runRes.status, 200);
    const runPayload = await runRes.json();
    assert.ok(["interrupted", "success"].includes(String(runPayload.status)));

    const joinRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/${runId}/stream`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(joinRes.status, 200);
    const joinPayload = await joinRes.text();
    assert.match(joinPayload, /event: metadata/);
    assert.match(joinPayload, /event: values/);
    assert.match(joinPayload, /event: end/);
    assert.match(joinPayload, /"status":"(interrupted|success)"/);
  } finally {
    await app.stop();
  }
});

test("langgraph resume command is rejected in chat-only mode", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    strategyChatOptions: {
      loadAgent: async () => ({
        async *stream() {
          yield ["messages", [{ content: "draft " }, { node: "model" }]];
          yield ["messages", [{ content: "ready" }, { node: "model" }]];
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_004");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_004",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET,
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

    const resumeRes = await fetch(`${baseUrl}/api/langgraph/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        assistant_id: "merchant-agent",
        command: {
          resume: {
            action: "evaluate",
            user_id: "u_demo_001",
          },
        },
        stream_mode: ["values", "messages-tuple"],
      }),
    });
    assert.equal(resumeRes.status, 200);
    const resumePayload = await resumeRes.text();
    assert.match(resumePayload, /event: error/);
    assert.match(resumePayload, /chat-only mode/i);
  } finally {
    await app.stop();
  }
});

test("legacy strategy proposal APIs return 404", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
  });
  seedMerchant(app.db, "m_chat_005");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_005",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET,
  );

  try {
    const paths = ["review", "evaluate", "publish"];
    for (const action of paths) {
      const res = await fetch(
        `${baseUrl}/api/merchant/strategy-chat/proposals/proposal_demo/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            merchantId: "m_chat_005",
            decision: action === "review" ? "APPROVE" : undefined,
          }),
        },
      );
      assert.equal(res.status, 404);
      const payload = await res.json();
      assert.match(String(payload.error || ""), /not found/i);
    }
  } finally {
    await app.stop();
  }
});
