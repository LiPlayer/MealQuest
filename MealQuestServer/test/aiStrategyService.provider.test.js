const test = require("node:test");
const assert = require("node:assert/strict");

const { createAiStrategyService } = require("../src/services/aiStrategyService");

test("ai strategy provider: bigmodel uses expected defaults", () => {
  const service = createAiStrategyService({
    provider: "bigmodel",
    apiKey: "test-key",
  });
  const runtime = service.getRuntimeInfo();

  assert.equal(runtime.provider, "bigmodel");
  assert.equal(runtime.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(runtime.model, "glm-4.7-flash");
  assert.equal(runtime.remoteEnabled, true);
  assert.equal(runtime.remoteConfigured, true);
  assert.equal(runtime.plannerEngine, "langgraph");
  assert.equal(runtime.modelClient, "langchain_chatopenai");
  assert.equal(runtime.retryPolicy.maxRetries, 2);
});

test("ai strategy provider: bigmodel without api key returns AI_UNAVAILABLE", async () => {
  const service = createAiStrategyService({
    provider: "bigmodel",
    apiKey: "",
  });

  const result = await service.generateStrategyChatTurn({
    merchantId: "m_store_001",
    sessionId: "sc_test",
    userMessage: "Please draft a cooling strategy.",
    history: [],
    activeCampaigns: [],
    approvedStrategies: [],
  });

  assert.equal(result.status, "AI_UNAVAILABLE");
  assert.ok(String(result.reason || "").includes("MQ_AI_API_KEY"));
});

test("ai strategy provider: retries transient upstream failures and then succeeds", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    if (callCount < 3) {
      const transientError = new Error("ECONNRESET upstream disconnected");
      transientError.code = "ECONNRESET";
      throw transientError;
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "PROPOSAL",
                assistantMessage: "Recovered after retries.",
                proposal: {
                  templateId: "activation_contextual_drop",
                  branchId: "COOLING",
                  title: "Recovered Strategy",
                  rationale: "retry path works",
                  confidence: 0.79,
                  campaignPatch: {
                    name: "Recovered Strategy",
                  },
                },
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 3,
      timeoutMs: 3000,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_retry",
      userMessage: "Please create a cooling proposal.",
      history: [],
      activeCampaigns: [],
      approvedStrategies: [],
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.equal(callCount, 3);
    assert.equal(service.getRuntimeInfo().retryPolicy.maxRetries, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: strategy chat supports multiple proposal candidates", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "PROPOSAL",
                assistantMessage: "Drafted multiple options.",
                proposals: [
                  {
                    templateId: "activation_contextual_drop",
                    branchId: "COOLING",
                    title: "Option A",
                    rationale: "for hot weather",
                    confidence: 0.75,
                    campaignPatch: {
                      name: "Option A",
                    },
                  },
                  {
                    templateId: "activation_contextual_drop",
                    branchId: "COMFORT",
                    title: "Option B",
                    rationale: "for fallback users",
                    confidence: 0.7,
                    campaignPatch: {
                      name: "Option B",
                    },
                  },
                ],
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      timeoutMs: 3000,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_multi",
      userMessage: "Give me two options.",
      history: [],
      activeCampaigns: [],
      approvedStrategies: [],
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.ok(Array.isArray(result.proposals));
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposal.branch.branchId, "COOLING");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: strategy chat payload includes sanitized sales snapshot", async () => {
  const originalFetch = global.fetch;
  let capturedPayload = null;

  global.fetch = async (input, init) => {
    let body = "";
    if (init && typeof init.body === "string") {
      body = init.body;
    } else if (input && typeof input.text === "function") {
      body = await input.text();
    }
    const requestJson = JSON.parse(String(body || "{}"));
    const userMessage = Array.isArray(requestJson.messages)
      ? requestJson.messages.find((item) => item && item.role === "user")
      : null;
    capturedPayload = userMessage && typeof userMessage.content === "string"
      ? JSON.parse(userMessage.content)
      : null;

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "CHAT_REPLY",
                assistantMessage: "snapshot received",
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      timeoutMs: 3000,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_sales",
      userMessage: "Suggest optimization based on sales.",
      history: [],
      activeCampaigns: [],
      approvedStrategies: [],
      executionHistory: [
        {
          timestamp: "2026-02-25T00:10:00.000Z",
          action: "STRATEGY_CHAT_REVIEW",
          status: "SUCCESS",
          details: {
            proposalId: "proposal_1",
            campaignId: "campaign_1",
            verbose: "x".repeat(180),
          },
        },
      ],
      salesSnapshot: {
        generatedAt: "2026-02-25T00:00:00.000Z",
        currency: "cny",
        totals: {
          ordersPaidCount: 12,
          externalPaidCount: 3,
          walletOnlyPaidCount: 9,
          gmvPaid: 640.556,
          refundAmount: 40.123,
          netRevenue: 600.433,
          aov: 53.379,
          refundRate: 1.3,
        },
        windows: [
          {
            days: 7,
            ordersPaidCount: 6,
            externalPaidCount: 2,
            walletOnlyPaidCount: 4,
            gmvPaid: 320,
            refundAmount: 16,
            netRevenue: 304,
            aov: 53.33,
            refundRate: 0.05,
          },
        ],
        paymentStatusSummary: {
          totalPayments: 15,
          paidCount: 12,
          pendingExternalCount: 2,
          failedExternalCount: 1,
        },
      },
    });

    assert.equal(result.status, "CHAT_REPLY");
    assert.ok(capturedPayload);
    assert.equal(capturedPayload.task, "STRATEGY_CHAT");
    assert.ok(capturedPayload.salesSnapshot);
    assert.ok(Array.isArray(capturedPayload.executionHistory));
    assert.equal(capturedPayload.executionHistory[0].action, "STRATEGY_CHAT_REVIEW");
    assert.equal(capturedPayload.executionHistory[0].details.proposalId, "proposal_1");
    assert.equal(capturedPayload.salesSnapshot.currency, "CNY");
    assert.equal(capturedPayload.salesSnapshot.totals.gmvPaid, 640.56);
    assert.equal(capturedPayload.salesSnapshot.totals.refundRate, 1);
    assert.equal(capturedPayload.salesSnapshot.windows[0].days, 7);
    assert.equal(capturedPayload.salesSnapshot.paymentStatusSummary.pendingExternalCount, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: prompt history keeps MEMORY prefixes while trimming", async () => {
  const originalFetch = global.fetch;
  let capturedPayload = null;

  global.fetch = async (input, init) => {
    let body = "";
    if (init && typeof init.body === "string") {
      body = init.body;
    } else if (input && typeof input.text === "function") {
      body = await input.text();
    }
    const requestJson = JSON.parse(String(body || "{}"));
    const userMessage = Array.isArray(requestJson.messages)
      ? requestJson.messages.find((item) => item && item.role === "user")
      : null;
    capturedPayload = userMessage && typeof userMessage.content === "string"
      ? JSON.parse(userMessage.content)
      : null;

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "CHAT_REPLY",
                assistantMessage: "history received",
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      timeoutMs: 3000,
    });

    const history = [
      {
        role: "SYSTEM",
        type: "MEMORY_FACTS",
        text: "Goals: 提升复购 | Constraints: 预算上限 500",
        proposalId: "",
        createdAt: "2026-02-25T00:00:00.000Z",
      },
      {
        role: "SYSTEM",
        type: "MEMORY_SUMMARY",
        text: "长期总结：老板偏好低打扰策略，避免高折扣。",
        proposalId: "",
        createdAt: "2026-02-25T00:00:01.000Z",
      },
    ];
    for (let idx = 1; idx <= 70; idx += 1) {
      history.push({
        role: idx % 2 === 0 ? "ASSISTANT" : "USER",
        type: "TEXT",
        text: `turn-${idx} ` + "x".repeat(120),
        proposalId: "",
        createdAt: `2026-02-25T00:${String(idx).padStart(2, "0")}:00.000Z`,
      });
    }

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_history_memory",
      userMessage: "继续优化策略。",
      history,
      activeCampaigns: [],
      approvedStrategies: [],
      executionHistory: [],
    });

    assert.equal(result.status, "CHAT_REPLY");
    assert.ok(capturedPayload);
    assert.ok(Array.isArray(capturedPayload.history));
    assert.ok(capturedPayload.history.length <= 48);
    assert.ok(
      capturedPayload.history.some(
        (item) => item && item.role === "SYSTEM" && item.type === "MEMORY_FACTS",
      ),
    );
    assert.ok(
      capturedPayload.history.some(
        (item) => item && item.role === "SYSTEM" && item.type === "MEMORY_SUMMARY",
      ),
    );
    assert.match(
      String(capturedPayload.history[capturedPayload.history.length - 1].text || ""),
      /turn-70/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
