const {
  sendJson,
  sendNotModified,
  ensureRole,
  enforceTenantPolicyForHttp,
  buildWeakEtag,
  isIfNoneMatchFresh,
} = require("../serverHelpers");
const { buildStateSnapshot } = require("./stateSnapshot");

function createSystemRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  getServicesForDb,
  tenantRouter,
  MERCHANT_ROLES,
  appendAuditLog,
  wsHub,
}) {
  return async function handleSystemRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/state") {
      const merchantId = url.searchParams.get("merchantId");
      const userId = url.searchParams.get("userId");
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.role === "CUSTOMER" && !userId) {
        sendJson(res, 400, { error: "userId is required for customer role" });
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

      const merchant = await tenantRepository.getMerchant(merchantId);
      const user = userId ? await tenantRepository.getMerchantUser(merchantId, userId) : null;
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (userId && !user && auth.role === "CUSTOMER") {
        sendJson(res, 404, { error: "user not found" });
        return true;
      }

      const payload = await buildStateSnapshot({
        merchantId,
        userId,
        tenantRouter,
        tenantRepository,
        getServicesForDb,
      });
      const etag = buildWeakEtag(payload);
      const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      };
      if (isIfNoneMatchFresh(req, etag)) {
        sendNotModified(res, cacheHeaders);
        return true;
      }
      sendJson(res, 200, payload, cacheHeaders);
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

      const result = await tenantRepository.listAuditLogs({
        merchantId,
        limit: url.searchParams.get("limit"),
        cursor: url.searchParams.get("cursor") || "",
        startTime: url.searchParams.get("startTime") || "",
        endTime: url.searchParams.get("endTime") || "",
        action: url.searchParams.get("action") || "",
        status: url.searchParams.get("status") || "",
      });
      const etag = buildWeakEtag(result);
      const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      };
      if (isIfNoneMatchFresh(req, etag)) {
        sendNotModified(res, cacheHeaders);
        return true;
      }
      sendJson(res, 200, result, cacheHeaders);
      return true;
    }

    return false;
  };
}

module.exports = {
  createSystemRoutesHandler,
};
