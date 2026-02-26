const {
  readJsonBody,
  sendJson,
  ensureRole,
} = require("../serverHelpers");

function createPrivacyRoutesHandler({ getServicesForMerchant, appendAuditLog }) {
  return async function handlePrivacyRoutes({ method, url, req, auth, res }) {
    if (method === "POST" && url.pathname === "/api/privacy/export-user") {
      ensureRole(auth, ["OWNER"]);
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
      const { privacyService } = getServicesForMerchant(merchantId);
      const result = await privacyService.exportUserData({
        merchantId,
        userId: body.userId,
      });
      appendAuditLog({
        merchantId,
        action: "PRIVACY_EXPORT",
        status: "SUCCESS",
        auth,
        details: {
          userId: body.userId,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/privacy/delete-user") {
      ensureRole(auth, ["OWNER"]);
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
      const { privacyService } = getServicesForMerchant(merchantId);
      const result = await privacyService.deleteUserData({
        merchantId,
        userId: body.userId,
      });
      appendAuditLog({
        merchantId,
        action: "PRIVACY_DELETE",
        status: "SUCCESS",
        auth,
        details: {
          userId: body.userId,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/privacy/cancel-account") {
      ensureRole(auth, ["CUSTOMER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const userId = auth.userId;
      if (!merchantId || !userId) {
        sendJson(res, 400, { error: "merchantId and userId are required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      const { privacyService } = getServicesForMerchant(merchantId);
      const result = await privacyService.cancelUserAccount({
        merchantId,
        userId,
      });
      appendAuditLog({
        merchantId,
        action: "PRIVACY_CANCEL",
        status: "SUCCESS",
        auth,
        details: {
          userId,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createPrivacyRoutesHandler,
};
