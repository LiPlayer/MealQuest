const { randomUUID } = require("node:crypto");
const { createPolicyId, ensurePolicyOsState } = require("./state");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePolicyPrefix(value) {
  return String(value || "").trim().toUpperCase();
}

function hasPolicyPrefix(decision, policyKeyPrefix) {
  const normalizedPrefix = normalizePolicyPrefix(policyKeyPrefix);
  if (!normalizedPrefix) {
    return true;
  }
  const executed = Array.isArray(decision && decision.executed) ? decision.executed : [];
  const selected = Array.isArray(decision && decision.selected) ? decision.selected : [];
  const rejected = Array.isArray(decision && decision.rejected) ? decision.rejected : [];
  const candidates = [
    ...executed,
    ...selected,
    ...rejected.map((item) => (item && item.policyId ? item.policyId : ""))
  ];
  return candidates.some((value) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) {
      return false;
    }
    return normalized.startsWith(`${normalizedPrefix}@`) || normalized.startsWith(normalizedPrefix);
  });
}

function assertActionParamCompleteness(policySpec) {
  const policyKey = String(policySpec && policySpec.policy_key ? policySpec.policy_key : "").trim();
  const actions = Array.isArray(policySpec && policySpec.actions) ? policySpec.actions : [];
  if (actions.length === 0) {
    throw new Error("policy action is required");
  }
  for (const action of actions) {
    const plugin = String(action && action.plugin ? action.plugin : "").trim();
    const params = action && action.params && typeof action.params === "object" ? action.params : {};
    if (!plugin) {
      throw new Error("policy action plugin is required");
    }
    if (plugin === "fragment_grant_v1") {
      const type = String(params.type || "").trim();
      const amount = Number(params.amount);
      if (!type || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`policy action params incomplete: ${plugin}`);
      }
      continue;
    }
    if (plugin === "wallet_grant_v1") {
      const account = String(params.account || "").trim();
      const amount = Number(params.amount);
      if (!account || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`policy action params incomplete: ${plugin}`);
      }
      continue;
    }
    if (plugin === "voucher_grant_v1") {
      const voucher = params.voucher && typeof params.voucher === "object" ? params.voucher : {};
      const voucherType = String(voucher.type || "").trim();
      const voucherName = String(voucher.name || "").trim();
      const voucherValue = Number(voucher.value);
      if (!voucherType || !voucherName || !Number.isFinite(voucherValue) || voucherValue <= 0) {
        throw new Error(`policy action params incomplete: ${plugin}`);
      }
      continue;
    }
  }
  if (policyKey === "ACT_CHECKIN_STREAK_RECOVERY_V1") {
    const hasFragmentGrant = actions.some(
      (item) => String(item && item.plugin ? item.plugin : "").trim() === "fragment_grant_v1"
    );
    if (!hasFragmentGrant) {
      throw new Error("policy action params incomplete: ACT_CHECKIN_STREAK_RECOVERY_V1");
    }
  }
  if (policyKey === "REV_ADDON_UPSELL_SLOW_ITEM_V1") {
    const hasVoucherGrant = actions.some(
      (item) => String(item && item.plugin ? item.plugin : "").trim() === "voucher_grant_v1"
    );
    const constraints = Array.isArray(policySpec && policySpec.constraints) ? policySpec.constraints : [];
    const inventoryConstraint = constraints.find(
      (item) => String(item && item.plugin ? item.plugin : "").trim() === "inventory_lock_v1"
    );
    const inventorySku = String(
      inventoryConstraint &&
      inventoryConstraint.params &&
      inventoryConstraint.params.sku
        ? inventoryConstraint.params.sku
        : ""
    ).trim();
    if (!hasVoucherGrant || !inventorySku) {
      throw new Error("policy action params incomplete: REV_ADDON_UPSELL_SLOW_ITEM_V1");
    }
  }
  if (policyKey === "RET_DORMANT_WINBACK_14D_V1") {
    const hasVoucherGrant = actions.some(
      (item) => String(item && item.plugin ? item.plugin : "").trim() === "voucher_grant_v1"
    );
    const segmentConditions =
      policySpec &&
      policySpec.segment &&
      policySpec.segment.params &&
      Array.isArray(policySpec.segment.params.conditions)
        ? policySpec.segment.params.conditions
        : [];
    const hasDormantCondition = segmentConditions.some((item) => {
      const field = String(item && item.field ? item.field : "").trim();
      const op = String(item && item.op ? item.op : "").trim().toLowerCase();
      const value = Number(item && item.value);
      if (field !== "inactiveDays") {
        return false;
      }
      if (!Number.isFinite(value) || value < 14) {
        return false;
      }
      return op === "gte" || op === "gt" || op === "eq";
    });
    if (!hasVoucherGrant || !hasDormantCondition) {
      throw new Error("policy action params incomplete: RET_DORMANT_WINBACK_14D_V1");
    }
  }
}

