function toTimestampMs(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function resolveDecisionOutcome(decision) {
  const executed = Array.isArray(decision && decision.executed) ? decision.executed : [];
  const rejected = Array.isArray(decision && decision.rejected) ? decision.rejected : [];
  if (executed.length > 0) {
    return "HIT";
  }
  if (rejected.length > 0) {
    return "BLOCKED";
  }
  return "NO_POLICY";
}

function uniqueReasonCodes(rejectedRows) {
  const rows = Array.isArray(rejectedRows) ? rejectedRows : [];
  return Array.from(
    new Set(
      rows
        .map((item) => String((item && item.reason) || "").trim())
        .filter(Boolean)
    )
  );
}

function resolveLastUpdatedAt(candidates = []) {
  let latestMs = 0;
  for (const item of candidates) {
    const ts = toTimestampMs(item);
    if (ts > latestMs) {
      latestMs = ts;
    }
  }
  return latestMs > 0 ? new Date(latestMs).toISOString() : null;
}

function createPolicyGovernanceService(db, { policyOsService, now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
  }
  if (!policyOsService) {
    throw new Error("policyOsService is required");
  }

  function assertMerchantExists(merchantId) {
    const safeMerchantId = String(merchantId || "").trim();
    const merchant = db.merchants && db.merchants[safeMerchantId];
    if (!merchant) {
      const error = new Error("merchant not found");
      error.statusCode = 404;
      throw error;
    }
    return safeMerchantId;
  }

  function buildDecision24hSummary(merchantId) {
    const cutoffMs = now() - 24 * 60 * 60 * 1000;
    const stateDecisions =
      db &&
      db.policyOs &&
      db.policyOs.decisions &&
      typeof db.policyOs.decisions === "object"
        ? Object.values(db.policyOs.decisions)
        : [];
    const scoped = stateDecisions
      .filter((item) => item && String(item.merchant_id || "") === merchantId)
      .filter((item) => String(item.mode || "").trim().toUpperCase() === "EXECUTE")
      .filter((item) => toTimestampMs(item.created_at) >= cutoffMs);

    let hit = 0;
    let blocked = 0;
    let noPolicy = 0;
    for (const item of scoped) {
      const outcome = resolveDecisionOutcome(item);
      if (outcome === "HIT") {
        hit += 1;
      } else if (outcome === "BLOCKED") {
        blocked += 1;
      } else {
        noPolicy += 1;
      }
    }
    return {
      hit,
      blocked,
      noPolicy,
      total: scoped.length
    };
  }

  function buildAudit24hSummary(merchantId) {
    const cutoffMs = now() - 24 * 60 * 60 * 1000;
    const rows = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    const scoped = rows
      .filter((item) => item && String(item.merchantId || "") === merchantId)
      .filter((item) => toTimestampMs(item.timestamp || item.createdAt) >= cutoffMs);
    let success = 0;
    let blocked = 0;
    let failed = 0;
    for (const row of scoped) {
      const status = String(row.status || "").trim().toUpperCase();
      if (status === "SUCCESS") {
        success += 1;
      } else if (status === "BLOCKED" || status === "DENIED") {
        blocked += 1;
      } else {
        failed += 1;
      }
    }
    return {
      success,
      blocked,
      failed,
      total: scoped.length
    };
  }

  function getOverview({ merchantId }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const merchant = db.merchants[safeMerchantId];
    const drafts = policyOsService.listDrafts({ merchantId: safeMerchantId });
    const policies = policyOsService.listPolicies({
      merchantId: safeMerchantId,
      includeInactive: true
    });
    const pendingApprovalCount = drafts.filter((item) => item && item.status === "SUBMITTED").length;
    const approvedAwaitPublishCount = drafts.filter((item) => item && item.status === "APPROVED").length;
    const activePolicyCount = policies.filter((item) => item && item.status === "PUBLISHED").length;
    const pausedPolicyCount = policies.filter((item) => item && item.status === "PAUSED").length;
    const decision24h = buildDecision24hSummary(safeMerchantId);
    const audit24h = buildAudit24hSummary(safeMerchantId);
    const lastUpdatedAt = resolveLastUpdatedAt([
      ...drafts.map((item) => item && item.updated_at),
      ...policies.map((item) => item && (item.updated_at || item.published_at)),
      ...((Array.isArray(db.auditLogs) ? db.auditLogs : [])
        .filter((item) => item && item.merchantId === safeMerchantId)
        .map((item) => item.timestamp || item.createdAt)),
      ...((db.policyOs &&
      db.policyOs.decisions &&
      typeof db.policyOs.decisions === "object"
        ? Object.values(db.policyOs.decisions)
        : [])
        .filter((item) => item && item.merchant_id === safeMerchantId)
        .map((item) => item.created_at))
    ]);

    return {
      merchantId: safeMerchantId,
      pendingApprovalCount,
      approvedAwaitPublishCount,
      activePolicyCount,
      pausedPolicyCount,
      killSwitchEnabled: Boolean(merchant && merchant.killSwitchEnabled),
      decision24h,
      audit24h,
      lastUpdatedAt
    };
  }

  function listApprovals({ merchantId, status = "ALL", limit = 20 }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const normalizedStatus = String(status || "ALL").trim().toUpperCase() || "ALL";
    const allowedStatus = new Set(["ALL", "SUBMITTED", "APPROVED", "PUBLISHED"]);
    if (!allowedStatus.has(normalizedStatus)) {
      const error = new Error("invalid status");
      error.statusCode = 400;
      throw error;
    }
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 100);
    const queueStatuses = new Set(["SUBMITTED", "APPROVED", "PUBLISHED"]);

    const drafts = policyOsService.listDrafts({ merchantId: safeMerchantId });
    const approvals =
      typeof policyOsService.listApprovals === "function"
        ? policyOsService.listApprovals({ merchantId: safeMerchantId, limit: 200 })
        : [];
    const approvalById = new Map(
      approvals
        .filter((item) => item && item.approval_id)
        .map((item) => [String(item.approval_id), item])
    );
    const policies = policyOsService.listPolicies({
      merchantId: safeMerchantId,
      includeInactive: true
    });
    const policyById = new Map(
      policies
        .filter((item) => item && item.policy_id)
        .map((item) => [String(item.policy_id), item])
    );

    const rows = drafts
      .filter((item) => queueStatuses.has(String(item && item.status ? item.status : "").toUpperCase()))
      .filter((item) =>
        normalizedStatus === "ALL" ? true : String(item.status || "").toUpperCase() === normalizedStatus
      )
      .map((draft) => {
        const approvalId = String(draft.approval_id || "").trim();
        const approval = approvalById.get(approvalId) || null;
        const publishedPolicyId = String(draft.published_policy_id || "").trim();
        const publishedPolicy = policyById.get(publishedPolicyId) || null;
        return {
          draftId: String(draft.draft_id || ""),
          policyKey: String(draft.spec && draft.spec.policy_key ? draft.spec.policy_key : ""),
          policyName: String(draft.spec && draft.spec.name ? draft.spec.name : ""),
          status: String(draft.status || ""),
          submittedAt: draft.submitted_at || null,
          submittedBy: draft.submitted_by || null,
          approvalId: approvalId || null,
          approvedAt: approval ? approval.approved_at || null : draft.approved_at || null,
          approverId: approval ? approval.approver_id || null : null,
          publishedPolicyId: publishedPolicyId || null,
          publishedAt: publishedPolicy
            ? publishedPolicy.published_at || null
            : null,
          updatedAt: draft.updated_at || null
        };
      })
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));

    return {
      merchantId: safeMerchantId,
      status: normalizedStatus,
      items: rows.slice(0, safeLimit),
      pageInfo: {
        limit: safeLimit,
        returned: Math.min(rows.length, safeLimit),
        total: rows.length
      }
    };
  }

  function listReplays({
    merchantId,
    event = "",
    outcome = "ALL",
    mode = "EXECUTE",
    limit = 20
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const normalizedEvent = String(event || "").trim().toUpperCase();
    const normalizedMode = String(mode || "EXECUTE").trim().toUpperCase() || "EXECUTE";
    const normalizedOutcome = String(outcome || "ALL").trim().toUpperCase() || "ALL";
    const allowedOutcome = new Set(["ALL", "HIT", "BLOCKED", "NO_POLICY"]);
    if (!allowedOutcome.has(normalizedOutcome)) {
      const error = new Error("invalid outcome");
      error.statusCode = 400;
      throw error;
    }
    if (!["EXECUTE", "EVALUATE"].includes(normalizedMode)) {
      const error = new Error("invalid mode");
      error.statusCode = 400;
      throw error;
    }
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 100);

    const decisions = policyOsService.listDecisions({
      merchantId: safeMerchantId,
      event: normalizedEvent || "",
      mode: normalizedMode,
      limit: 200
    });
    const rows = decisions
      .map((decision) => {
        const resolvedOutcome = resolveDecisionOutcome(decision);
        return {
          decisionId: String(decision.decision_id || ""),
          traceId: String(decision.trace_id || ""),
          event: String(decision.event || ""),
          mode: String(decision.mode || ""),
          userId: String(decision.user_id || ""),
          outcome: resolvedOutcome,
          executed: Array.isArray(decision.executed) ? decision.executed : [],
          rejected: Array.isArray(decision.rejected) ? decision.rejected : [],
          reasonCodes: uniqueReasonCodes(decision.rejected),
          createdAt: String(decision.created_at || "")
        };
      })
      .filter((row) => (normalizedOutcome === "ALL" ? true : row.outcome === normalizedOutcome));

    return {
      merchantId: safeMerchantId,
      event: normalizedEvent || null,
      mode: normalizedMode,
      outcome: normalizedOutcome,
      items: rows.slice(0, safeLimit),
      pageInfo: {
        limit: safeLimit,
        returned: Math.min(rows.length, safeLimit),
        total: rows.length
      }
    };
  }

  return {
    getOverview,
    listApprovals,
    listReplays
  };
}

module.exports = {
  createPolicyGovernanceService
};
