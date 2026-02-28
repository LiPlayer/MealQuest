const { randomUUID } = require("node:crypto");
const { createPolicyId, ensurePolicyOsState } = require("./state");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

  function createDraft({ merchantId, operatorId, spec, templateId = "" }) {
    const state = ensureState();
    const validated = schemaRegistry.validatePolicySpec(spec);
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

  return {
    createDraft,
    submitDraft,
    approveDraft,
    publishDraft,
    getDraft,
    listDrafts,
    listPolicies,
    listActivePolicies,
    getExecutionPlan,
    saveDecision,
    getDecision,
    expirePolicies
  };
}

module.exports = {
  createPolicyRegistry
};
