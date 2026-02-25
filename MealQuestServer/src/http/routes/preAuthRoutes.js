const { issueToken } = require("../../core/auth");
const {
  CUSTOMER_PROVIDER_WECHAT_MINIAPP,
  CUSTOMER_PROVIDER_ALIPAY,
} = require("../../services/socialAuthService");
const {
  readJsonBody,
  sendJson,
  validateOnboardSecret,
  onboardMerchant,
  sanitizeMerchantId,
  verifyHmacSignature,
  bindCustomerPhoneIdentity,
  issuePhoneCode,
  sanitizePhone,
  verifyPhoneCode,
  listMerchantIdsByOwnerPhone,
} = require("../serverHelpers");

function createPreAuthRoutesHandler({
  jwtSecret,
  paymentCallbackSecret,
  onboardSecret,
  metrics,
  tenantRepository,
  tenantRouter,
  getServicesForMerchant,
  actualDb,
  activeSocialAuthService,
  appendAuditLog,
  wsHub,
}) {
  return async function handlePreAuthRoutes({ method, url, req, res }) {
    if (method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
      return true;
    }

    if (method === "GET" && url.pathname === "/metrics") {
      const lines = [
        "# TYPE mealquest_requests_total counter",
        `mealquest_requests_total ${metrics.requestsTotal}`,
        "# TYPE mealquest_errors_total counter",
        `mealquest_errors_total ${metrics.errorsTotal}`,
      ];
      for (const [pathName, count] of Object.entries(metrics.requestsByPath)) {
        lines.push(
          `mealquest_requests_by_path_total{path="${String(pathName).replace(/"/g, '\\"')}"} ${count}`
        );
      }
      res.writeHead(200, {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      });
      res.end(`${lines.join("\n")}\n`);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/merchant/request-code") {
      const body = await readJsonBody(req);
      const phone = sanitizePhone(body.phone);
      const result = issuePhoneCode(actualDb, phone);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/merchant/phone-login") {
      const body = await readJsonBody(req);
      const { phone } = verifyPhoneCode(actualDb, {
        phone: body.phone,
        code: body.code,
      });
      const resolvedMerchants = listMerchantIdsByOwnerPhone(actualDb, phone);
      const merchantIdRaw = body.merchantId;
      let merchantId =
        merchantIdRaw === undefined || merchantIdRaw === null || merchantIdRaw === ""
          ? undefined
          : sanitizeMerchantId(merchantIdRaw);
      if (!merchantId) {
        if (resolvedMerchants.length === 1) {
          merchantId = resolvedMerchants[0];
        } else if (resolvedMerchants.length > 1) {
          sendJson(res, 409, { error: "phone bound to multiple merchants, contact support" });
          return true;
        }
      } else if (
        resolvedMerchants.length > 0 &&
        !resolvedMerchants.includes(merchantId)
      ) {
        sendJson(res, 403, { error: "phone not bound to the target merchant" });
        return true;
      }
      if (merchantId && !tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const token = issueToken(
        {
          role: "OWNER",
          merchantId,
          operatorId: "staff_owner",
          phone,
        },
        jwtSecret
      );
      sendJson(res, 200, {
        token,
        profile: {
          role: "OWNER",
          merchantId: merchantId || null,
          phone,
        },
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/customer/wechat-login") {
      const body = await readJsonBody(req);
      const merchantIdInput = body.merchantId || body.storeId;
      if (!merchantIdInput) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const merchantId = sanitizeMerchantId(merchantIdInput);
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      const identity = await activeSocialAuthService.verifyWeChatMiniAppCode(body.code);
      if (
        !identity ||
        identity.provider !== CUSTOMER_PROVIDER_WECHAT_MINIAPP ||
        !identity.subject
      ) {
        sendJson(res, 401, { error: "invalid wechat identity" });
        return true;
      }

      const scopedDb = tenantRouter.getDbForMerchant(merchantId);
      const providerPhone =
        identity && typeof identity.phone === "string" ? String(identity.phone).trim() : "";
      const binding = bindCustomerPhoneIdentity(scopedDb, {
        merchantId,
        provider: identity.provider,
        subject: identity.subject,
        unionId: identity.unionId || null,
        displayName: body.displayName || "",
        phone: String(body.phone || "").trim() || providerPhone,
      });
      const token = issueToken(
        {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        jwtSecret
      );
      sendJson(res, 200, {
        token,
        profile: {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        isNewUser: binding.created,
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/customer/alipay-login") {
      const body = await readJsonBody(req);
      const merchantIdInput = body.merchantId || body.storeId;
      if (!merchantIdInput) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const merchantId = sanitizeMerchantId(merchantIdInput);
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (typeof activeSocialAuthService.verifyAlipayCode !== "function") {
        sendJson(res, 503, { error: "Alipay auth service is not available" });
        return true;
      }
      const identity = await activeSocialAuthService.verifyAlipayCode(body.code);
      if (!identity || identity.provider !== CUSTOMER_PROVIDER_ALIPAY || !identity.subject) {
        sendJson(res, 401, { error: "invalid alipay identity" });
        return true;
      }

      const scopedDb = tenantRouter.getDbForMerchant(merchantId);
      const providerPhone =
        identity && typeof identity.phone === "string" ? String(identity.phone).trim() : "";
      const binding = bindCustomerPhoneIdentity(scopedDb, {
        merchantId,
        provider: identity.provider,
        subject: identity.subject,
        unionId: null,
        displayName: body.displayName || "",
        phone: String(body.phone || "").trim() || providerPhone,
      });
      const token = issueToken(
        {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        jwtSecret
      );
      sendJson(res, 200, {
        token,
        profile: {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        isNewUser: binding.created,
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/catalog") {
      const merchants = Object.values(actualDb.merchants || {})
        .map((merchant) => ({
          merchantId: merchant.merchantId,
          name: merchant.name,
          budgetCap: merchant.budgetCap,
          budgetUsed: merchant.budgetUsed,
          killSwitchEnabled: Boolean(merchant.killSwitchEnabled),
          onboardedAt: merchant.onboardedAt || null,
        }))
        .sort((a, b) => String(a.merchantId).localeCompare(String(b.merchantId)));
      sendJson(res, 200, {
        items: merchants,
        total: merchants.length,
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/onboard") {
      if (!validateOnboardSecret(req, onboardSecret)) {
        sendJson(res, 403, { error: "onboard secret invalid" });
        return true;
      }
      const body = await readJsonBody(req);
      try {
        const result = onboardMerchant(actualDb, body);
        tenantRepository.appendAuditLog({
          merchantId: result.merchant.merchantId,
          action: "MERCHANT_ONBOARD",
          status: "SUCCESS",
          role: "SYSTEM",
          operatorId: "bootstrap",
          details: {
            seededUsers: result.seededUsers.length,
          },
        });
        sendJson(res, 201, result);
        return true;
      } catch (error) {
        if (error && error.code === "MERCHANT_EXISTS") {
          sendJson(res, 409, { error: error.message });
          return true;
        }
        throw error;
      }
    }

    if (method === "POST" && url.pathname === "/api/payment/callback") {
      const body = await readJsonBody(req);
      const merchantId = body.merchantId;
      const signature = req.headers["x-payment-signature"];
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (!verifyHmacSignature(body, signature, paymentCallbackSecret)) {
        sendJson(res, 401, { error: "invalid callback signature" });
        return true;
      }

      const { paymentService } = getServicesForMerchant(merchantId);
      const result = paymentService.confirmExternalPayment({
        merchantId,
        paymentTxnId: body.paymentTxnId,
        externalTxnId: body.externalTxnId,
        callbackStatus: body.status,
        paidAmount: body.paidAmount,
        idempotencyKey: body.callbackId || body.externalTxnId || body.paymentTxnId,
      });
      appendAuditLog({
        merchantId,
        action: "PAYMENT_CALLBACK",
        status: result.status === "PAID" ? "SUCCESS" : "FAILED",
        auth: {
          role: "SYSTEM",
          operatorId: "payment_gateway",
        },
        details: {
          paymentTxnId: body.paymentTxnId,
          externalTxnId: body.externalTxnId,
          callbackStatus: body.status,
        },
      });
      wsHub.broadcast(merchantId, "PAYMENT_VERIFIED", result);
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createPreAuthRoutesHandler,
};
