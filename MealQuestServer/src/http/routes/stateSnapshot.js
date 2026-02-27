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

  return {
    merchant,
    user,
    dashboard,
    campaigns,
    proposals: await tenantRepository.listProposals(merchantId),
    strategyConfigs: await tenantRepository.listStrategyConfigs(merchantId),
    activities: buildCustomerActivities(campaigns),
    allianceConfig,
  };
}

module.exports = {
  buildStateSnapshot,
};
