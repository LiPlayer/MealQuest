const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createActivationSpec(merchantId, patch = {}) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "activation_checkin_streak_recovery"
  );
  if (!template) {
    throw new Error("activation_checkin_streak_recovery template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("activation_checkin_streak_recovery default branch not found");
  }
  const base = deepClone(branch.policySpec || {});
  return {
    ...base,
    ...deepClone(patch || {}),
    resource_scope: {
      merchant_id: merchantId
    },
    governance: {
      approval_required: true,
      approval_level: "OWNER",
      approval_token_ttl_sec: 3600,
      ...deepClone((base && base.governance) || {}),
      ...deepClone((patch && patch.governance) || {})
    }
  };
}

function buildSuiteContext({ merchantId = "m_s120" } = {}) {
  const db = createInMemoryDb();
  db.save = () => {};
  db.merchants[merchantId] = {
    merchantId,
    name: "S120 Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "S120 User 1",
      wallet: { principal: 30, bonus: 0, silver: 0 },
      tags: [],
      fragments: {},
      vouchers: []
    },
    u_002: {
      uid: "u_002",
      displayName: "S120 User 2",
      wallet: { principal: 30, bonus: 0, silver: 0 },
      tags: [],
      fragments: {},
      vouchers: []
    }
  };
  const policyOsService = createPolicyOsService(db);
  return {
    db,
    merchantId,
    policyOsService
  };
}

function publishActivationPolicy({ policyOsService, merchantId, patch = {} }) {
  const spec = createActivationSpec(merchantId, patch);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "owner",
    spec,
    templateId: "activation_checkin_streak_recovery"
  });
  policyOsService.submitDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "owner"
  });
  const approval = policyOsService.approveDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "owner"
  });
  return policyOsService.publishDraft({
    merchantId,
    draftId: draft.draft_id,
    operatorId: "owner",
    approvalId: approval.approvalId
  });
}

test("S120 hit case: ACT_CHECKIN_STREAK_RECOVERY_V1 executes for low-activity streak user", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const published = publishActivationPolicy({ policyOsService, merchantId });
  assert.ok(String(published.policy.policy_id || "").startsWith("ACT_CHECKIN_STREAK_RECOVERY_V1@v"));

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 8,
      checkinStreakDays: 3,
      riskScore: 0
    }
  });
  assert.equal(decision.mode, "EXECUTE");
  assert.equal(decision.executed.length, 1);
  assert.ok(String(decision.executed[0]).startsWith("ACT_CHECKIN_STREAK_RECOVERY_V1@v"));
});

test("S120 low activity case: non-low-activity user is not selected", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishActivationPolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 2,
      checkinStreakDays: 3,
      riskScore: 0
    }
  });
  assert.equal(decision.executed.length, 0);
  assert.ok(
    decision.rejected.some((item) =>
      String(item.reason || "").includes("segment_mismatch")
    )
  );
});

test("S120 streak case: streak below threshold is not selected", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishActivationPolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 9,
      checkinStreakDays: 2,
      riskScore: 0
    }
  });
  assert.equal(decision.executed.length, 0);
  assert.ok(
    decision.rejected.some((item) =>
      String(item.reason || "").includes("segment_mismatch")
    )
  );
});

test("S120 risk case: anti-fraud blocks high-risk request", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishActivationPolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 8,
      checkinStreakDays: 3,
      riskScore: 0.95
    }
  });
  assert.equal(decision.executed.length, 0);
  assert.ok(
    decision.rejected.some((item) =>
      String(item.reason || "").includes("constraint:anti_fraud_blocked")
    )
  );
});

test("S120 frequency case: repeated trigger within 7d is blocked", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishActivationPolicy({ policyOsService, merchantId });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 8,
      checkinStreakDays: 3,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      inactiveDays: 8,
      checkinStreakDays: 4,
      riskScore: 0
    }
  });
  assert.equal(second.executed.length, 0);
  assert.ok(
    second.rejected.some((item) =>
      String(item.reason || "").includes("constraint:frequency_exceeded")
    )
  );
});

test("S120 completeness gate: incomplete action params are blocked before draft workflow", () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const incompleteSpec = createActivationSpec(merchantId);
  incompleteSpec.actions = [
    {
      plugin: "fragment_grant_v1",
      channel: "default",
      params: {
        type: "common"
      }
    }
  ];

  assert.throws(() => {
    policyOsService.createDraft({
      merchantId,
      operatorId: "owner",
      spec: incompleteSpec,
      templateId: "activation_checkin_streak_recovery"
    });
  }, /policy action params incomplete/);
});
