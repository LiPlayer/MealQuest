const {
  readJsonBody,
  sendJson,
  ensureRole,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

function createAllianceRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  MERCHANT_ROLES,
  appendAuditLog,
}) {
  return async function handleAllianceRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/merchant/alliance-config") {
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
      const { allianceService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, allianceService.getAllianceConfig({ merchantId }));
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/alliance-config") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
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
          operation: "ALLIANCE_CONFIG_SET",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { allianceService } = getServicesForMerchant(merchantId);
      const result = allianceService.setAllianceConfig({
        merchantId,
        clusterId: body.clusterId,
        stores: body.stores,
        walletShared: body.walletShared,
        tierShared: body.tierShared,
      });
      appendAuditLog({
        merchantId,
        action: "ALLIANCE_CONFIG_SET",
        status: "SUCCESS",
        auth,
        details: {
          clusterId: result.clusterId,
          stores: result.stores,
          walletShared: result.walletShared,
          tierShared: result.tierShared,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/stores") {
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
      const { allianceService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, allianceService.listStores({ merchantId }));
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/alliance/sync-user") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId || !body.userId) {
        sendJson(res, 400, { error: "merchantId and userId are required" });
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
          operation: "ALLIANCE_SYNC_USER",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { allianceService } = getServicesForMerchant(merchantId);
      const result = allianceService.syncUserAcrossStores({
        merchantId,
        userId: body.userId,
      });
      appendAuditLog({
        merchantId,
        action: "ALLIANCE_SYNC_USER",
        status: "SUCCESS",
        auth,
        details: {
          userId: body.userId,
          syncedStores: result.syncedStores,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createAllianceRoutesHandler,
};
