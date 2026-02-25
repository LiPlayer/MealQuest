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
    assert.equal(capturedPayload.salesSnapshot.currency, "CNY");
    assert.equal(capturedPayload.salesSnapshot.totals.gmvPaid, 640.56);
    assert.equal(capturedPayload.salesSnapshot.totals.refundRate, 1);
    assert.equal(capturedPayload.salesSnapshot.windows[0].days, 7);
    assert.equal(capturedPayload.salesSnapshot.paymentStatusSummary.pendingExternalCount, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
