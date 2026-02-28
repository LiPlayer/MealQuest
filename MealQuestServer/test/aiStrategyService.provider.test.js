const test = require("node:test");
const assert = require("node:assert/strict");

const { createAiStrategyService } = require("../src/services/aiStrategyService");

function safeParseJson(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function extractAiUserPayload(messages) {
  if (!Array.isArray(messages)) {
    return {};
  }
  const users = messages.filter((item) => item && item.role === "user");
  const user = users.length > 0 ? users[users.length - 1] : null;
  const rawText = String(user && user.content ? user.content : "");
  if (rawText.includes("Context:") && rawText.includes("User:")) {
    const contextStart = rawText.indexOf("Context:") + "Context:".length;
    const historyStart = rawText.indexOf("\n\nHistory:");
    const contextText =
      historyStart > contextStart
        ? rawText.slice(contextStart, historyStart).trim()
        : "";
    const userMarker = "\n\nUser:";
    const userStart = rawText.indexOf(userMarker);
    const historyText =
      historyStart >= 0
        ? rawText
          .slice(historyStart + "\n\nHistory:".length, userStart >= 0 ? userStart : rawText.length)
          .trim()
        : "[]";
    const context = safeParseJson(contextText) || {};
    const history = safeParseJson(historyText);
    const userMessage =
      userStart >= 0 ? rawText.slice(userStart + userMarker.length).trim() : "";
    return {
      task: "STRATEGY_CHAT",
      userMessage,
      intentFrame: context.intentFrame || null,
      history: Array.isArray(history) ? history : [],
      salesSnapshot: context.salesSnapshot || null,
      executionHistory: Array.isArray(context.executionHistory) ? context.executionHistory : [],
      approvedStrategies: Array.isArray(context.approvedStrategies)
        ? context.approvedStrategies
        : [],
    };
  }
  return safeParseJson(rawText) || {};
}

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
  assert.equal(runtime.plannerEngine, "dual_channel_strict_v2");
  assert.equal(runtime.criticLoop.enabled, true);
  assert.equal(runtime.criticLoop.maxRounds, 1);
  assert.equal(runtime.modelClient, "langchain_chatopenai");
  assert.equal(runtime.retryPolicy.maxRetries, 2);
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
              content: [
                "Recovered after retries.",
                "---STRUCTURED_OUTPUT---",
                JSON.stringify({
                  schemaVersion: "2026-02-27",
                  assistantMessage: "Recovered after retries.",
                  proposals: [
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Recovered Strategy",
                      rationale: "retry path works",
                      confidence: 0.79,
                      policyPatch: {
                        name: "Recovered Strategy",
                      },
                    },
                  ],
                }),
                "---END_STRUCTURED_OUTPUT---",
              ].join("\n"),
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
      activePolicies: [],
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
              content: [
                "Drafted multiple options.",
                "---STRUCTURED_OUTPUT---",
                JSON.stringify({
                  schemaVersion: "2026-02-27",
                  assistantMessage: "Drafted multiple options.",
                  proposals: [
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Option A",
                      rationale: "for hot weather",
                      confidence: 0.75,
                      policyPatch: {
                        name: "Option A",
                      },
                    },
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "CHANNEL",
                      title: "Option B",
                      rationale: "for fallback users",
                      confidence: 0.7,
                      policyPatch: {
                        name: "Option B",
                      },
                    },
                  ],
                }),
                "---END_STRUCTURED_OUTPUT---",
              ].join("\n"),
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
      activePolicies: [],
      approvedStrategies: [],
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.ok(Array.isArray(result.proposals));
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposal.branch.branchId, "DEFAULT");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: unary graph ranks proposals with simulation tool and adds explain pack", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                "Drafted two options.",
                "---STRUCTURED_OUTPUT---",
                JSON.stringify({
                  schemaVersion: "2026-02-27",
                  assistantMessage: "Drafted two options.",
                  mode: "PROPOSAL",
                  proposals: [
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Option Low",
                      rationale: "low expected value",
                      confidence: 0.8,
                      policyPatch: {
                        name: "Option Low",
                      },
                    },
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "CHANNEL",
                      title: "Option High",
                      rationale: "higher expected value",
                      confidence: 0.6,
                      policyPatch: {
                        name: "Option High",
                      },
                    },
                  ],
                }),
                "---END_STRUCTURED_OUTPUT---",
              ].join("\n"),
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
      criticEnabled: false,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_graph_rank",
      userMessage: "Please propose two options and rank by expected value.",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
      simulatePolicyCandidates: async () => ({
        source: "POLICYOS_SIMULATE",
        userId: "u_001",
        results: [
          {
            proposalIndex: 0,
            blocked: false,
            score: 1,
            reason_codes: ["ok"],
            risk_flags: [],
            expected_range: { min: 0.2, max: 0.8 },
            selected_count: 1,
            rejected_count: 0,
            estimated_cost: 1,
          },
          {
            proposalIndex: 1,
            blocked: false,
            score: 7.2,
            reason_codes: ["ok", "better_margin"],
            risk_flags: ["MEDIUM_VOLATILITY"],
            expected_range: { min: 5, max: 10 },
            selected_count: 1,
            rejected_count: 0,
            estimated_cost: 2,
          },
        ],
      }),
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.ok(Array.isArray(result.proposals));
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposals[0].title, "Option High");
    assert.ok(result.proposals[0].evaluation);
    assert.equal(result.proposals[0].evaluation.rank_score, 7.2);
    assert.ok(result.explainPack);
    assert.equal(result.explainPack.source, "POLICYOS_SIMULATE");
    assert.equal(result.explainPack.items[0].title, "Option High");
    assert.equal(result.protocol.simulation.source, "POLICYOS_SIMULATE");
    assert.equal(result.protocol.ranking.strategy, "VALUE_RISK_COST_V1");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: publish intent requires approval and can invoke publish tool", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                "Drafted two options for publish.",
                "---STRUCTURED_OUTPUT---",
                JSON.stringify({
                  schemaVersion: "2026-02-27",
                  assistantMessage: "Drafted two options for publish.",
                  mode: "PROPOSAL",
                  proposals: [
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Publish A",
                      rationale: "base plan",
                      confidence: 0.7,
                      policyPatch: {
                        name: "Publish A",
                      },
                    },
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "CHANNEL",
                      title: "Publish B",
                      rationale: "channel plan",
                      confidence: 0.72,
                      policyPatch: {
                        name: "Publish B",
                      },
                    },
                  ],
                }),
                "---END_STRUCTURED_OUTPUT---",
              ].join("\n"),
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
      criticEnabled: false,
    });

    const publishedCalls = [];
    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_publish_intent",
      userMessage: "publish this now",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
      publishIntent: true,
      approvalToken: "approval_token_001",
      validateApproval: async ({ approvalToken }) => ({
        approved: approvalToken === "approval_token_001",
        approvalId: "approval_123",
        source: "TEST_APPROVAL"
      }),
      publishPolicies: async ({ approvalId, proposals }) => {
        publishedCalls.push({ approvalId, proposalCount: proposals.length });
        return {
          source: "TEST_PUBLISH",
          published: [
            {
              proposalIndex: 0,
              policyId: "policy_abc",
              draftId: "draft_abc",
            },
            {
              proposalIndex: 1,
              policyId: "policy_def",
              draftId: "draft_def",
            },
          ]
        };
      },
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.equal(publishedCalls.length, 1);
    assert.equal(publishedCalls[0].approvalId, "approval_123");
    assert.equal(result.protocol.approval.approved, true);
    assert.equal(result.protocol.publish.intent, true);
    assert.equal(result.protocol.publish.source, "TEST_PUBLISH");
    assert.equal(result.protocol.publish.publishedCount, 2);
    assert.equal(result.proposals[0].publish.ok, true);
    assert.equal(result.proposals[0].publish.policy_id, "policy_abc");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: post-publish monitor and memory update hooks are attached", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                "Ready to publish.",
                "---STRUCTURED_OUTPUT---",
                JSON.stringify({
                  schemaVersion: "2026-02-27",
                  assistantMessage: "Ready to publish.",
                  mode: "PROPOSAL",
                  proposals: [
                    {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Monitor Target",
                      rationale: "monitor after publish",
                      confidence: 0.75,
                      policyPatch: {
                        name: "Monitor Target",
                      },
                    },
                  ],
                }),
                "---END_STRUCTURED_OUTPUT---",
              ].join("\n"),
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
      criticEnabled: false,
    });

    let monitorCalled = 0;
    let memoryCalled = 0;
    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_post_publish",
      userMessage: "publish and monitor",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
      publishIntent: true,
      approvalToken: "approval_token_ok",
      validateApproval: async () => ({
        approved: true,
        approvalId: "approval_ok",
        source: "TEST_APPROVAL"
      }),
      publishPolicies: async () => ({
        source: "TEST_PUBLISH",
        published: [
          {
            proposalIndex: 0,
            policyId: "policy_monitor_1",
            draftId: "draft_monitor_1",
          },
        ]
      }),
      monitorPublishedPolicies: async () => {
        monitorCalled += 1;
        return {
          source: "TEST_MONITOR",
          alerts: ["risk_spike"],
          recommendations: ["watch_5m"],
          summary: "monitor enabled"
        };
      },
      updateStrategyMemory: async () => {
        memoryCalled += 1;
        return {
          source: "TEST_MEMORY",
          persisted: true,
          memoryId: "memory_001",
          summary: "memory updated"
        };
      },
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.equal(monitorCalled, 1);
    assert.equal(memoryCalled, 1);
    assert.equal(result.protocol.post_publish_monitor.source, "TEST_MONITOR");
    assert.equal(result.protocol.post_publish_monitor.alertCount, 1);
    assert.equal(result.protocol.memory_update.source, "TEST_MEMORY");
    assert.equal(result.protocol.memory_update.persisted, true);
    assert.equal(result.protocol.memory_update.memoryId, "memory_001");
    assert.ok(result.postPublishMonitor);
    assert.ok(result.memoryUpdate);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: critic revise loop rewrites proposal candidates when needed", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Drafted initial options.",
                  "---STRUCTURED_OUTPUT---",
                  JSON.stringify({
                    schemaVersion: "2026-02-27",
                    assistantMessage: "Drafted initial options.",
                    proposals: [
                      {
                        templateId: "acquisition_welcome_gift",
                        branchId: "DEFAULT",
                        title: "Initial A",
                        rationale: "baseline",
                        confidence: 0.61,
                        policyPatch: {
                          name: "Initial A",
                        },
                      },
                      {
                        templateId: "acquisition_welcome_gift",
                        branchId: "CHANNEL",
                        title: "Initial B",
                        rationale: "close variant",
                        confidence: 0.58,
                        policyPatch: {
                          name: "Initial B",
                        },
                      },
                    ],
                  }),
                  "---END_STRUCTURED_OUTPUT---",
                ].join("\n"),
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
    }
    if (callCount === 2) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  needRevision: true,
                  summary: "options too similar",
                  issues: ["Increase differentiation", "Raise confidence with clearer intent"],
                  focus: ["audience split", "budget clarity"],
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
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "Revised options ready for review.",
                proposals: [
                  {
                    templateId: "acquisition_welcome_gift",
                    branchId: "DEFAULT",
                    title: "Refined Welcome Base",
                    rationale: "Conservative baseline for all new users.",
                    confidence: 0.76,
                    policyPatch: {
                      name: "Refined Welcome Base",
                    },
                  },
                  {
                    templateId: "acquisition_welcome_gift",
                    branchId: "CHANNEL",
                    title: "Refined Referral Boost",
                    rationale: "Referral branch for higher conversion users.",
                    confidence: 0.8,
                    policyPatch: {
                      name: "Refined Referral Boost",
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
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      timeoutMs: 3000,
      criticEnabled: true,
      criticMaxRounds: 1,
      criticMinProposals: 2,
      criticMinConfidence: 0.72,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_critic",
      userMessage: "Give me two differentiated launch options.",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
    });

    assert.equal(result.status, "PROPOSAL_READY");
    assert.equal(callCount, 3);
    assert.equal(result.assistantMessage, "Revised options ready for review.");
    assert.ok(Array.isArray(result.proposals));
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposals[0].title, "Refined Welcome Base");
    assert.equal(result.protocol.critic.applied, true);
    assert.equal(result.protocol.critic.round, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ai strategy provider: invalid policyPatch is revised before returning proposal", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Draft created.",
                  "---STRUCTURED_OUTPUT---",
                  JSON.stringify({
                    schemaVersion: "2026-02-27",
                    mode: "PROPOSAL",
                    assistantMessage: "Draft created.",
                    proposal: {
                      templateId: "acquisition_welcome_gift",
                      branchId: "DEFAULT",
                      title: "Invalid Draft",
                      rationale: "contains illegal field",
                      confidence: 0.8,
                      policyPatch: {
                        name: "Invalid Draft",
                        governance: {
                          approval_required: false,
                        },
                      },
                    },
                  }),
                  "---END_STRUCTURED_OUTPUT---",
                ].join("\n"),
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
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantMessage: "Compliant proposal ready.",
                proposals: [
                  {
                    templateId: "acquisition_welcome_gift",
                    branchId: "DEFAULT",
                    title: "Compliant Draft",
                    rationale: "removed illegal fields",
                    confidence: 0.82,
                    policyPatch: {
                      name: "Compliant Draft",
                      constraints: [
                        { plugin: "kill_switch_v1", params: {} },
                        {
                          plugin: "budget_guard_v1",
                          params: { cap: 150, cost_per_hit: 8 },
                        },
                        {
                          plugin: "frequency_cap_v1",
                          params: { daily: 1, window_sec: 86400 },
                        },
                        {
                          plugin: "anti_fraud_hook_v1",
                          params: { max_risk_score: 0.75 },
                        },
                      ],
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
  };

  try {
    const service = createAiStrategyService({
      provider: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      maxRetries: 1,
      timeoutMs: 3000,
      criticEnabled: true,
      criticMaxRounds: 1,
    });

    const result = await service.generateStrategyChatTurn({
      merchantId: "m_store_001",
      sessionId: "sc_invalid_patch",
      userMessage: "Please create a strategy.",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
    });

    assert.equal(callCount, 2);
    assert.equal(result.status, "PROPOSAL_READY");
    assert.equal(result.proposals[0].title, "Compliant Draft");
    assert.equal(result.protocol.critic.applied, true);
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
    capturedPayload = extractAiUserPayload(requestJson.messages);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "snapshot received",
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
      activePolicies: [],
      approvedStrategies: [],
      executionHistory: [
        {
          timestamp: "2026-02-25T00:10:00.000Z",
          action: "STRATEGY_CHAT_REVIEW",
          status: "SUCCESS",
          details: {
            proposalId: "proposal_1",
            policyId: "policy_1",
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
    assert.ok(capturedPayload.intentFrame);
    assert.equal(capturedPayload.intentFrame.salesSnapshotAvailable, true);
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

test("ai strategy provider: prompt payload includes parsed intent frame", async () => {
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
    capturedPayload = extractAiUserPayload(requestJson.messages);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "intent parsed",
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
      sessionId: "sc_intent",
      userMessage: "预算200，今天拉新，策略要稳健一些。",
      history: [],
      activePolicies: [],
      approvedStrategies: [],
      executionHistory: [],
    });

    assert.equal(result.status, "CHAT_REPLY");
    assert.ok(capturedPayload);
    assert.ok(capturedPayload.intentFrame);
    assert.equal(capturedPayload.intentFrame.primaryGoal, "ACQUISITION");
    assert.equal(capturedPayload.intentFrame.timeWindowHint, "TODAY");
    assert.equal(capturedPayload.intentFrame.riskPreference, "CONSERVATIVE");
    assert.equal(capturedPayload.intentFrame.budgetHint, 200);
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
    capturedPayload = extractAiUserPayload(requestJson.messages);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "history received",
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
        text: "Goals: æå‡å¤è´­ | Constraints: é¢„ç®—ä¸Šé™ 500",
        proposalId: "",
        createdAt: "2026-02-25T00:00:00.000Z",
      },
      {
        role: "SYSTEM",
        type: "MEMORY_SUMMARY",
        text: "é•¿æœŸæ€»ç»“ï¼šè€æ¿åå¥½ä½Žæ‰“æ‰°ç­–ç•¥ï¼Œé¿å…é«˜æŠ˜æ‰£ã€‚",
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
      userMessage: "ç»§ç»­ä¼˜åŒ–ç­–ç•¥ã€‚",
      history,
      activePolicies: [],
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
