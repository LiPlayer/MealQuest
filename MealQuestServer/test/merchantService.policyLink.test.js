const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createMerchantService } = require("../src/services/merchantService");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const { createPolicySpecFromTemplate } = require("../src/services/strategyAgent/templateCatalog");

function seedMerchant(db, merchantId = "m_policy_link") {
  db.merchants[merchantId] = {
    merchantId,
    name: "Policy Link Merchant",
    killSwitchEnabled: false,
    budgetCap: 600,
    budgetUsed: 0
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "Policy Link User",
      wallet: {
        principal: 10,
        bonus: 0,
        silver: 0
      },
      tags: ["REGULAR"],
      fragments: {},
      vouchers: []
    }
  };
  db.paymentsByMerchant[merchantId] = {};
  db.invoicesByMerchant[merchantId] = {};
  db.strategyConfigs[merchantId] = {};
  db.strategyChats[merchantId] = {
    activeSessionId: null,
    sessions: {}
  };
}

test("merchant service links AI proposal evaluate -> approve -> publish lifecycle", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchant(db);
  const policyOsService = createPolicyOsService(db);
  const rawEvaluateDecision = policyOsService.evaluateDecision.bind(policyOsService);
  let evaluateCalls = 0;
  policyOsService.evaluateDecision = async (...args) => {
    evaluateCalls += 1;
    return rawEvaluateDecision(...args);
  };
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: "m_policy_link",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const triggerEvent = String((spec.triggers && spec.triggers[0] && spec.triggers[0].event) || "APP_OPEN")
    .trim()
    .toUpperCase();
  const merchantService = createMerchantService(db, {
    policyOsService,
    strategyAgentService: {
      async *streamStrategyChatTurn() {
        return {
          status: "PROPOSAL_READY",
          assistantMessage: "Strategy drafted.",
          proposals: [
            {
              title: "Policy Link Candidate",
              spec,
              template,
              branch,
              strategyMeta: {
                confidence: 0.8
              }
            }
          ]
        };
      }
    }
  });

  const turn = await merchantService.sendStrategyChatMessage({
    merchantId: "m_policy_link",
    operatorId: "staff_owner",
    content: "Please create strategy proposal now."
  });
  assert.equal(turn.status, "PENDING_REVIEW");
  assert.ok(turn.pendingReview);
  assert.ok(turn.pendingReview.policyDraftId);
  assert.equal(evaluateCalls, 1);

  const reviewed = await merchantService.reviewStrategyChatProposal({
    merchantId: "m_policy_link",
    proposalId: turn.pendingReview.proposalId,
    decision: "APPROVE",
    operatorId: "staff_owner"
  });
  assert.equal(reviewed.status, "APPROVED");
  assert.ok(reviewed.draftId);
  assert.ok(reviewed.approvalId);

  const evaluated = await merchantService.evaluateProposalPolicy({
    merchantId: "m_policy_link",
    proposalId: turn.pendingReview.proposalId,
    operatorId: "staff_owner",
    userId: "u_001",
    event: triggerEvent
  });
  assert.ok(evaluated.evaluation);
  assert.equal(evaluated.evaluation.mode, "EVALUATE");
  assert.equal(evaluated.reused, true);
  assert.equal(evaluateCalls, 1);

  const published = await merchantService.publishApprovedProposalPolicy({
    merchantId: "m_policy_link",
    proposalId: turn.pendingReview.proposalId,
    operatorId: "staff_owner"
  });
  assert.ok(published.policyId);

  const activePolicies = policyOsService.listActivePolicies({
    merchantId: "m_policy_link"
  });
  assert.equal(activePolicies.length, 1);
  assert.equal(activePolicies[0].policy_id, published.policyId);
});

