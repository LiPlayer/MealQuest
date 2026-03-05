const { buildCustomerActivities } = require("../serverHelpers");

function laneToPriority(lane = "") {
  const normalized = String(lane || "").toUpperCase();
  if (normalized === "GUARDED") {
    return 85;
  }
  if (normalized === "NORMAL") {
    return 60;
  }
  return 40;
}

function toPolicyView(policy) {
  const safe = policy && typeof policy === "object" ? policy : {};
  const firstTrigger =
    Array.isArray(safe.triggers) && safe.triggers[0] && typeof safe.triggers[0] === "object"
      ? safe.triggers[0]
      : {};
  const segmentConditions =
    safe.segment &&
    safe.segment.params &&
    Array.isArray(safe.segment.params.conditions)
      ? safe.segment.params.conditions
      : [];
  const budgetConstraint =
    Array.isArray(safe.constraints) &&
    safe.constraints.find(
      (item) => item && item.plugin === "budget_guard_v1" && item.params
    );
  return {
    id: safe.policy_id || "",
    merchantId:
      safe.resource_scope && safe.resource_scope.merchant_id
        ? safe.resource_scope.merchant_id
        : "",
    name: safe.name || "",
    status: safe.status || "ACTIVE",
    priority: laneToPriority(safe.lane),
    trigger: {
      event: String(firstTrigger.event || "").toUpperCase()
    },
    conditions: segmentConditions,
    budget: {
      used: 0,
      cap: Number(budgetConstraint && budgetConstraint.params.cap) || 0,
      costPerHit: Number(budgetConstraint && budgetConstraint.params.cost_per_hit) || 0
    },
    action:
      safe.story && typeof safe.story === "object"
        ? {
            type: "STORY_CARD",
            story: safe.story
          }
        : null,
    strategyMeta: {
      category: safe.goal && safe.goal.type ? safe.goal.type : "ACTIVATION"
    }
  };
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

function toScopedDecisionOutcome(decision, policyKeyPrefix) {
  const executed = Array.isArray(decision && decision.executed)
    ? decision.executed.filter((item) => matchPolicyPrefix(item, policyKeyPrefix))
    : [];
  const rejected = Array.isArray(decision && decision.rejected)
    ? decision.rejected.filter((item) => matchPolicyPrefix(item && item.policyId, policyKeyPrefix))
    : [];
  if (executed.length > 0) {
    return "HIT";
  }
  if (rejected.length > 0) {
    return "BLOCKED";
  }
  return "NO_POLICY";
}

function toScopedDecisionReason(decision, policyKeyPrefix) {
  const rejected = Array.isArray(decision && decision.rejected)
    ? decision.rejected.filter((item) => matchPolicyPrefix(item && item.policyId, policyKeyPrefix))
    : [];
  const first = rejected[0] || {};
  return String(first.reason || "").trim();
}

function buildDecisionActivity({
  decision,
  policyKeyPrefix,
  tag,
  hitTitle,
  hitDesc,
  blockedTitle,
  blockedDescFallback
}) {
  if (!decision || typeof decision !== "object") {
    return null;
  }
  const outcome = toScopedDecisionOutcome(decision, policyKeyPrefix);
  const reason = toScopedDecisionReason(decision, policyKeyPrefix);
  if (outcome === "HIT") {
    return {
      id: `${String(tag || "decision").toLowerCase()}_decision_${String(decision.decision_id || "latest")}`,
      title: String(hitTitle || "策略已命中"),
      desc: String(hitDesc || "策略已执行，请查看资产变化。"),
      icon: "*",
      color: "bg-emerald-50",
      textColor: "text-emerald-600",
      tag: String(tag || "AI").toUpperCase(),
    };
  }
  if (outcome === "BLOCKED") {
    return {
      id: `${String(tag || "decision").toLowerCase()}_decision_${String(decision.decision_id || "latest")}`,
      title: String(blockedTitle || "策略未命中"),
      desc: reason ? `原因：${reason}` : String(blockedDescFallback || "本次未通过判定条件。"),
      icon: "!",
      color: "bg-amber-50",
      textColor: "text-amber-700",
      tag: String(tag || "AI").toUpperCase(),
    };
  }
  return null;
}

async function buildStateSnapshot({
  merchantId,
  userId,
  tenantRouter,
  tenantRepository,
  getServicesForDb,
}) {
  const scopedDb = tenantRouter.getDbForMerchant(merchantId);
  const { merchantService, allianceService, gameMarketingService } = getServicesForDb(scopedDb);
  const merchant = await tenantRepository.getMerchant(merchantId);
  const user = userId ? await tenantRepository.getMerchantUser(merchantId, userId) : null;
  const allianceConfig = await allianceService.getAllianceConfig({ merchantId });
  const dashboard = await merchantService.getDashboard({ merchantId });
  const { policyOsService } = getServicesForDb(scopedDb);
  const policyDrafts = policyOsService.listDrafts({ merchantId });
  const allPolicies = policyOsService.listPolicies({ merchantId, includeInactive: true });
  const activePolicies = policyOsService.listActivePolicies({ merchantId });
  const activePolicyViews = activePolicies.map((item) => toPolicyView(item));
  const gameAssets =
    user && gameMarketingService && typeof gameMarketingService.getCustomerGameAssets === "function"
      ? gameMarketingService.getCustomerGameAssets({ merchantId, userId: user.uid })
      : {
        merchantId,
        userId: user ? user.uid : null,
        collectibles: [],
        unlockedGames: [],
        summary: {
          collectibleCount: 0,
          unlockedGameCount: 0,
        },
      };
  const gameTouchpoints =
    user && gameMarketingService && typeof gameMarketingService.buildGameTouchpoints === "function"
      ? gameMarketingService.buildGameTouchpoints({ merchantId, userId: user.uid, limit: 8 })
      : [];
  const welcomeDecision =
    user && policyOsService && typeof policyOsService.listDecisions === "function"
      ? policyOsService.listDecisions({
        merchantId,
        userId: user.uid,
        event: "USER_ENTER_SHOP",
        mode: "EXECUTE",
        policyKeyPrefix: "ACQ_WELCOME_FIRST_BIND_V1",
        limit: 1,
      })[0] || null
      : null;
  const activationDecision =
    user && policyOsService && typeof policyOsService.listDecisions === "function"
      ? policyOsService.listDecisions({
        merchantId,
        userId: user.uid,
        event: "USER_ENTER_SHOP",
        mode: "EXECUTE",
        policyKeyPrefix: "ACT_CHECKIN_STREAK_RECOVERY_V1",
        limit: 1,
      })[0] || null
      : null;
  const revenueDecision =
    user && policyOsService && typeof policyOsService.listDecisions === "function"
      ? policyOsService.listDecisions({
        merchantId,
        userId: user.uid,
        event: "PAYMENT_VERIFY",
        mode: "EXECUTE",
        policyKeyPrefix: "REV_ADDON_UPSELL_SLOW_ITEM_V1",
        limit: 1,
      })[0] || null
      : null;
  const welcomeActivity = buildDecisionActivity({
    decision: welcomeDecision,
    policyKeyPrefix: "ACQ_WELCOME_FIRST_BIND_V1",
    tag: "WELCOME",
    hitTitle: "欢迎权益已发放",
    hitDesc: "已命中 Welcome 规则，可前往资产区查看到账变更。",
    blockedTitle: "欢迎权益未发放",
    blockedDescFallback: "本次未通过 Welcome 判定条件。",
  });
  const activationActivity = buildDecisionActivity({
    decision: activationDecision,
    policyKeyPrefix: "ACT_CHECKIN_STREAK_RECOVERY_V1",
    tag: "ACTIVATION",
    hitTitle: "连签激活奖励已到账",
    hitDesc: "已命中促活连签规则，可前往资产区查看到账变更。",
    blockedTitle: "连签激活奖励未发放",
    blockedDescFallback: "本次未通过促活连签判定条件。",
  });
  const revenueActivity = buildDecisionActivity({
    decision: revenueDecision,
    policyKeyPrefix: "REV_ADDON_UPSELL_SLOW_ITEM_V1",
    tag: "REVENUE",
    hitTitle: "加购激励已发放",
    hitDesc: "已命中提客单策略，可前往资产区查看到账券。",
    blockedTitle: "加购激励未发放",
    blockedDescFallback: "本次未通过提客单判定条件。",
  });
  const activities = buildCustomerActivities(activePolicyViews);
  if (welcomeActivity) {
    activities.unshift(welcomeActivity);
  }
  if (activationActivity) {
    activities.unshift(activationActivity);
  }
  if (revenueActivity) {
    activities.unshift(revenueActivity);
  }

  return {
    merchant,
    user,
    dashboard,
    policies: activePolicyViews,
    strategyConfigs: await tenantRepository.listStrategyConfigs(merchantId),
    activities,
    gameAssets,
    gameTouchpoints,
    allianceConfig,
    policyOs: {
      draftCount: policyDrafts.length,
      policyCount: allPolicies.length,
      activePolicyCount: activePolicies.length,
      drafts: policyDrafts,
      policies: allPolicies,
      plugins: policyOsService.listPlugins()
    }
  };
}

module.exports = {
  buildStateSnapshot,
};
