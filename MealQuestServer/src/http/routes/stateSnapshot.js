const { buildCustomerActivities } = require("../serverHelpers");

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
  const campaigns = await tenantRepository.listCampaigns(merchantId);
  const allianceConfig = await allianceService.getAllianceConfig({ merchantId });
  const dashboard = await merchantService.getDashboard({ merchantId });
  const { policyOsService } = getServicesForDb(scopedDb);
  const policyDrafts = policyOsService.listDrafts({ merchantId });
  const policies = policyOsService.listPolicies({ merchantId, includeInactive: true });
  const activePolicies = policyOsService.listActivePolicies({ merchantId });

  return {
    merchant,
    user,
    dashboard,
    campaigns,
    proposals: await tenantRepository.listProposals(merchantId),
    strategyConfigs: await tenantRepository.listStrategyConfigs(merchantId),
    activities: buildCustomerActivities(campaigns),
    allianceConfig,
    policyOs: {
      draftCount: policyDrafts.length,
      policyCount: policies.length,
      activePolicyCount: activePolicies.length,
      drafts: policyDrafts,
      policies,
      plugins: policyOsService.listPlugins()
    }
  };
}

module.exports = {
  buildStateSnapshot,
};
