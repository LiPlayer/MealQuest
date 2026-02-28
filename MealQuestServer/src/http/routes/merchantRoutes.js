const {
  readJsonBody,
  sendJson,
  ensureRole,
  buildContractApplication,
  listMerchantIdsByOwnerPhone,
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
      sendJson(res, 200, await merchantService.getDashboard({ merchantId }));
      return true;
    }

    // AI Strategy Chat HTTP routes removed (now WS-only)


    const strategyChatReviewMatch = url.pathname.match(
      /^\/api\/merchant\/strategy-chat\/proposals\/([^/]+)\/review$/
    );
    if (method === "POST" && strategyChatReviewMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const proposalId = strategyChatReviewMatch[1];
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
          operation: "POLICY_DRAFT_APPROVE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.reviewStrategyChatProposal({
        merchantId,
        proposalId,
        decision: body.decision,
        operatorId: auth.operatorId || "system",
      });
      appendAuditLog({
        merchantId,
        action: "STRATEGY_CHAT_REVIEW",
        status: "SUCCESS",
        auth,
        details: {
          sessionId: result.sessionId || null,
          proposalId,
          reviewStatus: result.status || null,
          campaignId: result.campaignId || null,
          policyId: result.policyId || null,
          draftId: result.draftId || null,
        },
      });
      const wsPayload = { ...result };
      if (Object.prototype.hasOwnProperty.call(wsPayload, "approvalToken")) {
        delete wsPayload.approvalToken;
      }
      wsHub.broadcast(merchantId, "STRATEGY_CHAT_REVIEWED", wsPayload);
      sendJson(res, 200, result);
      return true;
    }

    const strategyChatSimulateMatch = url.pathname.match(
      /^\/api\/merchant\/strategy-chat\/proposals\/([^/]+)\/simulate$/
    );
    if (method === "POST" && strategyChatSimulateMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const proposalId = strategyChatSimulateMatch[1];
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
          operation: "POLICY_SIMULATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.simulateProposalPolicy({
        merchantId,
        proposalId,
        operatorId: auth.operatorId || "system",
        userId: body.userId || "",
        event: body.event || "",
        eventId: body.eventId || "",
        context: body.context || {},
      });
      appendAuditLog({
        merchantId,
        action: "STRATEGY_CHAT_SIMULATE",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          decisionId: result.simulation && result.simulation.decision_id ? result.simulation.decision_id : null,
          selected: Array.isArray(result.simulation && result.simulation.selected)
            ? result.simulation.selected.length
            : 0,
          rejected: Array.isArray(result.simulation && result.simulation.rejected)
            ? result.simulation.rejected.length
            : 0,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    const strategyChatPublishMatch = url.pathname.match(
      /^\/api\/merchant\/strategy-chat\/proposals\/([^/]+)\/publish$/
    );
    if (method === "POST" && strategyChatPublishMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const proposalId = strategyChatPublishMatch[1];
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
          operation: "POLICY_PUBLISH",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.publishApprovedProposalPolicy({
        merchantId,
        proposalId,
        operatorId: auth.operatorId || "system",
      });
      appendAuditLog({
        merchantId,
        action: "STRATEGY_CHAT_PUBLISH",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          policyId: result.policyId || null,
          draftId: result.draftId || null,
        },
      });
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
      if (!(await tenantRepository.getMerchant(merchantId))) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }
      const item = await runWithRootFreshRead(async (rootDb) =>
        (rootDb.contractApplications && rootDb.contractApplications[merchantId]) || null
      );
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
      if (!(await tenantRepository.getMerchant(merchantId))) {
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
      const phoneBoundMerchants = await runWithRootFreshRead(async (rootDb) =>
        listMerchantIdsByOwnerPhone(rootDb, application.contactPhone).filter(
          (id) => id !== merchantId
        )
      );
      if (phoneBoundMerchants.length > 0) {
        sendJson(res, 409, { error: "contactPhone already bound to another merchant" });
        return true;
      }
      const persistedApplication = await runWithRootFreshState(async (rootDb) => {
        if (!rootDb.contractApplications || typeof rootDb.contractApplications !== "object") {
          rootDb.contractApplications = {};
        }
        rootDb.contractApplications[merchantId] = {
          merchantId,
          ...application,
        };
        rootDb.appendAuditLog({
          merchantId,
          action: "CONTRACT_APPLY",
          status: "SUCCESS",
          role: auth && auth.role,
          operatorId: auth && (auth.operatorId || auth.userId),
          details: {
            companyName: application.companyName,
            licenseNo: application.licenseNo,
            contactPhone: application.contactPhone,
          },
        });
        return rootDb.contractApplications[merchantId];
      });

      sendJson(res, 200, {
        merchantId,
        status: application.status,
        application: persistedApplication,
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
      const result = await supplierService.verifyPartnerOrder({
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
      const result = await merchantService.setKillSwitch({
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

    return false;
  };
}

module.exports = {
  createMerchantRoutesHandler,
};
