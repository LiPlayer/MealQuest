const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRevenueSpec(merchantId, patch = {}) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "revenue_addon_upsell_slow_item"
  );
  if (!template) {
    throw new Error("revenue_addon_upsell_slow_item template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("revenue_addon_upsell_slow_item default branch not found");
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

function buildSuiteContext({ merchantId = "m_s130" } = {}) {
  const db = createInMemoryDb();
  db.save = () => {};
  db.merchants[merchantId] = {
    merchantId,
    name: "S130 Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "S130 User 1",
      wallet: { principal: 100, bonus: 0, silver: 0 },
      tags: [],
      fragments: {},
      vouchers: []
    },
    u_002: {
      uid: "u_002",
      displayName: "S130 User 2",
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

function publishRevenuePolicy({ policyOsService, merchantId, patch = {} }) {
  const spec = createRevenueSpec(merchantId, patch);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "owner",
    spec,
    templateId: "revenue_addon_upsell_slow_item"
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

test("S130 hit case: REV_ADDON_UPSELL_SLOW_ITEM_V1 executes on PAYMENT_VERIFY", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const published = publishRevenuePolicy({ policyOsService, merchantId });
  assert.ok(String(published.policy.policy_id || "").startsWith("REV_ADDON_UPSELL_SLOW_ITEM_V1@v"));

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 48,
      riskScore: 0
    }
  });
  assert.equal(decision.mode, "EXECUTE");
  assert.equal(decision.executed.length, 1);
  assert.ok(String(decision.executed[0]).startsWith("REV_ADDON_UPSELL_SLOW_ITEM_V1@v"));
});

test("S130 budget case: second user is blocked when revenue budget is exhausted", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const spec = createRevenueSpec(merchantId);
  upsertConstraint(spec, "budget_guard_v1", {
    cap: 2,
    cost_per_hit: 2
  });
  publishRevenuePolicy({ policyOsService, merchantId, patch: spec });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 40,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_002",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 40,
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

test("S130 inventory case: second user is blocked when strategy inventory is exhausted", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const spec = createRevenueSpec(merchantId);
  upsertConstraint(spec, "inventory_lock_v1", {
    sku: "slow_item_pool_test",
    max_units: 1,
    reserve_units: 1
  });
  publishRevenuePolicy({ policyOsService, merchantId, patch: spec });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 40,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_002",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 40,
      riskScore: 0
    }
  });
  assert.equal(second.executed.length, 0);
  assert.ok(
    second.rejected.some((item) =>
      String(item.reason || "").includes("constraint:inventory_exceeded")
    )
  );
});

test("S130 risk case: anti-fraud blocks high-risk request", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishRevenuePolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "PAYMENT_VERIFY",
    context: {
      orderAmount: 40,
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

test("S130 completeness gate: incomplete revenue action params are blocked before draft workflow", () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const incompleteSpec = createRevenueSpec(merchantId);
  upsertConstraint(incompleteSpec, "inventory_lock_v1", {
    sku: "",
    max_units: 100,
    reserve_units: 1
  });

  assert.throws(() => {
    policyOsService.createDraft({
      merchantId,
      operatorId: "owner",
      spec: incompleteSpec,
      templateId: "revenue_addon_upsell_slow_item"
    });
  }, /policy action params incomplete: REV_ADDON_UPSELL_SLOW_ITEM_V1/);
});
