const {
  sendJson,
  ensureRole,
  buildCustomerActivities,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

function createSystemRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  getServicesForDb,
  tenantRouter,
  MERCHANT_ROLES,
  appendAuditLog,
  wsHub,
}) {
  return async function handleSystemRoutes({ method, url, auth, res }) {
    if (method === "GET" && url.pathname === "/api/state") {
      const merchantId = url.searchParams.get("merchantId");
      const userId = url.searchParams.get("userId");
      if (!merchantId || !userId) {
        sendJson(res, 400, { error: "merchantId and userId are required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (auth.role === "CUSTOMER" && auth.userId !== userId) {
        sendJson(res, 403, { error: "user scope denied" });
        return true;
      }

      const scopedDb = tenantRouter.getDbForMerchant(merchantId);
      const { merchantService, allianceService } = getServicesForDb(scopedDb);
      const merchant = tenantRepository.getMerchant(merchantId);
      const user = tenantRepository.getMerchantUser(merchantId, userId);
      if (!merchant || !user) {
        sendJson(res, 404, { error: "merchant or user not found" });
        return true;
      }

      const campaigns = tenantRepository.listCampaigns(merchantId);
      sendJson(res, 200, {
        merchant,
        user,
        dashboard: merchantService.getDashboard({ merchantId }),
        campaigns,
        proposals: tenantRepository.listProposals(merchantId),
        strategyConfigs: tenantRepository.listStrategyConfigs(merchantId),
        activities: buildCustomerActivities(campaigns),
        allianceConfig: allianceService.getAllianceConfig({ merchantId }),
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/ws/status") {
      ensureRole(auth, MERCHANT_ROLES);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (auth.merchantId && merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "WS_STATUS_QUERY",
          res,
          auth,
        })
      ) {
        return true;
      }
      sendJson(res, 200, {
        merchantId,
        onlineCount: wsHub.getOnlineCount(merchantId),
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/audit/logs") {
      ensureRole(auth, MERCHANT_ROLES);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AUDIT_QUERY",
          res,
          auth,
        })
      ) {
        return true;
      }

      const result = tenantRepository.listAuditLogs({
        merchantId,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor") || "",
        startTime: url.searchParams.get("startTime") || "",
        endTime: url.searchParams.get("endTime") || "",
        action: url.searchParams.get("action") || "",
        status: url.searchParams.get("status") || "",
      });
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createSystemRoutesHandler,
};
