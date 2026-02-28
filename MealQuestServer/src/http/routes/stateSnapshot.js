const { buildCustomerActivities } = require("../serverHelpers");

function laneToPriority(lane = "") {
  const normalized = String(lane || "").toUpperCase();
  if (normalized === "EMERGENCY") {
    return 100;
  }
  if (normalized === "GUARDED") {
    return 85;
  }
  if (normalized === "NORMAL") {
    return 60;
  }
  return 40;
}

function toPolicyView(policy) {
  const safe = policy && typeof policy === "object" ? policy : {};
  const firstTrigger =
    Array.isArray(safe.triggers) && safe.triggers[0] && typeof safe.triggers[0] === "object"
      ? safe.triggers[0]
      : {};
  const segmentConditions =
    safe.segment &&
    safe.segment.params &&
    Array.isArray(safe.segment.params.conditions)
      ? safe.segment.params.conditions
      : [];
  const budgetConstraint =
    Array.isArray(safe.constraints) &&
    safe.constraints.find(
      (item) => item && item.plugin === "budget_guard_v1" && item.params
    );
  return {
    id: safe.policy_id || "",
    merchantId:
      safe.resource_scope && safe.resource_scope.merchant_id
        ? safe.resource_scope.merchant_id
        : "",
    name: safe.name || "",
    status: safe.status || "ACTIVE",
    priority: laneToPriority(safe.lane),
    trigger: {
      event: String(firstTrigger.event || "").toUpperCase()
    },
    conditions: segmentConditions,
    budget: {
      used: 0,
      cap: Number(budgetConstraint && budgetConstraint.params.cap) || 0,
      costPerHit: Number(budgetConstraint && budgetConstraint.params.cost_per_hit) || 0
    },
    action:
      safe.story && typeof safe.story === "object"
        ? {
            type: "STORY_CARD",
            story: safe.story
          }
        : null,
    strategyMeta: {
      category: safe.goal && safe.goal.type ? safe.goal.type : "ACTIVATION"
    }
  };
}

async function buildStateSnapshot({
  merchantId,
  userId,
  tenantRouter,
  tenantRepository,
  getServicesForDb,
}) {
  const scopedDb = tenantRouter.getDbForMerchant(merchantId);
  const { merchantService, allianceService } = getServicesForDb(scopedDb);
  const merchant = await tenantRepository.getMerchant(merchantId);
  const user = userId ? await tenantRepository.getMerchantUser(merchantId, userId) : null;
  const allianceConfig = await allianceService.getAllianceConfig({ merchantId });
  const dashboard = await merchantService.getDashboard({ merchantId });
  const { policyOsService } = getServicesForDb(scopedDb);
  const policyDrafts = policyOsService.listDrafts({ merchantId });
  const allPolicies = policyOsService.listPolicies({ merchantId, includeInactive: true });
  const activePolicies = policyOsService.listActivePolicies({ merchantId });
  const activePolicyViews = activePolicies.map((item) => toPolicyView(item));

  return {
    merchant,
    user,
    dashboard,
    policies: activePolicyViews,
    proposals: await tenantRepository.listProposals(merchantId),
    strategyConfigs: await tenantRepository.listStrategyConfigs(merchantId),
    activities: buildCustomerActivities(activePolicyViews),
    allianceConfig,
    policyOs: {
      draftCount: policyDrafts.length,
      policyCount: allPolicies.length,
      activePolicyCount: activePolicies.length,
      drafts: policyDrafts,
      policies: allPolicies,
      plugins: policyOsService.listPlugins()
    }
  };
}

module.exports = {
  buildStateSnapshot,
};