test("merchant service auto-evaluates and ranks multiple proposal candidates", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchant(db, "m_policy_rank");
  const policyOsService = createPolicyOsService(db);
  const base = createPolicySpecFromTemplate({
    merchantId: "m_policy_rank",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const candidateA = {
    ...base,
    spec: {
      ...base.spec,
      name: "Candidate A",
      policy_key: "ai.rank.a"
    },
    strategyMeta: {
      confidence: 0.2
    },
    title: "Candidate A"
  };
  const candidateB = {
    ...base,
    spec: {
      ...base.spec,
      name: "Candidate B",
      policy_key: "ai.rank.b"
    },
    strategyMeta: {
      confidence: 0.9
    },
    title: "Candidate B"
  };

  const merchantService = createMerchantService(db, {
    policyOsService,
    strategyAgentService: {
      async *streamStrategyChatTurn() {
        return {
          status: "PROPOSAL_READY",
          assistantMessage: "Two strategies drafted.",
          proposals: [candidateA, candidateB]
        };
      }
    }
  });

  const turn = await merchantService.sendStrategyChatMessage({
    merchantId: "m_policy_rank",
    operatorId: "staff_owner",
    content: "Generate best strategy candidates."
  });

  assert.equal(turn.status, "PENDING_REVIEW");
  assert.ok(Array.isArray(turn.pendingReviews));
  assert.equal(turn.pendingReviews.length, 2);
  assert.ok(turn.pendingReviews[0].evaluation);
  assert.equal(turn.pendingReviews[0].evaluation.rank, 1);
  assert.equal(turn.pendingReviews[0].evaluation.recommended, true);
  assert.equal(turn.pendingReviews[0].title, "Candidate B");
});

test("merchant service requires evaluation before approving proposal", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchant(db, "m_policy_no_sim");
  const policyOsService = createPolicyOsService(db);
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: "m_policy_no_sim",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const merchantService = createMerchantService(db, {
    policyOsService,
    strategyAgentService: null
  });

  db.proposals.push({
    id: "proposal_no_sim",
    merchantId: "m_policy_no_sim",
    status: "PENDING",
    title: "Manual Proposal",
    createdAt: new Date().toISOString(),
    intent: "",
    strategyMeta: {
      templateId: template.templateId,
      branchId: branch.branchId
    },
    suggestedPolicySpec: spec,
    policyWorkflow: {
      draftId: null,
      policyId: null,
      approvalId: null,
      status: "DRAFT",
      publishedAt: null
    }
  });

  await assert.rejects(
    merchantService.approveProposalPolicy({
      merchantId: "m_policy_no_sim",
      proposalId: "proposal_no_sim",
      operatorId: "staff_owner"
    }),
    /evaluated before approve/
  );
});

test("merchant service supports force refresh evaluation after cached auto evaluation", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchant(db, "m_policy_force_refresh");
  const policyOsService = createPolicyOsService(db);
  const rawEvaluateDecision = policyOsService.evaluateDecision.bind(policyOsService);
  let evaluateCalls = 0;
  policyOsService.evaluateDecision = async (...args) => {
    evaluateCalls += 1;
    return rawEvaluateDecision(...args);
  };
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: "m_policy_force_refresh",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const triggerEvent = String((spec.triggers && spec.triggers[0] && spec.triggers[0].event) || "APP_OPEN")
    .trim()
    .toUpperCase();
  const merchantService = createMerchantService(db, {
    policyOsService,
    strategyAgentService: {
      async *streamStrategyChatTurn() {
        return {
          status: "PROPOSAL_READY",
          assistantMessage: "Strategy drafted.",
          proposals: [
            {
              title: "Policy Force Refresh Candidate",
              spec,
              template,
              branch,
              strategyMeta: {
                confidence: 0.75
              }
            }
          ]
        };
      }
    }
  });

  const turn = await merchantService.sendStrategyChatMessage({
    merchantId: "m_policy_force_refresh",
    operatorId: "staff_owner",
    content: "Please create strategy proposal now."
  });
  assert.equal(turn.status, "PENDING_REVIEW");
  assert.equal(evaluateCalls, 1);

  const reused = await merchantService.evaluateProposalPolicy({
    merchantId: "m_policy_force_refresh",
    proposalId: turn.pendingReview.proposalId,
    operatorId: "staff_owner",
    userId: "u_001",
    event: triggerEvent
  });
  assert.equal(reused.reused, true);
  assert.equal(evaluateCalls, 1);

  const refreshed = await merchantService.evaluateProposalPolicy({
    merchantId: "m_policy_force_refresh",
    proposalId: turn.pendingReview.proposalId,
    operatorId: "staff_owner",
    userId: "u_001",
    event: triggerEvent,
    forceRefresh: true
  });
  assert.equal(refreshed.reused, false);
  assert.equal(evaluateCalls, 2);
});
