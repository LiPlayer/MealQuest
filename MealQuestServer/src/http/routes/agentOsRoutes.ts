const {
  readJsonBody,
  sendJson,
  ensureRole,
  enforceTenantPolicyForHttp,
  toListLimit,
} = require("../serverHelpers");

const AGENT_OS_PREFIX = "/api/agent-os";

function writeSseEvent(res, eventName, data) {
  const safeEvent = String(eventName || "custom").trim() || "custom";
  const payload = data === undefined ? null : data;
  res.write(`event: ${safeEvent}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createAgentOsRoutesHandler({
  tenantPolicyManager,
  getServicesForMerchant,
  MERCHANT_ROLES,
  appendAuditLog,
}) {
  function resolveScopedMerchantId(auth, body = {}) {
    const bodyMerchantId =
      (body &&
        ((body.context && body.context.merchantId) ||
          (body.metadata && body.metadata.merchantId) ||
          body.merchantId)) ||
      "";
    const safeBodyMerchantId = String(bodyMerchantId || "").trim();
    if (auth.merchantId && safeBodyMerchantId && safeBodyMerchantId !== auth.merchantId) {
      const err = new Error("merchant scope denied");
      err.statusCode = 403;
      throw err;
    }
    const scopedMerchantId = String(auth.merchantId || safeBodyMerchantId || "").trim();
    if (!scopedMerchantId) {
      const err = new Error("merchantId is required");
      err.statusCode = 400;
      throw err;
    }
    if (auth.merchantId && scopedMerchantId !== auth.merchantId) {
      const err = new Error("merchant scope denied");
      err.statusCode = 403;
      throw err;
    }
    return scopedMerchantId;
  }

  function resolveScopedOperatorId(auth) {
    const scopedOperatorId = String(auth && auth.operatorId ? auth.operatorId : "").trim();
    if (!scopedOperatorId) {
      const err = new Error("operatorId is required");
      err.statusCode = 400;
      throw err;
    }
    return scopedOperatorId;
  }

  function matchPath(pathname, pattern) {
    const match = pathname.match(pattern);
    return match ? match.slice(1) : null;
  }

  return async function handleAgentOsRoutes({ method, url, req, auth, res }) {
    if (!url.pathname.startsWith(AGENT_OS_PREFIX)) {
      return false;
    }

    ensureRole(auth, MERCHANT_ROLES);

    if (method === "POST" && url.pathname === `${AGENT_OS_PREFIX}/agents/search`) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, agentRuntimeService.listAgents());
      return true;
    }

    const agentMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/agents/([^/]+)$`),
    );
    if (method === "GET" && agentMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const agentId = agentMatch[0];
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const agent = agentRuntimeService.getAgent(agentId);
      if (!agent) {
        sendJson(res, 404, { error: "agent not found" });
        return true;
      }
      sendJson(res, 200, agent);
      return true;
    }

    if (method === "POST" && url.pathname === `${AGENT_OS_PREFIX}/sessions`) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const operatorId = resolveScopedOperatorId(auth);
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getOrCreateSessionForOperator({
        merchantId,
        operatorId,
        metadata: (body && body.metadata) || {},
      });
      sendJson(res, 200, {
        ...session,
        thread_scope: "merchant_operator_singleton",
        memory_persistence: "process_memory_only",
      });
      return true;
    }

    const sessionMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)$`),
    );
    if (method === "GET" && sessionMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      const sessionId = sessionMatch[0];
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: true,
      });
      if (!session) {
        sendJson(res, 404, { error: "session not found" });
        return true;
      }
      sendJson(res, 200, {
        ...session,
        thread_scope: "merchant_operator_singleton",
        memory_persistence: "process_memory_only",
      });
      return true;
    }

    const sessionStateMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)/state$`),
    );
    if (method === "GET" && sessionStateMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      const sessionId = sessionStateMatch[0];
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: true,
      });
      if (!session) {
        sendJson(res, 404, { error: "session not found" });
        return true;
      }
      sendJson(res, 200, agentRuntimeService.getSessionState(session));
      return true;
    }

    const sessionHistoryMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)/history$`),
    );
    if (method === "POST" && sessionHistoryMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      const sessionId = sessionHistoryMatch[0];
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: true,
      });
      if (!session) {
        sendJson(res, 404, { error: "session not found" });
        return true;
      }
      sendJson(res, 200, [agentRuntimeService.getSessionState(session)]);
      return true;
    }

    if (method === "POST" && url.pathname === `${AGENT_OS_PREFIX}/proposals/generate`) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const operatorId = resolveScopedOperatorId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AGENT_PROPOSAL_GENERATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.generateProposalFromIntent({
        merchantId,
        operatorId,
        intent: body.intent || body.content || "",
        templateId: body.templateId || "",
        branchId: body.branchId || "",
        sourceSessionId:
          body.sessionId ||
          body.session_id ||
          (body.metadata && body.metadata.sessionId) ||
          null,
      });
      appendAuditLog({
        merchantId,
        action: "AGENT_PROPOSAL_GENERATE",
        status: "SUCCESS",
        auth,
        details: {
          proposalId: result && result.proposal ? result.proposal.proposalId : null,
          templateId: result && result.proposal ? result.proposal.templateId : null,
          status: result && result.proposal ? result.proposal.status : null,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && url.pathname === `${AGENT_OS_PREFIX}/proposals`) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = resolveScopedMerchantId(auth, {
        merchantId: url.searchParams.get("merchantId") || "",
      });
      const { merchantService } = getServicesForMerchant(merchantId);
      const payload = await merchantService.listProposalReviews({
        merchantId,
        status: url.searchParams.get("status") || "ALL",
        limit: toListLimit(url.searchParams.get("limit"), 20, 100),
      });
      sendJson(res, 200, payload);
      return true;
    }

    const proposalMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/proposals/([^/]+)$`),
    );
    if (method === "GET" && proposalMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const merchantId = resolveScopedMerchantId(auth, {
        merchantId: url.searchParams.get("merchantId") || "",
      });
      const proposalId = decodeURIComponent(proposalMatch[0]);
      const { merchantService } = getServicesForMerchant(merchantId);
      const payload = await merchantService.getProposalReviewDetail({
        merchantId,
        proposalId,
      });
      sendJson(res, 200, payload);
      return true;
    }

    const proposalEvaluateMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/proposals/([^/]+)/evaluate$`),
    );
    if (method === "POST" && proposalEvaluateMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const operatorId = resolveScopedOperatorId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AGENT_PROPOSAL_EVALUATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const proposalId = decodeURIComponent(proposalEvaluateMatch[0]);
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.evaluateProposalPolicy({
        merchantId,
        proposalId,
        operatorId,
        userId: body.userId || body.user_id || "",
        event: body.event || "",
        eventId: body.eventId || body.event_id || "",
        context: body.context && typeof body.context === "object" ? body.context : {},
        forceRefresh: body.forceRefresh === true || body.force_refresh === true,
      });
      appendAuditLog({
        merchantId,
        action: "AGENT_PROPOSAL_EVALUATE",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          draftId: result && result.draftId ? result.draftId : null,
          reused: Boolean(result && result.reused),
          decisionId:
            result && result.evaluation && result.evaluation.decision_id
              ? result.evaluation.decision_id
              : null,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    const proposalDecideMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/proposals/([^/]+)/decide$`),
    );
    if (method === "POST" && proposalDecideMatch) {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const operatorId = resolveScopedOperatorId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AGENT_PROPOSAL_DECIDE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const proposalId = decodeURIComponent(proposalDecideMatch[0]);
      const { merchantService } = getServicesForMerchant(merchantId);
      const decision = body.decision || body.action || "APPROVE";
      const result = await merchantService.decideProposalReview({
        merchantId,
        proposalId,
        operatorId,
        decision,
        reason: body.reason || "",
        userId: body.userId || body.user_id || "",
        event: body.event || "",
        forceRefresh: body.forceRefresh === true || body.force_refresh === true,
      });
      appendAuditLog({
        merchantId,
        action: "AGENT_PROPOSAL_DECIDE",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          decision: String(decision || "").trim().toUpperCase(),
          status: result && result.status ? result.status : null,
          draftId: result && result.draftId ? result.draftId : null,
          policyId: result && result.policyId ? result.policyId : null,
        },
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && url.pathname === `${AGENT_OS_PREFIX}/tasks/stream`) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const operatorId = resolveScopedOperatorId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AGENT_WRITE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      let headersSent = false;
      const pendingEvents = [];

      const emitStreamEvent = (event, data) => {
        if (!headersSent) {
          pendingEvents.push({ event, data });
          return;
        }
        writeSseEvent(res, event, data);
      };

      const ensureStreamHeaders = ({ sessionId, taskId }) => {
        if (headersSent) {
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Content-Location": `/sessions/${sessionId}/tasks/${taskId}`,
        });
        if (typeof res.flushHeaders === "function") {
          res.flushHeaders();
        }
        headersSent = true;
        for (const eventItem of pendingEvents) {
          writeSseEvent(res, eventItem.event, eventItem.data);
        }
        pendingEvents.length = 0;
      };

      try {
        const result = await agentRuntimeService.runWithStream({
          merchantId,
          operatorId,
          agentId: body && body.agent_id,
          payload: body || {},
          onTaskCreated: ({ task, session }) => {
            ensureStreamHeaders({
              sessionId: session.session_id,
              taskId: task.task_id,
            });
            emitStreamEvent("metadata", {
              task_id: task.task_id,
              session_id: session.session_id,
            });
          },
          onEvent: (event, data) => {
            emitStreamEvent(event, data);
          },
        });

        ensureStreamHeaders({
          sessionId: result.session.session_id,
          taskId: result.task.task_id,
        });
        writeSseEvent(res, "end", {
          session_id: result.session.session_id,
          task_id: result.task.task_id,
          status: result.task.status,
        });
        res.end();
      } catch (error) {
        if (!headersSent) {
          sendJson(res, 400, {
            error: error && error.message ? String(error.message) : "task stream failed",
          });
          return true;
        }
        writeSseEvent(res, "error", {
          error: error && error.message ? String(error.message) : "task stream failed",
          message: error && error.message ? String(error.message) : "task stream failed",
        });
        res.end();
      }
      return true;
    }

    const taskDetailMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)/tasks/([^/]+)$`),
    );
    if (method === "GET" && taskDetailMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      const [sessionId, taskId] = taskDetailMatch;
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: false,
      });
      if (!session) {
        sendJson(res, 404, { error: "task not found" });
        return true;
      }
      const task = agentRuntimeService.getTask({ merchantId, sessionId, taskId });
      if (!task) {
        sendJson(res, 404, { error: "task not found" });
        return true;
      }
      sendJson(res, 200, task);
      return true;
    }

    const taskCancelMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)/tasks/([^/]+)/cancel$`),
    );
    if (method === "POST" && taskCancelMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "AGENT_WRITE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const [sessionId, taskId] = taskCancelMatch;
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: false,
      });
      if (!session) {
        sendJson(res, 404, { error: "task not found" });
        return true;
      }
      try {
        const task = agentRuntimeService.cancelTask({ merchantId, sessionId, taskId });
        sendJson(res, 200, task);
      } catch {
        sendJson(res, 404, { error: "task not found" });
      }
      return true;
    }

    const taskJoinStreamMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_OS_PREFIX}/sessions/([^/]+)/tasks/([^/]+)/stream$`),
    );
    if (method === "GET" && taskJoinStreamMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const operatorId = resolveScopedOperatorId(auth);
      const [sessionId, taskId] = taskJoinStreamMatch;
      const { agentRuntimeService } = getServicesForMerchant(merchantId);
      const session = agentRuntimeService.getSessionForOperator({
        merchantId,
        operatorId,
        sessionId,
        autoCreate: false,
      });
      if (!session) {
        sendJson(res, 404, { error: "task not found" });
        return true;
      }
      const task = agentRuntimeService.getTask({ merchantId, sessionId, taskId });
      if (!task || !session) {
        sendJson(res, 404, { error: "task not found" });
        return true;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Location": `/sessions/${sessionId}/tasks/${taskId}`,
      });
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      writeSseEvent(res, "metadata", {
        task_id: taskId,
        session_id: sessionId,
      });
      writeSseEvent(res, "values", session.values || { messages: [] });
      writeSseEvent(res, "end", {
        session_id: sessionId,
        task_id: taskId,
        status: task.status,
      });
      res.end();
      return true;
    }

    return false;
  };
}

module.exports = {
  createAgentOsRoutesHandler,
};
