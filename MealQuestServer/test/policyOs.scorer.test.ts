const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPluginRegistry } = require("../src/policyos/pluginRegistry");
const { createPolicyLedgerService } = require("../src/policyos/ledgerService");
const { registerDefaultPlugins } = require("../src/policyos/plugins/defaultPlugins");

function createScorer() {
  const db = createInMemoryDb();
  const pluginRegistry = createPluginRegistry();
  const ledgerService = createPolicyLedgerService(db);
  registerDefaultPlugins({
    pluginRegistry,
    db,
    ledgerService,
  });
  return pluginRegistry.get("scorer", "expected_profit_v1");
}

test("expected_profit_v1 scorer uses effective probability and exposes model probabilities", () => {
  const scorer = createScorer();
  assert.ok(scorer && typeof scorer.score === "function");

  const result = scorer.score({
    policy: {
      scoring: {
        plugin: "expected_profit_v1",
      },
    },
    ctx: {
      modelEstimate: {
        upliftProbability: 0.8,
        responseProbability: 0.5,
        churnProbability: 0.25,
        effectiveProbability: 0.3,
        v: 10,
        c: 1,
        riskPenalty: 1,
        fatiguePenalty: 1,
      },
    },
  });

  assert.equal(result.utility, 0);
  assert.equal(result.model.upliftProbability, 0.8);
  assert.equal(result.model.responseProbability, 0.5);
  assert.equal(result.model.churnProbability, 0.25);
  assert.equal(result.model.effectiveProbability, 0.3);
});
