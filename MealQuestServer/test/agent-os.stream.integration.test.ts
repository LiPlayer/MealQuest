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
  db.agentSessions[merchantId] = {
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

test("agent-os tasks/stream emits values and messages events", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
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
    TEST_JWT_SECRET,
  );

  try {
    const res = await fetch(`${baseUrl}/api/agent-os/tasks/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: "merchant-omni-agent",
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
    assert.match(String(res.headers.get("content-location")), /\/sessions\/.+\/tasks\/.+/);
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

test("agent-os session state and history are queryable after stream", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
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
    TEST_JWT_SECRET,
  );

  try {
    const createSessionRes = await fetch(`${baseUrl}/api/agent-os/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createSessionRes.status, 200);
    const createdSession = await createSessionRes.json();
    const sessionId = String(
      createdSession && createdSession.session_id ? createdSession.session_id : "",
    );
    assert.ok(sessionId);

    const streamRes = await fetch(`${baseUrl}/api/agent-os/tasks/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: "merchant-omni-agent",
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
    const taskMatch = contentLocation.match(/\/sessions\/([^/]+)\/tasks\/([^/]+)$/);
    assert.ok(taskMatch);
    const taskId = taskMatch[2];
    await streamRes.text();

    const stateRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/state`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(stateRes.status, 200);
    const statePayload = await stateRes.json();
    assert.ok(statePayload && statePayload.values && Array.isArray(statePayload.values.messages));
    assert.ok(statePayload.values.messages.length >= 2);

    const historyRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/history`, {
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

    const taskRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(taskRes.status, 200);
    const taskPayload = await taskRes.json();
    assert.equal(taskPayload.task_id, taskId);
    assert.equal(String(taskPayload.status), "success");
    assert.equal(statePayload.values.pending_review, undefined);
    assert.equal(statePayload.values.__interrupt__.length, 0);
  } finally {
    await app.stop();
  }
});

test("agent-os task cancel endpoint and join stream return metadata/events", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
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
    TEST_JWT_SECRET,
  );

  try {
    const createSessionRes = await fetch(`${baseUrl}/api/agent-os/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createSessionRes.status, 200);
    const createdSession = await createSessionRes.json();
    const sessionId = String(
      createdSession && createdSession.session_id ? createdSession.session_id : "",
    );
    assert.ok(sessionId);

    const streamRes = await fetch(`${baseUrl}/api/agent-os/tasks/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: "merchant-omni-agent",
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
    const taskMatch = contentLocation.match(/\/sessions\/([^/]+)\/tasks\/([^/]+)$/);
    assert.ok(taskMatch);
    const taskId = taskMatch[2];

    const cancelRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/tasks/${taskId}/cancel`, {
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

    const taskRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(taskRes.status, 200);
    const taskPayload = await taskRes.json();
    assert.ok(["interrupted", "success"].includes(String(taskPayload.status)));

    const joinRes = await fetch(`${baseUrl}/api/agent-os/sessions/${sessionId}/tasks/${taskId}/stream`, {
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

test("agent-os resume command is rejected in current agent runtime", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
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
    const resumeRes = await fetch(`${baseUrl}/api/agent-os/tasks/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: "merchant-omni-agent",
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
    assert.match(resumePayload, /current agent runtime/i);
  } finally {
    await app.stop();
  }
});

test("agent-os memory compaction fails hard when deepseek compression returns empty", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
      loadModel: async () => ({
        invoke: async () => ({ content: "" }),
      }),
      loadAgent: async () => ({
        async *stream() {
          yield ["messages", [{ content: "ok" }, { node: "model" }]];
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_006");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_006",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET,
  );

  try {
    const createSessionRes = await fetch(`${baseUrl}/api/agent-os/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createSessionRes.status, 200);
    const createdSession = await createSessionRes.json();
    const sessionId = String(
      createdSession && createdSession.session_id ? createdSession.session_id : "",
    );
    assert.ok(sessionId);

    const runtimeSession = app.db.agentRuntime.sessions[sessionId];
    assert.ok(runtimeSession);
    runtimeSession.messages = Array.from({ length: 201 }).map((_, index) => ({
      id: `msg_seed_${index}`,
      type: index % 2 === 0 ? "human" : "ai",
      content: `seed_${index}`,
    }));
    runtimeSession.memory_summary = "seed_summary";
    runtimeSession.values = {
      messages: runtimeSession.messages,
      __interrupt__: [],
      memory_summary: runtimeSession.memory_summary,
    };

    const streamRes = await fetch(`${baseUrl}/api/agent-os/tasks/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: "merchant-omni-agent",
        input: {
          messages: [
            {
              type: "human",
              content: "trigger compaction",
            },
          ],
        },
        stream_mode: ["messages-tuple", "values"],
      }),
    });
    assert.equal(streamRes.status, 200);
    const payload = await streamRes.text();
    assert.match(payload, /event: error/);
    assert.match(payload, /memory compression returned empty summary/i);

    const afterSession = app.db.agentRuntime.sessions[sessionId];
    assert.equal(afterSession.messages.length, 201);
    assert.equal(afterSession.memory_summary, "seed_summary");
  } finally {
    await app.stop();
  }
});

test("agent-os legacy session-scoped stream endpoint is removed", async () => {
  const app = createAppServer({
    jwtSecret: TEST_JWT_SECRET,
    omniAgentOptions: {
      loadAgent: async () => ({
        async *stream() {
          yield ["messages", [{ content: "ok" }, { node: "model" }]];
        },
      }),
    },
  });
  seedMerchant(app.db, "m_chat_007");
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = issueToken(
    {
      role: "OWNER",
      merchantId: "m_chat_007",
      operatorId: "staff_owner",
    },
    TEST_JWT_SECRET,
  );

  try {
    const createSessionRes = await fetch(`${baseUrl}/api/agent-os/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createSessionRes.status, 200);
    const createdSession = await createSessionRes.json();
    const sessionId = String(
      createdSession && createdSession.session_id ? createdSession.session_id : "",
    );
    assert.ok(sessionId);

    const legacyRes = await fetch(
      `${baseUrl}/api/agent-os/sessions/${encodeURIComponent(sessionId)}/tasks/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: "merchant-omni-agent",
          input: {
            messages: [
              {
                type: "human",
                content: "should fail",
              },
            ],
          },
        }),
      },
    );
    assert.equal(legacyRes.status, 404);
    const payload = await legacyRes.json();
    assert.match(String(payload.error || ""), /not found/i);
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
