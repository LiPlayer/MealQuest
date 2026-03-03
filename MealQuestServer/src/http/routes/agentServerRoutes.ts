const {
  readJsonBody,
  sendJson,
  ensureRole,
  enforceTenantPolicyForHttp,
} = require("../serverHelpers");

const AGENT_SERVER_PREFIX = "/api/langgraph";

function writeSseEvent(res, eventName, data) {
  const safeEvent = String(eventName || "custom").trim() || "custom";
  const payload = data === undefined ? null : data;
  res.write(`event: ${safeEvent}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createAgentServerRoutesHandler({
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
    const scopedMerchantId = String(auth.merchantId || bodyMerchantId || "").trim();
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

  function matchPath(pathname, pattern) {
    const match = pathname.match(pattern);
    return match ? match.slice(1) : null;
  }

  return async function handleAgentServerRoutes({ method, url, req, auth, res }) {
    if (!url.pathname.startsWith(AGENT_SERVER_PREFIX)) {
      return false;
    }

    ensureRole(auth, MERCHANT_ROLES);

    if (method === "POST" && url.pathname === `${AGENT_SERVER_PREFIX}/assistants/search`) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const { agentServerService } = getServicesForMerchant(merchantId);
      sendJson(res, 200, agentServerService.listAssistants());
      return true;
    }

    const assistantMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/assistants/([^/]+)$`),
    );
    if (method === "GET" && assistantMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const assistantId = assistantMatch[0];
      const { agentServerService } = getServicesForMerchant(merchantId);
      const assistant = agentServerService.getAssistant(assistantId);
      if (!assistant) {
        sendJson(res, 404, { error: "assistant not found" });
        return true;
      }
      sendJson(res, 200, assistant);
      return true;
    }

    if (method === "POST" && url.pathname === `${AGENT_SERVER_PREFIX}/threads`) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      const { agentServerService } = getServicesForMerchant(merchantId);
      const thread = agentServerService.getOrCreateThreadForMerchant({
        merchantId,
        threadId: body && body.thread_id,
        metadata: (body && body.metadata) || {},
      });
      sendJson(res, 200, thread);
      return true;
    }

    const threadMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)$`),
    );
    if (method === "GET" && threadMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const threadId = threadMatch[0];
      const { agentServerService } = getServicesForMerchant(merchantId);
      const thread = agentServerService.getThread({ merchantId, threadId });
      if (!thread) {
        sendJson(res, 404, { error: "thread not found" });
        return true;
      }
      sendJson(res, 200, thread);
      return true;
    }

    const copyThreadMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/copy$`),
    );
    if (method === "POST" && copyThreadMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const threadId = copyThreadMatch[0];
      const { agentServerService } = getServicesForMerchant(merchantId);
      try {
        const copied = agentServerService.copyThread({ merchantId, threadId });
        sendJson(res, 200, copied);
      } catch (error) {
        sendJson(res, 404, { error: "thread not found" });
      }
      return true;
    }

    const threadStateMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/state$`),
    );
    if (method === "GET" && threadStateMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const threadId = threadStateMatch[0];
      const { agentServerService } = getServicesForMerchant(merchantId);
      const thread = agentServerService.getThread({ merchantId, threadId });
      if (!thread) {
        sendJson(res, 404, { error: "thread not found" });
        return true;
      }
      sendJson(res, 200, agentServerService.getThreadState(thread));
      return true;
    }

    const threadHistoryMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/history$`),
    );
    if (method === "POST" && threadHistoryMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const threadId = threadHistoryMatch[0];
      const { agentServerService } = getServicesForMerchant(merchantId);
      const thread = agentServerService.getThread({ merchantId, threadId });
      if (!thread) {
        sendJson(res, 404, { error: "thread not found" });
        return true;
      }
      sendJson(res, 200, [agentServerService.getThreadState(thread)]);
      return true;
    }

    const runStreamWithThreadMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/runs/stream$`),
    );
    if (
      method === "POST" &&
      (runStreamWithThreadMatch || url.pathname === `${AGENT_SERVER_PREFIX}/runs/stream`)
    ) {
      const body = await readJsonBody(req);
      const merchantId = resolveScopedMerchantId(auth, body);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "STRATEGY_CHAT_WRITE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }

      const { agentServerService } = getServicesForMerchant(merchantId);
      let headersSent = false;
      const pendingEvents = [];
      const emitStreamEvent = (event, data) => {
        if (!headersSent) {
          pendingEvents.push({ event, data });
          return;
        }
        writeSseEvent(res, event, data);
      };

      const ensureStreamHeaders = ({ threadId, runId }) => {
        if (headersSent) {
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Content-Location": `/threads/${threadId}/runs/${runId}`,
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
        const result = await agentServerService.runWithStream({
          merchantId,
          threadId: runStreamWithThreadMatch ? runStreamWithThreadMatch[0] : undefined,
          assistantId: body && body.assistant_id,
          payload: body || {},
          onRunCreated: ({ run, thread }) => {
            ensureStreamHeaders({
              threadId: thread.thread_id,
              runId: run.run_id,
            });
            emitStreamEvent("metadata", {
              run_id: run.run_id,
              thread_id: thread.thread_id,
            });
          },
          onEvent: (event, data) => {
            emitStreamEvent(event, data);
          },
        });

        ensureStreamHeaders({
          threadId: result.thread.thread_id,
          runId: result.run.run_id,
        });
        writeSseEvent(res, "end", {
          thread_id: result.thread.thread_id,
          run_id: result.run.run_id,
          status: result.run.status,
        });
        res.end();
      } catch (error) {
        if (!headersSent) {
          sendJson(res, 400, {
            error: error && error.message ? String(error.message) : "run stream failed",
          });
          return true;
        }
        writeSseEvent(res, "error", {
          error: error && error.message ? String(error.message) : "run stream failed",
          message: error && error.message ? String(error.message) : "run stream failed",
        });
        res.end();
      }
      return true;
    }

    const runDetailMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/runs/([^/]+)$`),
    );
    if (method === "GET" && runDetailMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const [threadId, runId] = runDetailMatch;
      const { agentServerService } = getServicesForMerchant(merchantId);
      const run = agentServerService.getRun({ merchantId, threadId, runId });
      if (!run) {
        sendJson(res, 404, { error: "run not found" });
        return true;
      }
      sendJson(res, 200, run);
      return true;
    }

    const runCancelMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/runs/([^/]+)/cancel$`),
    );
    if (method === "POST" && runCancelMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      if (
        !enforceTenantPolicyForHttp({
          tenantPolicyManager,
          merchantId,
          operation: "STRATEGY_CHAT_WRITE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const [threadId, runId] = runCancelMatch;
      const { agentServerService } = getServicesForMerchant(merchantId);
      try {
        const run = agentServerService.cancelRun({ merchantId, threadId, runId });
        sendJson(res, 200, run);
      } catch {
        sendJson(res, 404, { error: "run not found" });
      }
      return true;
    }

    const runJoinStreamMatch = matchPath(
      url.pathname,
      new RegExp(`^${AGENT_SERVER_PREFIX}/threads/([^/]+)/runs/([^/]+)/stream$`),
    );
    if (method === "GET" && runJoinStreamMatch) {
      const merchantId = resolveScopedMerchantId(auth);
      const [threadId, runId] = runJoinStreamMatch;
      const { agentServerService } = getServicesForMerchant(merchantId);
      const run = agentServerService.getRun({ merchantId, threadId, runId });
      const thread = agentServerService.getThread({ merchantId, threadId });
      if (!run || !thread) {
        sendJson(res, 404, { error: "run not found" });
        return true;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Location": `/threads/${threadId}/runs/${runId}`,
      });
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      writeSseEvent(res, "metadata", {
        run_id: runId,
        thread_id: threadId,
      });
      writeSseEvent(res, "values", thread.values || { messages: [] });
      writeSseEvent(res, "end", {
        thread_id: threadId,
        run_id: runId,
        status: run.status,
      });
      res.end();
      return true;
    }

    return false;
  };
}

module.exports = {
  createAgentServerRoutesHandler,
};
