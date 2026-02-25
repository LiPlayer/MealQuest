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

  const result = await service.generateStrategyPlan({
    merchantId: "m_store_001",
    templateId: "activation_contextual_drop",
    branchId: "COOLING",
    intent: "high temperature campaign",
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
                templateId: "activation_contextual_drop",
                branchId: "COOLING",
                title: "Recovered Strategy",
                rationale: "retry path works",
                confidence: 0.79,
                campaignPatch: {
                  name: "Recovered Strategy",
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

    const result = await service.generateStrategyPlan({
      merchantId: "m_store_001",
      templateId: "activation_contextual_drop",
      branchId: "COOLING",
      intent: "high temperature campaign",
    });

    assert.equal(result.status, "PROPOSALS");
    assert.equal(callCount, 3);
    assert.equal(service.getRuntimeInfo().retryPolicy.maxRetries, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
