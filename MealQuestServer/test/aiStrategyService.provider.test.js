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
  assert.equal(runtime.maxConcurrency, 1);
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

test("ai strategy provider: queue serializes remote calls when maxConcurrency=1", async () => {
  const originalFetch = global.fetch;
  let activeCalls = 0;
  let maxActiveCalls = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  global.fetch = async () => {
    activeCalls += 1;
    maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
    await sleep(40);
    activeCalls -= 1;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                templateId: "activation_contextual_drop",
                branchId: "COOLING",
                title: "Heatwave Offer",
                rationale: "weather campaign",
                confidence: 0.8,
                campaignPatch: {
                  name: "Heatwave Offer",
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
      provider: "bigmodel",
      apiKey: "test-key",
      maxConcurrency: 1,
      timeoutMs: 5000,
    });

    const input = {
      merchantId: "m_store_001",
      templateId: "activation_contextual_drop",
      branchId: "COOLING",
      intent: "high temperature campaign",
    };

    const [first, second] = await Promise.all([
      service.generateStrategyPlan(input),
      service.generateStrategyPlan(input),
    ]);

    assert.equal(first.status, "PROPOSALS");
    assert.equal(second.status, "PROPOSALS");
    assert.equal(maxActiveCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
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
      retryBackoffMs: 1,
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
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: circuit breaker opens after consecutive upstream failures", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    const fatalError = new Error("ECONNREFUSED cannot reach upstream");
    fatalError.code = "ECONNREFUSED";
    throw fatalError;
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      circuitFailureThreshold: 2,
      circuitCooldownMs: 4000,
      timeoutMs: 3000,
    });

    const input = {
      merchantId: "m_store_001",
      templateId: "activation_contextual_drop",
      branchId: "COOLING",
      intent: "high temperature campaign",
    };

    const first = await service.generateStrategyPlan(input);
    const second = await service.generateStrategyPlan(input);
    const third = await service.generateStrategyPlan(input);

    assert.equal(first.status, "AI_UNAVAILABLE");
    assert.equal(second.status, "AI_UNAVAILABLE");
    assert.equal(third.status, "AI_UNAVAILABLE");
    assert.ok(String(third.reason || "").toLowerCase().includes("circuit breaker"));
    assert.equal(callCount, 2);

    const runtime = service.getRuntimeInfo();
    assert.equal(runtime.circuitBreaker.isOpen, true);
    assert.ok(runtime.circuitBreaker.remainingMs > 0);
  } finally {
    global.fetch = originalFetch;
  }
});
