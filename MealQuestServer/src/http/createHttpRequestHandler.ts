const {
  sendJson,
  resolveAuditAction,
  getAuthContext,
  uniqueDbs,
} = require("./serverHelpers");
const { createPreAuthRoutesHandler } = require("./routes/preAuthRoutes");
const { createSystemRoutesHandler } = require("./routes/systemRoutes");
const { createPaymentRoutesHandler } = require("./routes/paymentRoutes");
const { createInvoiceRoutesHandler } = require("./routes/invoiceRoutes");
const { createPrivacyRoutesHandler } = require("./routes/privacyRoutes");
const { createMerchantRoutesHandler } = require("./routes/merchantRoutes");
const { createAllianceRoutesHandler } = require("./routes/allianceRoutes");
const { createTenantRoutesHandler } = require("./routes/tenantRoutes");
const { createPolicyOsRoutesHandler } = require("./routes/policyOsRoutes");

function createHttpRequestHandler(deps) {
  const {
    jwtSecret,
    metrics,
    paymentCallbackSecret,
    onboardSecret,
    tenantPolicyManager,
    tenantRepository,
    getServicesForDb,
    getServicesForMerchant,
    wsHub,
    actualDb,
    tenantRouter,
    activeSocialAuthService,
    appendAuditLog,
    MERCHANT_ROLES,
    CASHIER_ROLES,
    postgresOptions,
  } = deps;

  const handlePreAuthRoutes = createPreAuthRoutesHandler({
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
  });

  const authenticatedRouteHandlers = [
    createSystemRoutesHandler({
      tenantPolicyManager,
      tenantRepository,
      getServicesForDb,
      tenantRouter,
      MERCHANT_ROLES,
      appendAuditLog,
      wsHub,
    }),
    createPaymentRoutesHandler({
      tenantPolicyManager,
      getServicesForMerchant,
      getServicesForDb,
      tenantRepository,
      tenantRouter,
      CASHIER_ROLES,
      MERCHANT_ROLES,
      appendAuditLog,
      wsHub,
    }),
    createInvoiceRoutesHandler({
      tenantPolicyManager,
      getServicesForMerchant,
      MERCHANT_ROLES,
      appendAuditLog,
    }),
    createPrivacyRoutesHandler({
      getServicesForMerchant,
      appendAuditLog,
    }),
    createMerchantRoutesHandler({
      tenantPolicyManager,
      tenantRepository,
      getServicesForMerchant,
      MERCHANT_ROLES,
      actualDb,
      appendAuditLog,
      wsHub,
    }),
    createPolicyOsRoutesHandler({
      tenantPolicyManager,
      getServicesForMerchant,
      appendAuditLog,
    }),
    createAllianceRoutesHandler({
      tenantPolicyManager,
      getServicesForMerchant,
      MERCHANT_ROLES,
      appendAuditLog,
    }),
    createTenantRoutesHandler({
      tenantPolicyManager,
      tenantRepository,
      tenantRouter,
      actualDb,
      postgresOptions,
      appendAuditLog,
    }),
  ];

  const tenantLocks = new Map();

  async function withTenantLock(key, runner) {
    const lockKey = String(key || "__global__");
    const previous = tenantLocks.get(lockKey) || Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    tenantLocks.set(lockKey, tail);

    await previous;
    try {
      return await runner();
    } finally {
      releaseCurrent();
      if (tenantLocks.get(lockKey) === tail) {
        tenantLocks.delete(lockKey);
      }
    }
  }

  function resolveTenantLockKey({ auth, url }) {
    const scopedMerchantId =
      (auth && auth.merchantId) ||
      (url && url.searchParams ? url.searchParams.get("merchantId") : "") ||
      "";
    if (scopedMerchantId) {
      return `merchant:${scopedMerchantId}`;
    }
    if (auth && (auth.operatorId || auth.userId)) {
      return `actor:${auth.role || "UNKNOWN"}:${auth.operatorId || auth.userId}`;
    }
    return `path:${url && url.pathname ? url.pathname : "/"}`;
  }

  async function flushManagedDbs() {
    const managed = uniqueDbs([
      actualDb,
      ...(tenantRouter.listOverrideDbs ? tenantRouter.listOverrideDbs() : []),
    ]);
    for (const dbItem of managed) {
      if (dbItem && typeof dbItem.flush === "function") {
        await dbItem.flush();
      }
    }
  }

  return async function requestHandler(req, res) {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://localhost");
    const auditAction = resolveAuditAction(method, url.pathname);
    metrics.requestsTotal += 1;
    metrics.requestsByPath[url.pathname] = (metrics.requestsByPath[url.pathname] || 0) + 1;
    let auth = null;

    try {
      const baseContext = {
        method,
        url,
        req,
        res,
      };

      if (await handlePreAuthRoutes(baseContext)) {
        await flushManagedDbs();
        return;
      }

      auth = getAuthContext(req, jwtSecret);
      const authContext = {
        ...baseContext,
        auth,
      };

      const lockKey = resolveTenantLockKey({ auth, url });
      const handled = await withTenantLock(lockKey, async () => {
        for (const handleRoute of authenticatedRouteHandlers) {
          if (await handleRoute(authContext)) {
            return true;
          }
        }
        return false;
      });
      if (handled) {
        await flushManagedDbs();
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (error) {
      metrics.errorsTotal += 1;
      const message = error.message || "Request failed";
      const explicitStatusCode = Number(error && error.statusCode);
      const statusCode =
        Number.isFinite(explicitStatusCode) && explicitStatusCode >= 400 && explicitStatusCode <= 599
          ? explicitStatusCode
          : message === "permission denied" || message.includes("scope denied")
            ? 403
            : message.includes("Authorization")
              ? 401
              : 400;
      if (auditAction && auth && auth.merchantId) {
        appendAuditLog({
          merchantId: auth.merchantId,
          action: auditAction,
          status: statusCode === 403 || statusCode === 401 ? "DENIED" : "FAILED",
          auth,
          details: {
            error: message,
          },
        });
      }
      sendJson(res, statusCode, { error: message });
    }
  };
}

module.exports = {
  createHttpRequestHandler,
};
