const {
  readJsonBody,
  sendJson,
  sendNotModified,
  ensureRole,
  enforceTenantPolicyForHttp,
  buildWeakEtag,
  isIfNoneMatchFresh,
  toListLimit,
} = require("../serverHelpers");

const FEEDBACK_READ_ROLES = ["OWNER", "MANAGER", "CUSTOMER"];
const FEEDBACK_MANAGE_ROLES = ["OWNER", "MANAGER"];

function createFeedbackRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  getServicesForMerchant,
  appendAuditLog,
}) {
  return async function handleFeedbackRoutes({ method, url, req, auth, res }) {
    if (method === "POST" && url.pathname === "/api/feedback/tickets") {
      ensureRole(auth, ["CUSTOMER"]);
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
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      const customerUser = await tenantRepository.getMerchantUser(merchantId, auth.userId);
      if (!customerUser) {
        sendJson(res, 404, { error: "user not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "FEEDBACK_CREATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { feedbackService, notificationService } = getServicesForMerchant(merchantId);
      const payload = feedbackService.createTicket({
        merchantId,
        userId: auth.userId,
        category: body.category,
        title: body.title,
        description: body.description,
        contact: body.contact,
      });
      const ticket = payload && payload.ticket ? payload.ticket : null;
      if (notificationService && ticket) {
        const staffIds = notificationService.listMerchantStaffRecipientIds(merchantId, FEEDBACK_MANAGE_ROLES);
        for (const recipientId of staffIds) {
          notificationService.createNotification({
            merchantId,
            recipientType: "MERCHANT_STAFF",
            recipientId,
            category: "FEEDBACK_TICKET",
            title: "收到新的顾客问题反馈",
            body: `反馈主题：${String(ticket.title || "").slice(0, 60)}`,
            related: {
              ticketId: ticket.ticketId,
              status: ticket.status,
              category: ticket.category,
              userId: ticket.userId,
            },
          });
        }
      }
      appendAuditLog({
        merchantId,
        action: "FEEDBACK_CREATE",
        status: "SUCCESS",
        auth,
        details: {
          ticketId: ticket && ticket.ticketId ? ticket.ticketId : null,
          category: ticket && ticket.category ? ticket.category : null,
        },
      });
      sendJson(res, 200, payload);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/feedback/tickets") {
      ensureRole(auth, FEEDBACK_READ_ROLES);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "FEEDBACK_QUERY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { feedbackService } = getServicesForMerchant(merchantId);
      const payload = feedbackService.listTickets({
        merchantId,
        requesterRole: auth.role,
        requesterUserId: auth.userId || "",
        status: url.searchParams.get("status") || "ALL",
        category: url.searchParams.get("category") || "ALL",
        limit: toListLimit(url.searchParams.get("limit"), 20, 100),
        cursor: url.searchParams.get("cursor") || "",
      });
      appendAuditLog({
        merchantId,
        action: "FEEDBACK_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          route: "tickets",
          returned: Array.isArray(payload.items) ? payload.items.length : 0,
          status: payload.status,
          category: payload.category,
        },
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

    const ticketDetailMatch = url.pathname.match(/^\/api\/feedback\/tickets\/([^/]+)$/);
    if (method === "GET" && ticketDetailMatch) {
      ensureRole(auth, FEEDBACK_READ_ROLES);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "FEEDBACK_QUERY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const ticketId = decodeURIComponent(ticketDetailMatch[1]);
      const { feedbackService } = getServicesForMerchant(merchantId);
      const payload = feedbackService.getTicket({
        merchantId,
        ticketId,
        requesterRole: auth.role,
        requesterUserId: auth.userId || "",
      });
      appendAuditLog({
        merchantId,
        action: "FEEDBACK_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          route: "ticket-detail",
          ticketId,
          status: payload && payload.ticket ? payload.ticket.status : null,
        },
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

    const transitionMatch = url.pathname.match(/^\/api\/feedback\/tickets\/([^/]+)\/transition$/);
    if (method === "POST" && transitionMatch) {
      ensureRole(auth, FEEDBACK_MANAGE_ROLES);
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
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "FEEDBACK_TRANSITION",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const ticketId = decodeURIComponent(transitionMatch[1]);
      const { feedbackService, notificationService } = getServicesForMerchant(merchantId);
      const payload = feedbackService.transitionTicket({
        merchantId,
        ticketId,
        toStatus: body.toStatus || body.status,
        note: body.note || "",
        operatorRole: auth.role,
        operatorId: auth.operatorId || auth.userId || "unknown",
      });
      const ticket = payload && payload.ticket ? payload.ticket : null;
      if (notificationService && ticket) {
        notificationService.createNotification({
          merchantId,
          recipientType: "CUSTOMER_USER",
          recipientId: ticket.userId,
          category: "FEEDBACK_TICKET",
          title: "您的问题反馈有新进展",
          body: `当前状态：${ticket.status}`,
          related: {
            ticketId: ticket.ticketId,
            status: ticket.status,
            category: ticket.category,
          },
        });
      }
      appendAuditLog({
        merchantId,
        action: "FEEDBACK_TRANSITION",
        status: "SUCCESS",
        auth,
        details: {
          ticketId,
          toStatus:
            payload && payload.transition && payload.transition.toStatus
              ? payload.transition.toStatus
              : null,
        },
      });
      sendJson(res, 200, payload);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/feedback/summary") {
      ensureRole(auth, FEEDBACK_MANAGE_ROLES);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "FEEDBACK_SUMMARY_QUERY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { feedbackService } = getServicesForMerchant(merchantId);
      const payload = feedbackService.getSummary({
        merchantId,
        windowHours: url.searchParams.get("windowHours") || 168,
      });
      appendAuditLog({
        merchantId,
        action: "FEEDBACK_SUMMARY_QUERY",
        status: "SUCCESS",
        auth,
        details: {
          totalTickets: payload && payload.totals ? Number(payload.totals.tickets || 0) : 0,
          unresolvedCount:
            payload && payload.totals ? Number(payload.totals.unresolvedCount || 0) : 0,
        },
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

    return false;
  };
}

module.exports = {
  createFeedbackRoutesHandler,
};
