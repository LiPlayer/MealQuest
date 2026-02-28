const {
  readJsonBody,
  sendJson,
  ensureRole,
  enforceTenantPolicyForHttp
} = require("../serverHelpers");

function createPolicyOsRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  appendAuditLog
}) {
  function readApprovalId(req, body = {}) {
    return (
      (req.headers && req.headers["x-approval-id"]) ||
      body.approvalId ||
      body.approval_id ||
      ""
    );
  }

  function readApprovalToken(req, body = {}) {
    return (
      (req.headers && req.headers["x-approval-token"]) ||
      body.approvalToken ||
      body.approval_token ||
      ""
    );
  }

  return async function handlePolicyOsRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/policyos/schemas") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, {
        merchantId,
        schemas: policyOsService.getSchemas()
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/policyos/plugins") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, {
        merchantId,
        plugins: policyOsService.listPlugins()
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/policyos/drafts") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
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
          operation: "POLICY_DRAFT_CREATE",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      const draft = policyOsService.createDraft({
        merchantId,
        operatorId: auth.operatorId || auth.userId || "system",
        spec: body.spec,
        templateId: body.templateId || ""
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_DRAFT_CREATE",
        status: "SUCCESS",
        auth,
        details: {
          draftId: draft.draft_id,
          policyKey: draft.spec.policy_key
        }
      });
      sendJson(res, 200, draft);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/policyos/drafts") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, {
        merchantId,
        items: policyOsService.listDrafts({ merchantId })
      });
      return true;
    }

    const submitMatch = url.pathname.match(/^\/api\/policyos\/drafts\/([^/]+)\/submit$/);
    if (method === "POST" && submitMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const draftId = decodeURIComponent(submitMatch[1]);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "POLICY_DRAFT_SUBMIT",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      const draft = policyOsService.submitDraft({
        merchantId,
        draftId,
        operatorId: auth.operatorId || auth.userId || "system"
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_DRAFT_SUBMIT",
        status: "SUCCESS",
        auth,
        details: {
          draftId
        }
      });
      sendJson(res, 200, draft);
      return true;
    }

    const approveMatch = url.pathname.match(/^\/api\/policyos\/drafts\/([^/]+)\/approve$/);
    if (method === "POST" && approveMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const draftId = decodeURIComponent(approveMatch[1]);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "POLICY_DRAFT_APPROVE",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      const result = policyOsService.approveDraft({
        merchantId,
        draftId,
        operatorId: auth.operatorId || auth.userId || "system",
        approvalLevel: auth.role || "OWNER"
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_DRAFT_APPROVE",
        status: "SUCCESS",
        auth,
        details: {
          draftId,
          approvalId: result.approvalId
        }
      });
      sendJson(res, 200, result);
      return true;
    }

    const publishMatch = url.pathname.match(/^\/api\/policyos\/drafts\/([^/]+)\/publish$/);
    if (method === "POST" && publishMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const draftId = decodeURIComponent(publishMatch[1]);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "POLICY_PUBLISH",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const approvalToken = readApprovalToken(req, body);
      const { policyOsService } = getServicesForMerchant(merchantId);
      const result = policyOsService.publishDraft({
        merchantId,
        draftId,
        operatorId: auth.operatorId || auth.userId || "system",
        approvalId: readApprovalId(req, body),
        approvalToken
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_PUBLISH",
        status: "SUCCESS",
        auth,
        details: {
          draftId,
          policyId: result.policy.policy_id
        }
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === "/api/policyos/policies") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      const includeInactive = String(url.searchParams.get("includeInactive") || "false") === "true";
      const { policyOsService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, {
        merchantId,
        items: policyOsService.listPolicies({ merchantId, includeInactive })
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/policyos/decision/simulate") {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "POLICY_SIMULATE",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      const result = await policyOsService.simulateDecision({
        merchantId,
        userId: body.userId,
        event: body.event,
        eventId: body.eventId || "",
        context: body.context || {},
        draftId: body.draftId || body.draft_id || ""
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_SIMULATE",
        status: "SUCCESS",
        auth,
        details: {
          decisionId: result.decision_id,
          selected: Array.isArray(result.selected) ? result.selected.length : 0,
          rejected: Array.isArray(result.rejected) ? result.rejected.length : 0
        }
      });
      sendJson(res, 200, result);
      return true;
    }

    if (
      method === "POST" &&
      (url.pathname === "/api/policyos/decision/execute" || url.pathname === "/api/policyos/decision/evaluate")
    ) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "POLICY_EXECUTE",
          res,
          auth,
          appendAuditLog
        })
      ) {
        return true;
      }
      const { policyOsService } = getServicesForMerchant(merchantId);
      const result = await policyOsService.executeDecision({
        merchantId,
        userId: body.userId,
        event: body.event,
        eventId: body.eventId || "",
        context: body.context || {}
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_EXECUTE",
        status: "SUCCESS",
        auth,
        details: {
          decisionId: result.decision_id,
          executed: result.executed.length
        }
      });
      sendJson(res, 200, result);
      return true;
    }

    const explainMatch = url.pathname.match(/^\/api\/policyos\/decisions\/([^/]+)\/explain$/);
    if (method === "GET" && explainMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      const decisionId = decodeURIComponent(explainMatch[1]);
      const { policyOsService } = getServicesForMerchant(merchantId);
      const explain = policyOsService.getDecisionExplain(decisionId);
      if (!explain) {
        sendJson(res, 404, { error: "decision not found" });
        return true;
      }
      sendJson(res, 200, explain);
      return true;
    }

    if (method === "POST" && url.pathname === "/api/policyos/compliance/retention/run") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const { policyOsService } = getServicesForMerchant(merchantId);
      const result = policyOsService.runRetentionJobs({
        behaviorRetentionDays: body.behaviorRetentionDays,
        transactionRetentionDays: body.transactionRetentionDays
      });
      appendAuditLog({
        merchantId,
        action: "POLICY_RETENTION_RUN",
        status: "SUCCESS",
        auth,
        details: result
      });
      sendJson(res, 200, result);
      return true;
    }

    return false;
  };
}

module.exports = {
  createPolicyOsRoutesHandler
};
