const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const templateCatalog = require("../src/policyos/templates/strategy-templates.v1.json");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWelcomeSpec(merchantId, patch = {}) {
  const template = (templateCatalog.templates || []).find(
    (item) => item && item.templateId === "acquisition_welcome_gift"
  );
  if (!template) {
    throw new Error("acquisition_welcome_gift template not found");
  }
  const branch = (template.branches || []).find((item) => item && item.branchId === "DEFAULT");
  if (!branch) {
    throw new Error("acquisition_welcome_gift default branch not found");
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

function buildSuiteContext({ merchantId = "m_s110" } = {}) {
  const db = createInMemoryDb();
  db.save = () => {};
  db.merchants[merchantId] = {
    merchantId,
    name: "S110 Merchant",
    killSwitchEnabled: false,
    budgetCap: 1000,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "S110 User 1",
      wallet: { principal: 30, bonus: 0, silver: 0 },
      tags: [],
      fragments: {},
      vouchers: []
    },
    u_002: {
      uid: "u_002",
      displayName: "S110 User 2",
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

function publishWelcomePolicy({ policyOsService, merchantId, patch = {} }) {
  const spec = createWelcomeSpec(merchantId, patch);
  const draft = policyOsService.createDraft({
    merchantId,
    operatorId: "owner",
    spec,
    templateId: "acquisition_welcome_gift"
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

test("S110 hit case: ACQ_WELCOME_FIRST_BIND_V1 executes for new user", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const published = publishWelcomePolicy({ policyOsService, merchantId });
  assert.ok(String(published.policy.policy_id || "").startsWith("ACQ_WELCOME_FIRST_BIND_V1@v"));

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
      riskScore: 0
    }
  });
  assert.equal(decision.mode, "EXECUTE");
  assert.equal(decision.executed.length, 1);
  assert.ok(String(decision.executed[0]).startsWith("ACQ_WELCOME_FIRST_BIND_V1@v"));
});

test("S110 budget case: second user is blocked when budget is exhausted", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const spec = createWelcomeSpec(merchantId);
  upsertConstraint(spec, "budget_guard_v1", {
    cap: 6,
    cost_per_hit: 6
  });
  publishWelcomePolicy({ policyOsService, merchantId, patch: spec });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_002",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
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

test("S110 inventory case: second user is blocked when welcome inventory is exhausted", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  const spec = createWelcomeSpec(merchantId);
  upsertConstraint(spec, "inventory_lock_v1", {
    sku: "welcome_gift_pool",
    max_units: 1,
    reserve_units: 1
  });
  publishWelcomePolicy({ policyOsService, merchantId, patch: spec });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_002",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
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

test("S110 risk case: anti-fraud blocks high-risk request", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishWelcomePolicy({ policyOsService, merchantId });

  const decision = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
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

test("S110 repeat case: repeated trigger is blocked by frequency cap", async () => {
  const { policyOsService, merchantId } = buildSuiteContext();
  publishWelcomePolicy({ policyOsService, merchantId });

  const first = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
      riskScore: 0
    }
  });
  assert.equal(first.executed.length, 1);

  const second = await policyOsService.executeDecision({
    merchantId,
    userId: "u_001",
    event: "USER_ENTER_SHOP",
    context: {
      isNewUser: true,
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
