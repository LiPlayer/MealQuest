const crypto = require("node:crypto");
const { issueToken, parseBearerToken, verifyToken } = require("../../core/auth");
const {
  CUSTOMER_PROVIDER_WECHAT_MINIAPP,
  CUSTOMER_PROVIDER_ALIPAY,
} = require("../../services/socialAuthService");
const {
  readJsonBody,
  sendJson,
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
  metrics,
  tenantRepository,
  tenantRouter,
  getServicesForMerchant,
  actualDb,
  activeSocialAuthService,
  appendAuditLog,
  wsHub,
}) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  async function runWithRootFreshState(runner) {
    if (typeof actualDb.runWithFreshState === "function") {
      return actualDb.runWithFreshState(async (workingDb) => runner(workingDb));
    }
    const result = await runner(actualDb);
    actualDb.save();
    return result;
  }

  async function runWithRootFreshRead(runner) {
    if (typeof actualDb.runWithFreshRead === "function") {
      return actualDb.runWithFreshRead(async (workingDb) => runner(workingDb));
    }
    return runner(actualDb);
  }

  function getIdempotencyEntry(db, key) {
    const normalized = String(key || "").trim();
    if (!normalized) {
      return null;
    }
    if (typeof db.getIdempotencyEntry === "function") {
      return db.getIdempotencyEntry(normalized);
    }
    return db.idempotencyRecords && db.idempotencyRecords[normalized]
      ? db.idempotencyRecords[normalized]
      : null;
  }

  function setIdempotencyEntry(db, key, value) {
    const normalized = String(key || "").trim();
    if (!normalized) {
      return;
    }
    if (typeof db.setIdempotencyEntry === "function") {
      db.setIdempotencyEntry(normalized, value);
      return;
    }
    if (!db.idempotencyRecords || typeof db.idempotencyRecords !== "object") {
      db.idempotencyRecords = {};
    }
    db.idempotencyRecords[normalized] = value;
  }

  function generateMerchantId(rootDb) {
    const merchants = rootDb && rootDb.merchants && typeof rootDb.merchants === "object" ? rootDb.merchants : {};
    for (let i = 0; i < 6; i += 1) {
      const candidate = sanitizeMerchantId(
        `m_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`
      );
      if (!merchants[candidate]) {
        return candidate;
      }
    }
    throw new Error("failed to generate merchant id");
  }

  function normalizePolicyPrefix(value) {
    return String(value || "").trim().toUpperCase();
  }

  function matchPolicyPrefix(policyId, policyKeyPrefix) {
    const normalizedPolicyId = String(policyId || "").trim().toUpperCase();
    const normalizedPrefix = normalizePolicyPrefix(policyKeyPrefix);
    if (!normalizedPrefix) {
      return Boolean(normalizedPolicyId);
    }
    if (!normalizedPolicyId) {
      return false;
    }
    return (
      normalizedPolicyId.startsWith(`${normalizedPrefix}@`) ||
      normalizedPolicyId.startsWith(normalizedPrefix)
    );
  }

  function toDecisionOutcome(decision, policyKeyPrefix = "") {
    const executedRaw = Array.isArray(decision && decision.executed) ? decision.executed : [];
    const rejectedRaw = Array.isArray(decision && decision.rejected) ? decision.rejected : [];
    const normalizedPrefix = normalizePolicyPrefix(policyKeyPrefix);
    const executed = normalizedPrefix
      ? executedRaw.filter((item) => matchPolicyPrefix(item, normalizedPrefix))
      : executedRaw;
    const rejected = normalizedPrefix
      ? rejectedRaw.filter((item) => matchPolicyPrefix(item && item.policyId, normalizedPrefix))
      : rejectedRaw;
    if (executed.length > 0) {
      return "HIT";
    }
    if (rejected.length > 0) {
      return "BLOCKED";
    }
    return "NO_POLICY";
  }

  function toDecisionReason(decision, policyKeyPrefix = "") {
    const rejectedRaw = Array.isArray(decision && decision.rejected) ? decision.rejected : [];
    const normalizedPrefix = normalizePolicyPrefix(policyKeyPrefix);
    const rejected = normalizedPrefix
      ? rejectedRaw.filter((item) => matchPolicyPrefix(item && item.policyId, normalizedPrefix))
      : rejectedRaw;
    const first = rejected[0] || {};
    return String(first.reason || "").trim();
  }

  function toDayKeyFromMs(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }

  function toDayStartMsFromDayKey(dayKey) {
    const parsed = Date.parse(`${String(dayKey || "").trim()}T00:00:00.000Z`);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function buildActivationContext({ policyOsService, merchantId, userId, nowMs = Date.now() }) {
    if (!policyOsService || typeof policyOsService.listDecisions !== "function") {
      return {
        inactiveDays: 9999,
        checkinStreakDays: 1
      };
    }
    const nowDayKey = toDayKeyFromMs(nowMs);
    const decisions = policyOsService.listDecisions({
      merchantId,
      userId,
      event: "USER_ENTER_SHOP",
      mode: "EXECUTE",
      limit: 90
    });
    const uniqueDays = new Set();
    for (const row of decisions) {
      const createdAtMs = Date.parse(String(row && row.created_at ? row.created_at : ""));
      if (!Number.isFinite(createdAtMs)) {
        continue;
      }
      uniqueDays.add(toDayKeyFromMs(createdAtMs));
    }
    const historicalDayKeys = [...uniqueDays]
      .filter((dayKey) => String(dayKey || "").trim())
      .sort((left, right) => String(right).localeCompare(String(left)));

    const combinedDays = new Set([...historicalDayKeys, nowDayKey]);
    let checkinStreakDays = 0;
    let cursorMs = toDayStartMsFromDayKey(nowDayKey);
    while (Number.isFinite(cursorMs)) {
      const cursorKey = toDayKeyFromMs(cursorMs);
      if (!combinedDays.has(cursorKey)) {
        break;
      }
      checkinStreakDays += 1;
      cursorMs -= MS_PER_DAY;
    }

    const nowDayStartMs = toDayStartMsFromDayKey(nowDayKey);
    const streakStartMs = Number.isFinite(nowDayStartMs)
      ? nowDayStartMs - (Math.max(1, checkinStreakDays) - 1) * MS_PER_DAY
      : Number.NaN;
    const previousBeforeStreakMs = historicalDayKeys
      .map((dayKey) => toDayStartMsFromDayKey(dayKey))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp < streakStartMs)
      .sort((left, right) => right - left)[0];
    const inactiveDays =
      Number.isFinite(previousBeforeStreakMs) && Number.isFinite(streakStartMs)
        ? Math.max(0, Math.floor((streakStartMs - previousBeforeStreakMs) / MS_PER_DAY) - 1)
        : 9999;

    return {
      inactiveDays,
      checkinStreakDays: Math.max(1, checkinStreakDays)
    };
  }

  function toScopedDecisionView(rawDecision, policyKeyPrefix) {
    if (!rawDecision || typeof rawDecision !== "object") {
      return null;
    }
    return {
      event: "USER_ENTER_SHOP",
      decisionId: rawDecision.decision_id || "",
      traceId: rawDecision.trace_id || "",
      outcome: toDecisionOutcome(rawDecision, policyKeyPrefix),
      reasonCode: toDecisionReason(rawDecision, policyKeyPrefix),
      grants: Array.isArray(rawDecision.grants) ? rawDecision.grants : [],
    };
  }

  async function executeEntryDecision({
    merchantId,
    userId,
    isNewUser,
    sourceCode = "",
    source = "",
  }) {
    try {
      const { policyOsService } = getServicesForMerchant(merchantId);
      if (!policyOsService || typeof policyOsService.executeDecision !== "function") {
        return null;
      }
      const activationContext = buildActivationContext({
        policyOsService,
        merchantId,
        userId
      });
      return await policyOsService.executeDecision({
        merchantId,
        userId,
        event: "USER_ENTER_SHOP",
        eventId: `user_enter_shop:${merchantId}:${userId}:${String(sourceCode || "no_code")}`,
        context: {
          isNewUser: Boolean(isNewUser),
          hasReferral: false,
          riskScore: 0,
          inactiveDays: activationContext.inactiveDays,
          checkinStreakDays: activationContext.checkinStreakDays,
          source: String(source || "customer_login").trim() || "customer_login",
        },
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "entry_decision_failed"
      };
    }
  }

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
      const result = await runWithRootFreshState(async (rootDb) => issuePhoneCode(rootDb, phone));
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/merchant/phone-login") {
      const body = await readJsonBody(req);
      const { phone, resolvedMerchants } = await runWithRootFreshState(async (rootDb) => {
        const verified = verifyPhoneCode(rootDb, {
          phone: body.phone,
          code: body.code,
        });
        return {
          phone: verified.phone,
          resolvedMerchants: listMerchantIdsByOwnerPhone(rootDb, verified.phone),
        };
      });
      if (resolvedMerchants.length > 1) {
        sendJson(res, 409, {
          status: "MULTI_BINDING",
          error: "phone bound to multiple merchants, contact support",
        });
        return true;
      }

      if (resolvedMerchants.length === 0) {
        const onboardingToken = issueToken(
          {
            role: "OWNER_PENDING",
            purpose: "MERCHANT_ONBOARD",
            phone,
            onboardingNonce: crypto.randomBytes(12).toString("hex"),
          },
          jwtSecret,
          10 * 60
        );
        sendJson(res, 200, {
          status: "ONBOARD_REQUIRED",
          onboardingToken,
          profile: {
            role: "OWNER_PENDING",
            merchantId: null,
            phone,
          },
        });
        return true;
      }

      const merchantId = resolvedMerchants[0];
      const merchant = await tenantRepository.getMerchant(merchantId);
      if (!merchant) {
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
        status: "BOUND",
        token,
        profile: {
          role: "OWNER",
          merchantId,
          phone,
        },
        merchant: {
          merchantId,
          name: merchant.name,
          ownerPhone: merchant.ownerPhone || undefined,
        },
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/auth/merchant/complete-onboard") {
      const body = await readJsonBody(req);
      const bearerToken = parseBearerToken(req.headers.authorization);
      if (!bearerToken) {
        sendJson(res, 401, { error: "Authorization Bearer token is required" });
        return true;
      }

      let onboardingClaims = null;
      try {
        onboardingClaims = verifyToken(bearerToken, jwtSecret);
      } catch {
        sendJson(res, 401, { error: "invalid onboarding token" });
        return true;
      }

      const onboardingPhone = onboardingClaims && onboardingClaims.phone ? String(onboardingClaims.phone) : "";
      const onboardingNonce =
        onboardingClaims && onboardingClaims.onboardingNonce
          ? String(onboardingClaims.onboardingNonce)
          : "";
      if (
        onboardingClaims.role !== "OWNER_PENDING" ||
        onboardingClaims.purpose !== "MERCHANT_ONBOARD" ||
        !onboardingPhone ||
        !onboardingNonce
      ) {
        sendJson(res, 401, { error: "invalid onboarding token" });
        return true;
      }

      try {
        const result = await runWithRootFreshState(async (rootDb) => {
          const phone = sanitizePhone(onboardingPhone);
          const existingMerchants = listMerchantIdsByOwnerPhone(rootDb, phone);
          if (existingMerchants.length > 0) {
            const error = new Error("phone already bound to merchant");
            error.statusCode = 409;
            throw error;
          }
          const replayKey = `merchant_onboard_nonce:${onboardingNonce}`;
          if (getIdempotencyEntry(rootDb, replayKey)) {
            const error = new Error("onboarding token already used");
            error.statusCode = 409;
            throw error;
          }

          const merchantId = generateMerchantId(rootDb);
          const onboardResult = onboardMerchant(rootDb, {
            merchantId,
            name: body.name || body.merchantName,
            budgetCap: body.budgetCap,
            clusterId: body.clusterId,
            ownerPhone: phone,
          });

          setIdempotencyEntry(rootDb, replayKey, {
            consumedAt: new Date().toISOString(),
            merchantId: onboardResult.merchant.merchantId,
            phone,
          });

          rootDb.appendAuditLog({
            merchantId: onboardResult.merchant.merchantId,
            action: "MERCHANT_ONBOARD",
            status: "SUCCESS",
            role: "SYSTEM",
            operatorId: "bootstrap",
            details: {},
          });

          const token = issueToken(
            {
              role: "OWNER",
              merchantId: onboardResult.merchant.merchantId,
              operatorId: "staff_owner",
              phone,
            },
            jwtSecret
          );
          return {
            status: "BOUND",
            token,
            profile: {
              role: "OWNER",
              merchantId: onboardResult.merchant.merchantId,
              phone,
            },
            merchant: {
              merchantId: onboardResult.merchant.merchantId,
              name: onboardResult.merchant.name,
              ownerPhone: onboardResult.merchant.ownerPhone,
            },
          };
        });
        sendJson(res, 201, result);
        return true;
      } catch (error) {
        if (error && error.statusCode === 409) {
          sendJson(res, 409, { error: error.message || "onboarding token already used" });
          return true;
        }
        throw error;
      }
    }

    if (method === "POST" && url.pathname === "/api/auth/customer/wechat-login") {
      const body = await readJsonBody(req);
      const merchantIdInput = body.merchantId || body.storeId;
      if (!merchantIdInput) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const merchantId = sanitizeMerchantId(merchantIdInput);
      if (!(await tenantRepository.getMerchant(merchantId))) {
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
      const entryDecision = await executeEntryDecision({
        merchantId,
        userId: binding.userId,
        isNewUser: binding.created,
        sourceCode: body.code,
        source: "wechat_login",
      });
      const welcomeDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "ACQ_WELCOME_FIRST_BIND_V1");
      const activationDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "ACT_CHECKIN_STREAK_RECOVERY_V1");
      const retentionDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "RET_DORMANT_WINBACK_14D_V1");
      sendJson(res, 200, {
        token,
        profile: {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        isNewUser: binding.created,
        welcomeDecision,
        activationDecision,
        retentionDecision,
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
      if (!(await tenantRepository.getMerchant(merchantId))) {
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
      const entryDecision = await executeEntryDecision({
        merchantId,
        userId: binding.userId,
        isNewUser: binding.created,
        sourceCode: body.code,
        source: "alipay_login",
      });
      const welcomeDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "ACQ_WELCOME_FIRST_BIND_V1");
      const activationDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "ACT_CHECKIN_STREAK_RECOVERY_V1");
      const retentionDecision =
        entryDecision && entryDecision.error
          ? {
              event: "USER_ENTER_SHOP",
              decisionId: "",
              traceId: "",
              outcome: "ERROR",
              reasonCode: entryDecision.error,
              grants: [],
            }
          : toScopedDecisionView(entryDecision, "RET_DORMANT_WINBACK_14D_V1");
      sendJson(res, 200, {
        token,
        profile: {
          role: "CUSTOMER",
          merchantId,
          userId: binding.userId,
          phone: binding.phone,
        },
        isNewUser: binding.created,
        welcomeDecision,
        activationDecision,
        retentionDecision,
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/exists") {
      const merchantId = String(url.searchParams.get("merchantId") || "").trim();
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const exists = await runWithRootFreshRead(async (rootDb) =>
        Boolean(rootDb.merchants && rootDb.merchants[merchantId])
      );
      sendJson(res, 200, { merchantId, exists });
      return true;
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
      const result = await paymentService.confirmExternalPayment({
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
