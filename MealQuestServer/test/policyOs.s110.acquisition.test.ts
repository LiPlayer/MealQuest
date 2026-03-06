const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createReleaseGateService } = require("../src/services/releaseGateService");
const { createExperimentService } = require("../src/services/experimentService");

function createSuiteContext(merchantId = "m_s110_srv_001") {
  const db = createInMemoryDb();
  db.save = () => {};
  db.merchants[merchantId] = {
    merchantId,
    name: "S110 Experiment Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: { uid: "u_001", displayName: "User 1", wallet: { principal: 0, bonus: 0, silver: 0 }, vouchers: [], tags: [], fragments: {} },
    u_002: { uid: "u_002", displayName: "User 2", wallet: { principal: 0, bonus: 0, silver: 0 }, vouchers: [], tags: [], fragments: {} }
  };
  db.paymentsByMerchant[merchantId] = {};
  db.invoicesByMerchant[merchantId] = {};
  db.policyOs = db.policyOs || {};
  db.policyOs.decisions = db.policyOs.decisions || {};
  const releaseGateService = createReleaseGateService(db);
  const experimentService = createExperimentService(db, { releaseGateService });
  return {
    db,
    merchantId,
    experimentService
  };
}

function addDecision({
  db,
  merchantId,
  decisionId,
  userId,
  outcome = "HIT",
  event = "USER_ENTER_SHOP",
  cost = 2
}) {
  db.policyOs.decisions[decisionId] = {
    decision_id: decisionId,
    merchant_id: merchantId,
    user_id: userId,
    event,
    mode: "EXECUTE",
    event_id: `${event.toLowerCase()}_${decisionId}`,
    created_at: new Date().toISOString(),
    executed: outcome === "HIT" ? ["policy_demo"] : [],
    rejected: outcome === "BLOCKED" ? [{ policyId: "policy_demo", reason: "constraint:budget_cap" }] : [],
    projected: [{ policy_id: "policy_demo", estimated_cost: cost }]
  };
}

function addPayment({
  db,
  merchantId,
  paymentTxnId,
  userId,
  status = "PAID",
  amount = 100,
  refundedAmount = 0
}) {
  db.paymentsByMerchant[merchantId][paymentTxnId] = {
    paymentTxnId,
    merchantId,
    userId,
    status,
    orderAmount: amount,
    refundedAmount,
    createdAt: new Date().toISOString()
  };
}

test("S110 service: config and metrics snapshot are available", async () => {
  const { db, merchantId, experimentService } = createSuiteContext("m_s110_srv_cfg_001");
  addDecision({
    db,
    merchantId,
    decisionId: "decision_001",
    userId: "u_001",
    outcome: "HIT"
  });
  addDecision({
    db,
    merchantId,
    decisionId: "decision_002",
    userId: "u_002",
    outcome: "BLOCKED"
  });
  addPayment({
    db,
    merchantId,
    paymentTxnId: "pay_001",
    userId: "u_001",
    status: "PAID",
    amount: 120
  });
  addPayment({
    db,
    merchantId,
    paymentTxnId: "pay_002",
    userId: "u_002",
    status: "EXTERNAL_FAILED",
    amount: 80
  });

  const config = experimentService.setConfig({
    merchantId,
    operatorId: "owner_001",
    config: {
      enabled: true,
      trafficPercent: 50,
      targetEvent: "USER_ENTER_SHOP",
      optimizationMode: "MANUAL"
    }
  });
  assert.equal(config.enabled, true);
  assert.equal(config.status, "RUNNING");
  assert.equal(config.trafficPercent, 50);

  const snapshot = experimentService.getSnapshot({
    merchantId
  });
  assert.equal(snapshot.version, "S110-SRV-01.v1");
  assert.equal(snapshot.config.enabled, true);
  assert.equal(snapshot.event, "USER_ENTER_SHOP");
  assert.ok(snapshot.groups.control.decisionCount + snapshot.groups.treatment.decisionCount >= 2);
  assert.ok(typeof snapshot.uplift.merchantRevenueUplift === "number");
  assert.ok(["PASS", "FAIL", "UNKNOWN"].includes(String(snapshot.risk.status)));
});

test("S110 service: rollback closes experiment and records history", async () => {
  const { merchantId, experimentService } = createSuiteContext("m_s110_srv_rollback_001");
  experimentService.setConfig({
    merchantId,
    operatorId: "owner_001",
    config: {
      enabled: true,
      trafficPercent: 30
    }
  });

  const rollback = experimentService.rollback({
    merchantId,
    operatorId: "owner_001",
    reason: "manual rollback for risk"
  });
  assert.equal(rollback.config.enabled, false);
  assert.equal(rollback.config.status, "ROLLED_BACK");
  assert.equal(rollback.rollback.reason, "manual rollback for risk");

  const latestConfig = experimentService.getConfig({ merchantId });
  assert.equal(latestConfig.enabled, false);
  assert.equal(latestConfig.status, "ROLLED_BACK");

  const snapshot = experimentService.getSnapshot({ merchantId });
  assert.ok(Array.isArray(snapshot.rollback.history));
  assert.ok(snapshot.rollback.history.length >= 1);
  assert.equal(snapshot.rollback.history[0].reason, "manual rollback for risk");
});

test("S110 service: guardrail failure is surfaced in risk snapshot", async () => {
  const { db, merchantId, experimentService } = createSuiteContext("m_s110_srv_risk_001");
  addPayment({
    db,
    merchantId,
    paymentTxnId: "pay_ok_001",
    userId: "u_001",
    status: "PAID",
    amount: 100
  });
  addPayment({
    db,
    merchantId,
    paymentTxnId: "pay_fail_001",
    userId: "u_002",
    status: "EXTERNAL_FAILED",
    amount: 100
  });

  experimentService.setConfig({
    merchantId,
    operatorId: "owner_001",
    config: {
      enabled: true,
      guardrails: {
        minPaymentSuccessRate30: 0.9
      }
    }
  });

  const snapshot = experimentService.getSnapshot({ merchantId });
  assert.equal(snapshot.risk.status, "FAIL");
  assert.ok(
    Array.isArray(snapshot.risk.reasons) &&
      snapshot.risk.reasons.includes("PAYMENT_SUCCESS_RATE_GUARDRAIL_BREACHED")
  );
});

