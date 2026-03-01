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

  function readMessageText(message) {
    if (!message || typeof message !== "object") {
      return "";
    }
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (!part || typeof part !== "object") {
            return "";
          }
          if (typeof part.text === "string") {
            return part.text;
          }
          if (typeof part.content === "string") {
            return part.content;
          }
          return "";
        })
        .filter(Boolean)
        .join("")
        .trim();
    }
    return "";
  }

  function extractLatestHumanText(input) {
    if (!input || typeof input !== "object") {
      return "";
    }
    if (typeof input.userMessage === "string" && input.userMessage.trim()) {
      return input.userMessage.trim();
    }
    const messages = Array.isArray(input.messages) ? input.messages : [];
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const item = messages[idx];
      if (!item || typeof item !== "object") {
        continue;
      }
      const role = String(item.type || item.role || "").trim().toLowerCase();
      if (role !== "human" && role !== "user") {
        continue;
      }
      const text = readMessageText(item);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function writeSseEvent(res, eventName, data) {
    const safeEvent = String(eventName || "").trim() || "custom";
    const safeData = data === undefined ? null : data;
    res.write(`event: ${safeEvent}\n`);
    res.write(`data: ${JSON.stringify(safeData)}\n\n`);
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

    if (method === "POST" && url.pathname === "/api/merchant/strategy-chat/stream") {
      ensureRole(auth, MERCHANT_ROLES);
      const body = await readJsonBody(req);
      const merchantId =
        auth.merchantId ||
        (body && body.context && body.context.merchantId) ||
        body.merchantId ||
        "";
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
          operation: "STRATEGY_CHAT_WRITE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const content = extractLatestHumanText(body && body.input);
      if (!content) {
        sendJson(res, 400, { error: "input.messages with latest human text is required" });
        return true;
      }

      const { merchantService } = getServicesForMerchant(merchantId);
      const startedAtMs = Date.now();
      let tokenCount = 0;
      const streamState = {
        userMessageId: "",
        assistantMessageId: "",
        userText: content,
        assistantText: "",
      };
      const emitProgress = (phase, status = "running", extras = {}) => {
        writeSseEvent(res, "custom", {
          kind: "agent_progress",
          payload: {
            phase: String(phase || "UNKNOWN"),
            status: String(status || "running"),
            tokenCount,
            elapsedMs: Math.max(0, Date.now() - startedAtMs),
            at: new Date().toISOString(),
            ...extras,
          },
        });
      };
      const toValues = () => ({
        messages: [
          {
            id: streamState.userMessageId || `m_user_${Date.now()}`,
            type: "human",
            content: streamState.userText,
          },
          {
            id: streamState.assistantMessageId || `m_ai_${Date.now()}`,
            type: "ai",
            content: streamState.assistantText,
          },
        ],
      });

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      try {
        writeSseEvent(res, "metadata", {
          protocol: "langchain.stream_events.v2",
          merchantId,
        });
        emitProgress("REQUEST_ACCEPTED");
        emitProgress("AGENT_EXECUTION_START");
        const result = await merchantService.sendStrategyChatMessage({
          merchantId,
          operatorId: auth.operatorId || "system",
          content,
          streamObserver: (eventPayload) => {
            if (!eventPayload || typeof eventPayload !== "object") {
              return;
            }
            const eventName = String(eventPayload.event || "").trim().toLowerCase();
            if (eventPayload.userMessageId) {
              streamState.userMessageId = String(eventPayload.userMessageId);
            }
            if (eventPayload.assistantMessageId) {
              streamState.assistantMessageId = String(eventPayload.assistantMessageId);
            }
            const data =
              eventPayload.data && typeof eventPayload.data === "object"
                ? eventPayload.data
                : {};
            if (eventName === "on_chat_model_start") {
              if (typeof data.input === "string" && data.input.trim()) {
                streamState.userText = data.input.trim();
              }
              emitProgress("LLM_STREAM_START");
              writeSseEvent(res, "values", toValues());
              return;
            }
            if (eventName === "on_chat_model_stream") {
              const chunk =
                data.chunk && typeof data.chunk === "object" ? data.chunk : {};
              const token = typeof chunk.text === "string" ? chunk.text : "";
              if (!token) {
                return;
              }
              tokenCount += 1;
              if (tokenCount === 1 || tokenCount % 8 === 0) {
                emitProgress("LLM_TOKEN_STREAMING");
              }
              streamState.assistantText += token;
              writeSseEvent(res, "values", toValues());
              return;
            }
            if (eventName === "on_chat_model_end") {
              const output =
                data.output && typeof data.output === "object" ? data.output : {};
              if (typeof output.text === "string") {
                streamState.assistantText = output.text;
              }
              emitProgress("LLM_STREAM_END", "completed");
              writeSseEvent(res, "values", toValues());
              return;
            }
            if (eventName === "on_chat_model_error") {
              emitProgress("LLM_STREAM_ERROR", "failed");
              writeSseEvent(res, "error", {
                error: {
                  message:
                    data &&
                    data.error &&
                    typeof data.error === "object" &&
                    typeof data.error.message === "string"
                      ? data.error.message
                      : "strategy chat stream failed",
                },
              });
            }
          },
        });

        if (!streamState.assistantText && typeof result.assistantMessage === "string") {
          streamState.assistantText = result.assistantMessage;
          writeSseEvent(res, "values", toValues());
        }
        emitProgress("DECISION_FINALIZING");
        writeSseEvent(res, "custom", {
          kind: "strategy_chat_delta",
          payload: result,
        });
        emitProgress("AGENT_EXECUTION_END", "completed", {
          resultStatus: result.status || "",
        });
        appendAuditLog({
          merchantId,
          action: "STRATEGY_CHAT_MESSAGE",
          status: "SUCCESS",
          auth,
          details: {
            sessionId: result.sessionId || null,
            status: result.status || null,
          },
        });
        res.end();
      } catch (error) {
        emitProgress("AGENT_EXECUTION_END", "failed", {
          error: error && error.message ? String(error.message) : "strategy chat stream failed",
        });
        writeSseEvent(res, "error", {
          error: {
            message: error && error.message ? String(error.message) : "strategy chat stream failed",
          },
        });
        appendAuditLog({
          merchantId,
          action: "STRATEGY_CHAT_MESSAGE",
          status: "FAILED",
          auth,
          details: {
            error: error && error.message ? String(error.message) : "strategy chat stream failed",
          },
        });
        res.end();
      }
      return true;
    }


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

    const strategyChatEvaluateMatch = url.pathname.match(
      /^\/api\/merchant\/strategy-chat\/proposals\/([^/]+)\/evaluate$/
    );
    if (method === "POST" && strategyChatEvaluateMatch) {
      ensureRole(auth, ["MANAGER", "OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      const proposalId = strategyChatEvaluateMatch[1];
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
          operation: "POLICY_EVALUATE",
          res,
          auth,
          appendAuditLog,
        })
      ) {
        return true;
      }
      const { merchantService } = getServicesForMerchant(merchantId);
      const result = await merchantService.evaluateProposalPolicy({
        merchantId,
        proposalId,
        operatorId: auth.operatorId || "system",
        userId: body.userId || "",
        event: body.event || "",
        eventId: body.eventId || "",
        context: body.context || {},
        forceRefresh: Boolean(body.forceRefresh),
      });
      appendAuditLog({
        merchantId,
        action: "STRATEGY_CHAT_EVALUATE",
        status: "SUCCESS",
        auth,
        details: {
          proposalId,
          decisionId: result.evaluation && result.evaluation.decision_id ? result.evaluation.decision_id : null,
          selected: Array.isArray(result.evaluation && result.evaluation.selected)
            ? result.evaluation.selected.length
            : 0,
          rejected: Array.isArray(result.evaluation && result.evaluation.rejected)
            ? result.evaluation.rejected.length
            : 0,
          reused: Boolean(result.reused),
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
