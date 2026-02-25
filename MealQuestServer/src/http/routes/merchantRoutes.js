const {
  readJsonBody,
  sendJson,
  ensureRole,
  buildContractApplication,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

function createMerchantRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  getServicesForMerchant,
  MERCHANT_ROLES,
  actualDb,
  appendAuditLog,
  wsHub,
}) {
  return async function handleMerchantRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/merchant/dashboard") {
      ensureRole(auth, MERCHANT_ROLES);
      const merchantId = url.searchParams.get("merchantId");
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, merchantService.getDashboard({ merchantId }));
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/strategy-library") {
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
      const { merchantService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, merchantService.listStrategyLibrary({ merchantId }));
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/strategy-configs") {
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
      const { merchantService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, merchantService.listStrategyConfigs({ merchantId }));
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/strategy-proposals") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId || (!body.templateId && !body.intent)) {
        sendJson(res, 400, { error: "merchantId and (templateId or intent) are required" });
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
          operation: "STRATEGY_PROPOSAL_CREATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.createStrategyProposal({
        merchantId,
        templateId: body.templateId,
        branchId: body.branchId,
        operatorId: auth.operatorId,
        intent: body.intent,
        overrides: body.overrides,
      });
      const auditStatus =
        result.status === "PENDING"
          ? "SUCCESS"
          : result.status === "BLOCKED"
            ? "BLOCKED"
            : "DENIED";
      appendAuditLog({
        merchantId,
        action: "STRATEGY_PROPOSAL_CREATE",
        status: auditStatus,
        auth,
        details: {
          templateId: body.templateId,
          branchId: body.branchId || null,
          proposalId: result.proposalId || null,
          decisionStatus: result.status || "UNKNOWN",
          createdCount: Array.isArray(result.created) ? result.created.length : 0,
          missingSlots: result.missingSlots || [],
          reasons: result.reasons || [],
          reason: result.reason || null,
        },
      });
      if (Array.isArray(result.created) && result.created.length > 0) {
        wsHub.broadcast(merchantId, "STRATEGY_PROPOSAL_CREATED", result);
      }
      sendJson(res, 200, result);
      return true;
    }

    const campaignStatusMatch = url.pathname.match(/^\/api\/merchant\/campaigns\/([^/]+)\/status$/);
    if (method === "POST" && campaignStatusMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const campaignId = campaignStatusMatch[1];
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
          operation: "CAMPAIGN_STATUS_SET",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = merchantService.setCampaignStatus({
        merchantId,
        campaignId,
        status: body.status,
      });
      appendAuditLog({
        merchantId,
        action: "CAMPAIGN_STATUS_SET",
        status: "SUCCESS",
        auth,
        details: {
          campaignId,
          status: result.status,
        },
      });
      wsHub.broadcast(merchantId, "CAMPAIGN_STATUS_CHANGED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/fire-sale") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
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
          operation: "FIRE_SALE_CREATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = merchantService.createFireSaleCampaign({
        merchantId,
        targetSku: body.targetSku,
        ttlMinutes: body.ttlMinutes,
        voucherValue: body.voucherValue,
        maxQty: body.maxQty,
      });
      appendAuditLog({
        merchantId,
        action: "FIRE_SALE_CREATE",
        status: "SUCCESS",
        auth,
        details: {
          targetSku: body.targetSku || null,
          campaignId: result.campaignId,
        },
      });
      wsHub.broadcast(merchantId, "FIRE_SALE_CREATED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/contract/status") {
      ensureRole(auth, ["OWNER", "MANAGER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      const item =
        (actualDb.contractApplications && actualDb.contractApplications[merchantId]) || null;
      sendJson(res, 200, {
        merchantId,
        status: item ? item.status : "NOT_SUBMITTED",
        application: item,
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/contract/apply") {
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
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "CONTRACT_APPLY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const application = buildContractApplication(body);
      if (!actualDb.contractApplications || typeof actualDb.contractApplications !== "object") {
        actualDb.contractApplications = {};
      }
      actualDb.contractApplications[merchantId] = {
        merchantId,
        ...application,
      };
      actualDb.save();

      appendAuditLog({
        merchantId,
        action: "CONTRACT_APPLY",
        status: "SUCCESS",
        auth,
        details: {
          companyName: application.companyName,
          licenseNo: application.licenseNo,
          contactPhone: application.contactPhone,
        },
      });

      sendJson(res, 200, {
        merchantId,
        status: application.status,
        application: actualDb.contractApplications[merchantId],
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/supplier/verify-order") {
      ensureRole(auth, ["CLERK", "MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId || !body.partnerId || !body.orderId) {
        sendJson(res, 400, { error: "merchantId, partnerId and orderId are required" });
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
          operation: "SUPPLIER_VERIFY",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { supplierService } = getServicesForMerchant(merchantId);
      const result = supplierService.verifyPartnerOrder({
        partnerId: body.partnerId,
        orderId: body.orderId,
        minSpend: body.minSpend,
      });
      appendAuditLog({
        merchantId,
        action: "SUPPLIER_VERIFY",
        status: result.verified ? "SUCCESS" : "BLOCKED",
        auth,
        details: {
          partnerId: body.partnerId,
          orderId: body.orderId,
          minSpend: body.minSpend || 0,
          verified: result.verified,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    const proposalMatch = url.pathname.match(/^\/api\/merchant\/proposals\/([^/]+)\/confirm$/);
    if (method === "POST" && proposalMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const proposalId = proposalMatch[1];
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "PROPOSAL_CONFIRM",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = merchantService.confirmProposal({
        merchantId,
        proposalId,
        operatorId: auth.operatorId || body.operatorId || "system",
      });
      appendAuditLog({
        merchantId,
        action: "PROPOSAL_CONFIRM",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          campaignId: result.campaignId,
        },
      });
      wsHub.broadcast(merchantId, "PROPOSAL_CONFIRMED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/kill-switch") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "KILL_SWITCH_SET",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = merchantService.setKillSwitch({
        merchantId,
        enabled: body.enabled,
      });
      appendAuditLog({
        merchantId,
        action: "KILL_SWITCH_SET",
        status: "SUCCESS",
        auth,
        details: {
          enabled: Boolean(body.enabled),
        },
      });
      wsHub.broadcast(result.merchantId, "KILL_SWITCH_CHANGED", result);
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/tca/trigger") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      body.merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId: body.merchantId,
          operation: "TCA_TRIGGER",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { campaignService } = getServicesForMerchant(body.merchantId);
      const result = campaignService.triggerEvent(body);
      appendAuditLog({
        merchantId: body.merchantId,
        action: "TCA_TRIGGER",
        status: result.blockedByKillSwitch ? "BLOCKED" : "SUCCESS",
        auth,
        details: {
          event: body.event,
          executedCount: (result.executed || []).length,
          blockedByKillSwitch: Boolean(result.blockedByKillSwitch),
        },
      });
      wsHub.broadcast(body.merchantId, "TCA_TRIGGERED", result);
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createMerchantRoutesHandler,
};
