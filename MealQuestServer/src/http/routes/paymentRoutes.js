const {
  readJsonBody,
  sendJson,
  ensureRole,
  toListLimit,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

function createPaymentRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  tenantRouter,
  CASHIER_ROLES,
  MERCHANT_ROLES,
  appendAuditLog,
  wsHub,
}) {
  return async function handlePaymentRoutes({ method, url, req, auth, res }) {
    if (method === "POST" && url.pathname === "/api/payment/quote") {
      ensureRole(auth, CASHIER_ROLES);
      const body = await readJsonBody(req);
      body.merchantId = auth.merchantId || body.merchantId;
      if (auth.role === "CUSTOMER") {
        body.userId = auth.userId;
      }
      const { paymentService } = getServicesForMerchant(body.merchantId);
      const result = paymentService.getQuote(body);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/payment/verify") {
      ensureRole(auth, CASHIER_ROLES);
      const body = await readJsonBody(req);
      body.merchantId = auth.merchantId || body.merchantId;
      if (auth.role === "CUSTOMER") {
        body.userId = auth.userId;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId: body.merchantId,
          operation: "PAYMENT_VERIFY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const { paymentService } = getServicesForMerchant(body.merchantId);
      const result = paymentService.verifyPayment({
        ...body,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
      });
      appendAuditLog({
        merchantId: body.merchantId,
        action: "PAYMENT_VERIFY",
        status: "SUCCESS",
        auth,
        details: {
          paymentTxnId: result.paymentTxnId,
          userId: body.userId,
          orderAmount: Number(body.orderAmount || 0),
        },
      });
      wsHub.broadcast(body.merchantId, "PAYMENT_VERIFIED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/payment/refund") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      body.merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId: body.merchantId,
          operation: "PAYMENT_REFUND",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { paymentService } = getServicesForMerchant(body.merchantId);
      const result = paymentService.refundPayment({
        ...body,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
      });
      appendAuditLog({
        merchantId: body.merchantId,
        action: "PAYMENT_REFUND",
        status: "SUCCESS",
        auth,
        details: {
          paymentTxnId: body.paymentTxnId,
          refundTxnId: result.refundTxnId,
          refundAmount: Number(body.refundAmount || 0),
        },
      });
      wsHub.broadcast(body.merchantId, "PAYMENT_REFUNDED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/payment/ledger") {
      ensureRole(auth, [...MERCHANT_ROLES, "CUSTOMER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }

      const scopedDb = tenantRouter.getDbForMerchant(merchantId);
      const limit = toListLimit(url.searchParams.get("limit"), 20, 100);
      const requestedUserId = url.searchParams.get("userId") || "";
      const userId = auth.role === "CUSTOMER" ? auth.userId : requestedUserId;
      if (auth.role === "CUSTOMER" && requestedUserId && requestedUserId !== auth.userId) {
        sendJson(res, 403, { error: "user scope denied" });
        return true;
      }

      const items = (scopedDb.ledger || [])
        .filter((row) => row.merchantId === merchantId)
        .filter((row) => (userId ? row.userId === userId : true))
        .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
        .slice(0, limit);

      sendJson(res, 200, {
        merchantId,
        userId: userId || null,
        items,
      });
      return true;
    }

    return false;
  };
}

module.exports = {
  createPaymentRoutesHandler,
};