function createPolicyRegistry({
  db,
  schemaRegistry,
  approvalTokenService,
  now = () => Date.now()
}) {
  if (!db) {
    throw new Error("db is required");
  }
  if (!schemaRegistry) {
    throw new Error("schemaRegistry is required");
  }
  function ensureState() {
    return ensurePolicyOsState(db);
  }

  function nowIso() {
    return new Date(now()).toISOString();
  }

  function nextDraftId() {
    return `draft_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  function buildExecutionPlan(policy) {
    return {
      policyId: policy.policy_id,
      policyKey: policy.policy_key,
      merchantId: policy.resource_scope.merchant_id,
      lane: policy.lane,
      overlapPolicy: policy.overlap_policy,
      triggers: policy.triggers,
      segment: policy.segment,
      constraints: policy.constraints,
      scoring: policy.scoring,
      actions: policy.actions,
      story: policy.story || null,
      program: policy.program,
      governance: policy.governance,
      createdAt: nowIso()
    };
  }

  function listPoliciesByKey(policyKey) {
    const state = ensureState();
    return Object.values(state.policies)
      .filter((item) => item.policy_key === policyKey)
      .sort((a, b) => Number(a.version || 0) - Number(b.version || 0));
  }

  function listDrafts({ merchantId }) {
    const state = ensureState();
    return Object.values(state.drafts)
      .filter((item) => item.merchant_id === merchantId)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }

  function listPolicies({ merchantId, includeInactive = false }) {
    const state = ensureState();
    return Object.values(state.policies)
      .filter((item) => item.resource_scope && item.resource_scope.merchant_id === merchantId)
      .filter((item) => (includeInactive ? true : item.status === "PUBLISHED"))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }

  function getDraft({ merchantId, draftId }) {
    const state = ensureState();
    const draft = state.drafts[draftId];
    if (!draft || draft.merchant_id !== merchantId) {
      return null;
    }
    return clone(draft);
  }

  function getPolicy({ merchantId, policyId }) {
    const state = ensureState();
    const policy = state.policies[policyId];
    if (!policy || !policy.resource_scope || policy.resource_scope.merchant_id !== merchantId) {
      return null;
    }
    return clone(policy);
  }

  function createDraft({ merchantId, operatorId, spec, templateId = "" }) {
    const state = ensureState();
    const validated = schemaRegistry.validatePolicySpec(spec);
    assertActionParamCompleteness(validated);
    if (validated.resource_scope.merchant_id !== merchantId) {
      throw new Error("policy merchant scope mismatch");
    }
    const createdAt = nowIso();
    const draftId = nextDraftId();
    const draft = {
      draft_id: draftId,
      template_id: String(templateId || ""),
      merchant_id: merchantId,
      status: "DRAFT",
      created_by: operatorId || "system",
      created_at: createdAt,
      updated_at: createdAt,
      spec: validated
    };
    state.drafts[draftId] = draft;
    db.save();
    return clone(draft);
  }

  function submitDraft({ merchantId, draftId, operatorId }) {
    const state = ensureState();
    const draft = state.drafts[draftId];
    if (!draft || draft.merchant_id !== merchantId) {
      throw new Error("draft not found");
    }
    if (!["DRAFT", "REJECTED"].includes(draft.status)) {
      throw new Error("draft cannot be submitted");
    }
    draft.status = "SUBMITTED";
    draft.submitted_by = operatorId || "system";
    draft.submitted_at = nowIso();
    draft.updated_at = nowIso();
    db.save();
    return clone(draft);
  }

  function approveDraft({ merchantId, draftId, operatorId, approvalLevel = "OWNER" }) {
    const state = ensureState();
    const draft = state.drafts[draftId];
    if (!draft || draft.merchant_id !== merchantId) {
      throw new Error("draft not found");
    }
    if (draft.status !== "SUBMITTED") {
      throw new Error("draft is not submitted");
    }
    const ttlSec = Number(draft.spec.governance.approval_token_ttl_sec || 3600);
    const approvedAt = nowIso();
    const expiresAt = new Date(now() + Math.max(30, ttlSec) * 1000).toISOString();
    const token = approvalTokenService && typeof approvalTokenService.issueToken === "function"
      ? approvalTokenService.issueToken({
          merchantId,
          draftId,
          approverId: operatorId || "system",
          approvalLevel,
          scopes: ["publish"],
          ttlSec
        })
      : "";
    const approvalId = `approval_${randomUUID()}`;
    state.approvals[approvalId] = {
      approval_id: approvalId,
      draft_id: draftId,
      merchant_id: merchantId,
      approval_level: approvalLevel,
      approver_id: operatorId || "system",
      token,
      approved_at: approvedAt,
      expires_at: expiresAt,
      status: "APPROVED",
      used_at: null,
      used_for: null
    };
    draft.status = "APPROVED";
    draft.approval_id = approvalId;
    draft.approved_at = approvedAt;
    draft.updated_at = approvedAt;
    db.save();
    return {
      draft: clone(draft),
      approvalToken: token,
      approvalId
    };
  }

  function resolveApprovalForPublish({
    state,
    merchantId,
    draftId,
    approvalId = "",
    approvalToken = ""
  }) {
    const nowMs = now();
    const providedApprovalId = String(approvalId || "").trim();
    if (providedApprovalId) {
      const approval = state.approvals[providedApprovalId];
      if (!approval || approval.merchant_id !== merchantId) {
        throw new Error("approval not found");
      }
      if (approval.draft_id !== draftId) {
        throw new Error("approval draft mismatch");
      }
      const expiresAtMs = Date.parse(String(approval.expires_at || ""));
      if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
        throw new Error("approval expired");
      }
      if (approval.status !== "APPROVED") {
        throw new Error("approval is not approved");
      }
      if (approval.used_at) {
        throw new Error("approval already used");
      }
      return approval;
    }
    if (!approvalToken) {
      throw new Error("approvalId is required");
    }
    if (!approvalTokenService || typeof approvalTokenService.verifyToken !== "function") {
      throw new Error("approval token service is not configured");
    }
    const approvalPayload = approvalTokenService.verifyToken(approvalToken, {
      expectedMerchantId: merchantId,
      expectedScope: "publish"
    });
    if (approvalPayload.draftId !== draftId) {
      throw new Error("approval token draft mismatch");
    }
    return null;
  }

  function publishDraft({ merchantId, draftId, operatorId, approvalId = "", approvalToken = "" }) {
    const state = ensureState();
    const draft = state.drafts[draftId];
    if (!draft || draft.merchant_id !== merchantId) {
      throw new Error("draft not found");
    }
    if (draft.status !== "APPROVED") {
      throw new Error("draft is not approved");
    }
    const approval = resolveApprovalForPublish({
      state,
      merchantId,
      draftId,
      approvalId,
      approvalToken
    });
    if (approval) {
      approval.status = "PUBLISHED";
      approval.used_at = nowIso();
      approval.used_for = "PUBLISH";
    }

    const versions = listPoliciesByKey(draft.spec.policy_key);
    const version = versions.length > 0 ? Number(versions[versions.length - 1].version || 0) + 1 : 1;
    const policyId = createPolicyId(draft.spec.policy_key, version);
    const publishedAt = nowIso();
    const expiresAt = new Date(now() + Number(draft.spec.program.ttl_sec || 0) * 1000).toISOString();
    const policy = {
      ...clone(draft.spec),
      policy_id: policyId,
      version,
      status: "PUBLISHED",
      source_draft_id: draftId,
      published_by: operatorId || "system",
      published_at: publishedAt,
      updated_at: publishedAt,
      expires_at: expiresAt
    };
    state.policies[policyId] = policy;
    state.executionPlans[policyId] = buildExecutionPlan(policy);
    if (!Array.isArray(state.publishedByMerchant[merchantId])) {
      state.publishedByMerchant[merchantId] = [];
    }
    state.publishedByMerchant[merchantId] = Array.from(
      new Set([...(state.publishedByMerchant[merchantId] || []), policyId])
    );
    draft.status = "PUBLISHED";
    draft.published_policy_id = policyId;
    draft.updated_at = nowIso();
    db.save();
    return {
      draft: clone(draft),
      policy: clone(policy),
      executionPlan: clone(state.executionPlans[policyId])
    };
  }

  function expirePolicies({ merchantId }) {
    const state = ensureState();
    const nowMs = now();
    const published = Array.isArray(state.publishedByMerchant[merchantId])
      ? [...state.publishedByMerchant[merchantId]]
      : [];
    const remained = [];
    const expired = [];
    for (const policyId of published) {
      const policy = state.policies[policyId];
      if (!policy || policy.status !== "PUBLISHED") {
        continue;
      }
      const expiresAtMs = Date.parse(String(policy.expires_at || ""));
      if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
        remained.push(policyId);
        continue;
      }
      policy.status = "EXPIRED";
      policy.expired_at = nowIso();
      policy.updated_at = nowIso();
      expired.push(policyId);
    }
    state.publishedByMerchant[merchantId] = remained;
    if (expired.length > 0) {
      db.save();
    }
    return expired;
  }

  function listActivePolicies({ merchantId }) {
    expirePolicies({ merchantId });
    const state = ensureState();
    const published = Array.isArray(state.publishedByMerchant[merchantId])
      ? state.publishedByMerchant[merchantId]
      : [];
    return published
      .map((policyId) => state.policies[policyId])
      .filter((item) => item && item.status === "PUBLISHED")
      .map((item) => clone(item));
  }

  function pausePolicy({ merchantId, policyId, operatorId = "", reason = "" }) {
    const state = ensureState();
    const policy = state.policies[policyId];
    if (!policy || !policy.resource_scope || policy.resource_scope.merchant_id !== merchantId) {
      throw new Error("policy not found");
    }
    if (policy.status !== "PUBLISHED") {
      throw new Error("policy is not active");
    }
    policy.status = "PAUSED";
    policy.paused_at = nowIso();
    policy.paused_by = operatorId || "system";
    policy.pause_reason = String(reason || "").trim();
    policy.updated_at = nowIso();
    const active = Array.isArray(state.publishedByMerchant[merchantId])
      ? state.publishedByMerchant[merchantId]
      : [];
    state.publishedByMerchant[merchantId] = active.filter((id) => id !== policyId);
    db.save();
    return clone(policy);
  }

  function resumePolicy({ merchantId, policyId, operatorId = "" }) {
    const state = ensureState();
    const policy = state.policies[policyId];
    if (!policy || !policy.resource_scope || policy.resource_scope.merchant_id !== merchantId) {
      throw new Error("policy not found");
    }
    if (policy.status !== "PAUSED") {
      throw new Error("policy is not paused");
    }
    const expiresAtMs = Date.parse(String(policy.expires_at || ""));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= now()) {
      policy.status = "EXPIRED";
      policy.expired_at = nowIso();
      policy.updated_at = nowIso();
      db.save();
      throw new Error("policy already expired");
    }
    policy.status = "PUBLISHED";
    policy.resumed_at = nowIso();
    policy.resumed_by = operatorId || "system";
    policy.updated_at = nowIso();
    if (!Array.isArray(state.publishedByMerchant[merchantId])) {
      state.publishedByMerchant[merchantId] = [];
    }
    state.publishedByMerchant[merchantId] = Array.from(
      new Set([...(state.publishedByMerchant[merchantId] || []), policyId])
    );
    db.save();
    return clone(policy);
  }

  function getExecutionPlan(policyId) {
    const state = ensureState();
    return state.executionPlans[policyId] ? clone(state.executionPlans[policyId]) : null;
  }

  function saveDecision(decision) {
    const state = ensureState();
    state.decisions[decision.decision_id] = clone(decision);
    db.save();
  }

  function getDecision(decisionId) {
    const state = ensureState();
    return state.decisions[decisionId] ? clone(state.decisions[decisionId]) : null;
  }

  function listDecisions({
    merchantId,
    userId = "",
    event = "",
    mode = "",
    policyKeyPrefix = "",
    limit = 20
  }) {
    const state = ensureState();
    const normalizedMerchantId = String(merchantId || "").trim();
    if (!normalizedMerchantId) {
      return [];
    }
    const normalizedUserId = String(userId || "").trim();
    const normalizedEvent = String(event || "").trim().toUpperCase();
    const normalizedMode = String(mode || "").trim().toUpperCase();
    const max = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 200);
    return Object.values(state.decisions || {})
      .filter((item) => item && item.merchant_id === normalizedMerchantId)
      .filter((item) => (normalizedUserId ? String(item.user_id || "") === normalizedUserId : true))
      .filter((item) =>
        normalizedEvent ? String(item.event || "").trim().toUpperCase() === normalizedEvent : true
      )
      .filter((item) =>
        normalizedMode ? String(item.mode || "").trim().toUpperCase() === normalizedMode : true
      )
      .filter((item) => hasPolicyPrefix(item, policyKeyPrefix))
      .sort((left, right) => {
        const leftCreatedAt = String(left.created_at || "");
        const rightCreatedAt = String(right.created_at || "");
        const createdAtCompare = rightCreatedAt.localeCompare(leftCreatedAt);
        if (createdAtCompare !== 0) {
          return createdAtCompare;
        }
        return String(right.decision_id || "").localeCompare(String(left.decision_id || ""));
      })
      .slice(0, max)
      .map((item) => clone(item));
  }

  return {
    createDraft,
    submitDraft,
    approveDraft,
    publishDraft,
    pausePolicy,
    resumePolicy,
    getDraft,
    getPolicy,
    listDrafts,
    listPolicies,
    listActivePolicies,
    getExecutionPlan,
    saveDecision,
    getDecision,
    listDecisions,
    expirePolicies
  };
}

module.exports = {
  createPolicyRegistry
};
