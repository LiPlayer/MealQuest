const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRetentionSpec(merchantId, patch = {}) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "retention_dormant_winback_14d"
  );
  if (!template) {
    throw new Error("retention_dormant_winback_14d template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("retention_dormant_winback_14d default branch not found");
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

function upsertConstraint(spec, plugin, params) {
  const constraints = Array.isArray(spec.constraints) ? [...spec.constraints] : [];
  const next = constraints.filter((item) => item && item.plugin !== plugin);
  next.push({
    plugin,
    params: { ...(params || {}) }
  });
  spec.constraints = next;
}

function buildSuiteContext({ merchantId = "m_s140" } = {}) {
  const db = createInMemoryDb();
  db.save = () => {};
  db.merchants[merchantId] = {
    merchantId,
    name: "S140 Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "S140 User 1",
      wallet: { principal: 100, bonus: 0, silver: 0 },
      tags: [],
      fragments: {},
      vouchers: []
    },
    u_002: {
      uid: "u_002",
      displayName: "S140 User 2",
      wallet: { principal: 100, bonus: 0, silver: 0 },
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

function publishRetentionPolicy({ policyOsService, merchantId, patch = {} }) {
  const spec = createRetentionSpec(merchantId, patch);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "owner",
    spec,
    templateId: "retention_dormant_winback_14d"
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

test("S140 hit case: RET_DORMANT_WINBACK_14D_V1 executes for dormant existing customer", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const published = publishRetentionPolicy({ policyOsService, merchantId });
  assert.ok(String(published.policy.policy_id || "").startsWith("RET_DORMANT_WINBACK_14D_V1@v"));

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 15,
      riskScore: 0
    }
  });
  assert.equal(decision.mode, "EXECUTE");
  assert.equal(decision.executed.length, 1);
  assert.ok(String(decision.executed[0]).startsWith("RET_DORMANT_WINBACK_14D_V1@v"));
});

test("S140 dormant case: user below 14 inactive days is blocked", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishRetentionPolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 6,
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

test("S140 budget case: second user is blocked when retention budget is exhausted", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const spec = createRetentionSpec(merchantId);
  upsertConstraint(spec, "budget_guard_v1", {
    cap: 3,
    cost_per_hit: 3
  });
  publishRetentionPolicy({ policyOsService, merchantId, patch: spec });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 18,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_002",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 20,
      riskScore: 0
    }
  });
  assert.equal(second.executed.length, 0);
  assert.ok(
    second.rejected.some((item) =>
      String(item.reason || "").includes("constraint:budget_cap_exceeded")
    )
  );
});

test("S140 frequency case: repeated trigger within 14d is blocked", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishRetentionPolicy({ policyOsService, merchantId });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 15,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 16,
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

test("S140 risk case: anti-fraud blocks high-risk request", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishRetentionPolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: false,
      inactiveDays: 15,
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

test("S140 completeness gate: incomplete dormant segment is blocked before draft workflow", () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const incompleteSpec = createRetentionSpec(merchantId);
  incompleteSpec.segment = {
    plugin: "condition_segment_v1",
    params: {
      logic: "AND",
      conditions: [
        {
          field: "isNewUser",
          op: "eq",
          value: false
        }
      ]
    }
  };

  assert.throws(() => {
    policyOsService.createDraft({
      merchantId,
      operatorId: "owner",
      spec: incompleteSpec,
      templateId: "retention_dormant_winback_14d"
    });
  }, /policy action params incomplete: RET_DORMANT_WINBACK_14D_V1/);
});
