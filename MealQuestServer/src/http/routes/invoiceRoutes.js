const {
  readJsonBody,
  sendJson,
  ensureRole,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

function createInvoiceRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  MERCHANT_ROLES,
  appendAuditLog,
}) {
  return async function handleInvoiceRoutes({ method, url, req, auth, res }) {
    if (method === "POST" && url.pathname === "/api/invoice/issue") {
      ensureRole(auth, MERCHANT_ROLES);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "INVOICE_ISSUE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { invoiceService } = getServicesForMerchant(merchantId);
      const result = invoiceService.issueInvoice({
        merchantId,
        paymentTxnId: body.paymentTxnId,
        title: body.title,
        taxNo: body.taxNo,
        email: body.email,
      });
      appendAuditLog({
        merchantId,
        action: "INVOICE_ISSUE",
        status: "SUCCESS",
        auth,
        details: {
          paymentTxnId: body.paymentTxnId,
          invoiceNo: result.invoiceNo,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/invoice/list") {
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
      const requestedUserId = url.searchParams.get("userId") || "";
      const userId = auth.role === "CUSTOMER" ? auth.userId : requestedUserId;
      if (auth.role === "CUSTOMER" && requestedUserId && requestedUserId !== auth.userId) {
        sendJson(res, 403, { error: "user scope denied" });
        return true;
      }
      const { invoiceService } = getServicesForMerchant(merchantId);
      const result = invoiceService.listInvoices({
        merchantId,
        userId,
        limit: url.searchParams.get("limit"),
      });
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createInvoiceRoutesHandler,
};
