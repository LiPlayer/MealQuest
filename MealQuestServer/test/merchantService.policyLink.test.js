const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createMerchantService } = require("../src/services/merchantService");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const { createPolicySpecFromTemplate } = require("../src/services/strategyLibrary");

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

test("merchant service links AI proposal simulate -> approve -> publish lifecycle", async () => {
  const db = createInMemoryDb();
  db.save = () => {};
  seedMerchant(db);
  const policyOsService = createPolicyOsService(db);
  const { spec, template, branch } = createPolicySpecFromTemplate({
    merchantId: "m_policy_link",
    templateId: "acquisition_welcome_gift",
    branchId: "DEFAULT"
  });
  const merchantService = createMerchantService(db, {
    policyOsService,
    aiStrategyService: {
      async generateStrategyChatTurn() {
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

  const reviewed = await merchantService.reviewStrategyChatProposal({
    merchantId: "m_policy_link",
    proposalId: turn.pendingReview.proposalId,
    decision: "APPROVE",
    operatorId: "staff_owner"
  });
  assert.equal(reviewed.status, "APPROVED");
  assert.ok(reviewed.draftId);
  assert.ok(reviewed.approvalId);

  const simulated = await merchantService.simulateProposalPolicy({
    merchantId: "m_policy_link",
    proposalId: turn.pendingReview.proposalId,
    operatorId: "staff_owner",
    userId: "u_001",
    event: "APP_OPEN"
  });
  assert.ok(simulated.simulation);
  assert.equal(simulated.simulation.mode, "SIMULATE");

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
