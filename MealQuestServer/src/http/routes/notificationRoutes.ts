const {
  readJsonBody,
  sendJson,
  sendNotModified,
  ensureRole,
  enforceTenantPolicyForHttp,
  buildWeakEtag,
  isIfNoneMatchFresh,
  toListLimit
} = require("../serverHelpers");

const NOTIFICATION_ROLES = ["OWNER", "MANAGER", "CLERK", "CUSTOMER"];

function resolveRecipientFromAuth(auth = {}) {
  const role = String(auth.role || "").trim().toUpperCase();
  if (role === "CUSTOMER") {
    return {
      recipientType: "CUSTOMER_USER",
      recipientId: String(auth.userId || "").trim()
    };
  }
  return {
    recipientType: "MERCHANT_STAFF",
    recipientId: String(auth.operatorId || auth.userId || "").trim()
  };
}

function createNotificationRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  appendAuditLog
}) {
  return async function handleNotificationRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/notifications/inbox") {
      ensureRole(auth, NOTIFICATION_ROLES);
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
          operation: "NOTIFICATION_QUERY",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { notificationService } = getServicesForMerchant(merchantId);
      const recipient = resolveRecipientFromAuth(auth);
      if (!recipient.recipientId) {
        sendJson(res, 400, { error: "recipient identity is required" });
        return true;
      }
      const payload = notificationService.listInbox({
        merchantId,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        status: url.searchParams.get("status") || "ALL",
        category: url.searchParams.get("category") || "ALL",
        limit: toListLimit(url.searchParams.get("limit"), 20, 100),
        cursor: url.searchParams.get("cursor") || ""
      });
      appendAuditLog({
        merchantId,
        action: "NOTIFICATION_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          route: "inbox",
          status: payload.status,
          category: payload.category,
          returned: Array.isArray(payload.items) ? payload.items.length : 0
        }
      });
      const etag = buildWeakEtag(payload);
      const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      };
      if (isIfNoneMatchFresh(req, etag)) {
        sendNotModified(res, cacheHeaders);
        return true;
      }
      sendJson(res, 200, payload, cacheHeaders);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/notifications/unread-summary") {
      ensureRole(auth, NOTIFICATION_ROLES);
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
          operation: "NOTIFICATION_QUERY",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { notificationService } = getServicesForMerchant(merchantId);
      const recipient = resolveRecipientFromAuth(auth);
      if (!recipient.recipientId) {
        sendJson(res, 400, { error: "recipient identity is required" });
        return true;
      }
      const payload = notificationService.getUnreadSummary({
        merchantId,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId
      });
      appendAuditLog({
        merchantId,
        action: "NOTIFICATION_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          route: "unread-summary",
          totalUnread: Number(payload.totalUnread || 0)
        }
      });
      const etag = buildWeakEtag(payload);
      const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      };
      if (isIfNoneMatchFresh(req, etag)) {
        sendNotModified(res, cacheHeaders);
        return true;
      }
      sendJson(res, 200, payload, cacheHeaders);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/notifications/read") {
      ensureRole(auth, NOTIFICATION_ROLES);
      const body = await readJsonBody(req);
      const merchantId = body.merchantId || auth.merchantId;
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
          operation: "NOTIFICATION_ACK",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { notificationService } = getServicesForMerchant(merchantId);
      const recipient = resolveRecipientFromAuth(auth);
      if (!recipient.recipientId) {
        sendJson(res, 400, { error: "recipient identity is required" });
        return true;
      }
      const payload = notificationService.markRead({
        merchantId,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        notificationIds: Array.isArray(body.notificationIds) ? body.notificationIds : [],
        markAll: body.markAll === true
      });
      appendAuditLog({
        merchantId,
        action: "NOTIFICATION_ACK",
        status: "SUCCESS",
        auth,
        details: {
          updatedCount: Number(payload.updatedCount || 0),
          markAll: body.markAll === true
        }
      });
      sendJson(res, 200, payload);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/notifications/preferences") {
      ensureRole(auth, NOTIFICATION_ROLES);
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
          operation: "NOTIFICATION_PREFERENCE_QUERY",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { notificationService } = getServicesForMerchant(merchantId);
      const recipient = resolveRecipientFromAuth(auth);
      if (!recipient.recipientId) {
        sendJson(res, 400, { error: "recipient identity is required" });
        return true;
      }
      const payload = notificationService.getRecipientPreference({
        merchantId,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId
      });
      appendAuditLog({
        merchantId,
        action: "NOTIFICATION_PREFERENCE_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          recipientType: recipient.recipientType
        }
      });
      const etag = buildWeakEtag(payload);
      const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      };
      if (isIfNoneMatchFresh(req, etag)) {
        sendNotModified(res, cacheHeaders);
        return true;
      }
      sendJson(res, 200, payload, cacheHeaders);
      return true;
    }

    if (method === "PUT" && url.pathname === "/api/notifications/preferences") {
      ensureRole(auth, NOTIFICATION_ROLES);
      const body = await readJsonBody(req);
      const merchantId = body.merchantId || auth.merchantId;
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
          operation: "NOTIFICATION_PREFERENCE_SET",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { notificationService } = getServicesForMerchant(merchantId);
      const recipient = resolveRecipientFromAuth(auth);
      if (!recipient.recipientId) {
        sendJson(res, 400, { error: "recipient identity is required" });
        return true;
      }
      const payload = notificationService.setRecipientPreference({
        merchantId,
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        categories: body.categories,
        frequencyCaps: body.frequencyCaps,
        operatorId: auth.operatorId || auth.userId || "system"
      });
      appendAuditLog({
        merchantId,
        action: "NOTIFICATION_PREFERENCE_SET",
        status: "SUCCESS",
        auth,
        details: {
          recipientType: recipient.recipientType
        }
      });
      sendJson(res, 200, payload);
      return true;
    }

    return false;
  };
}

module.exports = {
  createNotificationRoutesHandler
};
