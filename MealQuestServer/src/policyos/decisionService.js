const { randomUUID } = require("node:crypto");

const LANE_RANK = {
  EMERGENCY: 4,
  GUARDED: 3,
  NORMAL: 2,
  BACKGROUND: 1
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createDecisionService({
  policyRegistry,
  pluginRegistry,
  executionAdapter,
  approvalTokenService,
  now = () => Date.now(),
  metrics = null
}) {
  if (!policyRegistry) {
    throw new Error("policyRegistry is required");
  }
  if (!pluginRegistry) {
    throw new Error("pluginRegistry is required");
  }
  if (!executionAdapter) {
    throw new Error("executionAdapter is required");
  }
  if (!approvalTokenService) {
    throw new Error("approvalTokenService is required");
  }

  function nowIso() {
    return new Date(now()).toISOString();
  }

  function appendMetric(name, value = 1) {
    if (!metrics || typeof metrics !== "object") {
      return;
    }
    if (!metrics.policyOs) {
      metrics.policyOs = {};
    }
    metrics.policyOs[name] = toNumber(metrics.policyOs[name], 0) + value;
  }

  function tieBreakCompare(left, right) {
    const strategy = left.policy.tie_breaker || "UTILITY_DESC";
    if (strategy === "EXPIRY_SOONER") {
      const l = Date.parse(String(left.policy.expires_at || ""));
      const r = Date.parse(String(right.policy.expires_at || ""));
      return toNumber(l, Number.MAX_SAFE_INTEGER) - toNumber(r, Number.MAX_SAFE_INTEGER);
    }
    if (strategy === "HIGHER_MARGIN") {
      const lm = toNumber(left.ctx.margin, 0);
      const rm = toNumber(right.ctx.margin, 0);
      return rm - lm;
    }
    if (strategy === "RANDOM_JITTER") {
      return String(left.policy.policy_id).localeCompare(String(right.policy.policy_id));
    }
    return toNumber(right.scoreResult.utility, 0) - toNumber(left.scoreResult.utility, 0);
  }

  function sortCandidates(candidates) {
    return [...candidates].sort((a, b) => {
      const laneRank = toNumber(LANE_RANK[b.policy.lane], 0) - toNumber(LANE_RANK[a.policy.lane], 0);
      if (laneRank !== 0) {
        return laneRank;
      }
      const utilityDelta = toNumber(b.scoreResult.utility, 0) - toNumber(a.scoreResult.utility, 0);
      if (utilityDelta !== 0) {
        return utilityDelta;
      }
      return tieBreakCompare(a, b);
    });
  }

  function allocateCandidates(sortedCandidates) {
    const winners = [];
    const skipped = [];
    const conflictState = new Map();

    for (const candidate of sortedCandidates) {
      const overlap = candidate.policy.overlap_policy || {};
      const mode = String(overlap.mode || "HARD_EXCLUSIVE").toUpperCase();
      const conflictSet = String(overlap.conflict_set || "default");
      const conflictKey = `${conflictSet}|${candidate.ctx.user ? candidate.ctx.user.uid : "anonymous"}`;
      const state = conflictState.get(conflictKey) || {
        count: 0,
        emergencyWon: false
      };

      if (mode === "STACKABLE") {
        winners.push(candidate);
        state.count += 1;
        if (candidate.policy.lane === "EMERGENCY") {
          state.emergencyWon = true;
        }
        conflictState.set(conflictKey, state);
        continue;
      }

      if (mode === "SOFT_EXCLUSIVE") {
        const maxWinners = Math.max(1, Math.floor(toNumber(overlap.max_winners, 1)));
        if (state.count >= maxWinners) {
          skipped.push({
            ...candidate,
            rejectReason: "allocation:soft_exclusive_limit"
          });
          continue;
        }
        winners.push(candidate);
        state.count += 1;
        if (candidate.policy.lane === "EMERGENCY") {
          state.emergencyWon = true;
        }
        conflictState.set(conflictKey, state);
        continue;
      }

      if (mode === "PREEMPTIVE") {
        if (state.emergencyWon && candidate.policy.lane !== "EMERGENCY") {
          skipped.push({
            ...candidate,
            rejectReason: "allocation:preempted_by_emergency"
          });
          continue;
        }
        if (state.count > 0 && candidate.policy.lane !== "EMERGENCY") {
          skipped.push({
            ...candidate,
            rejectReason: "allocation:preemptive_conflict"
          });
          continue;
        }
        winners.push(candidate);
        state.count += 1;
        if (candidate.policy.lane === "EMERGENCY") {
          state.emergencyWon = true;
        }
        conflictState.set(conflictKey, state);
        continue;
      }

      if (state.count > 0) {
        skipped.push({
          ...candidate,
          rejectReason: "allocation:hard_exclusive_conflict"
        });
        continue;
      }
      winners.push(candidate);
      state.count += 1;
      if (candidate.policy.lane === "EMERGENCY") {
        state.emergencyWon = true;
      }
      conflictState.set(conflictKey, state);
    }

    return {
      winners,
      skipped
    };
  }

  async function evaluateEvent({
    merchantId,
    event,
    eventId = "",
    context = {},
    user = null,
    approvalToken = "",
    traceId = randomUUID()
  }) {
    const startedAt = now();
    approvalTokenService.verifyToken(approvalToken, {
      expectedMerchantId: merchantId,
      expectedScope: "execute"
    });
    const activePolicies = policyRegistry.listActivePolicies({ merchantId });
    const ctxBase = {
      merchantId,
      event,
      eventId: eventId || `evt_${Date.now()}`,
      traceId,
      ...context,
      user
    };
    const candidates = [];
    const rejections = [];

    for (const policy of activePolicies) {
      for (const trigger of policy.triggers || []) {
        const triggerPlugin = pluginRegistry.get("trigger", trigger.plugin);
        if (!triggerPlugin || typeof triggerPlugin.match !== "function") {
          rejections.push({
            policyId: policy.policy_id,
            reason: `trigger plugin missing: ${trigger.plugin}`
          });
          continue;
        }
        const triggerMatched = triggerPlugin.match({
          trigger,
          ctx: {
            ...ctxBase,
            policy
          }
        });
        if (!triggerMatched) {
          continue;
        }
        const instances = typeof triggerPlugin.expandCandidates === "function"
          ? triggerPlugin.expandCandidates({
              trigger,
              ctx: {
                ...ctxBase,
                policy
              }
            })
          : [{}];
        const segmentPlugin = pluginRegistry.get("segment", policy.segment.plugin);
        if (!segmentPlugin || typeof segmentPlugin.eval !== "function") {
          rejections.push({
            policyId: policy.policy_id,
            reason: `segment plugin missing: ${policy.segment.plugin}`
          });
          continue;
        }
        const segmentResult = segmentPlugin.eval({
          user,
          segment: policy.segment,
          ctx: ctxBase
        });
        if (!segmentResult.matched) {
          rejections.push({
            policyId: policy.policy_id,
            reason: "segment_mismatch"
          });
          continue;
        }

        const actionEstimates = (policy.actions || []).map((action) => {
          const actionPlugin = pluginRegistry.get("action", action.plugin);
          if (!actionPlugin || typeof actionPlugin.estimateCost !== "function") {
            return {
              cost: 0,
              budgetCost: 0,
              missing: action.plugin
            };
          }
          return actionPlugin.estimateCost({ action, policy, ctx: ctxBase }) || { cost: 0, budgetCost: 0 };
        });
        const estimate = {
          cost: actionEstimates.reduce((sum, item) => sum + toNumber(item.cost, 0), 0),
          budgetCost: actionEstimates.reduce((sum, item) => sum + toNumber(item.budgetCost, 0), 0),
          missingPlugins: actionEstimates.filter((item) => item.missing).map((item) => item.missing)
        };
        if (estimate.missingPlugins.length > 0) {
          rejections.push({
            policyId: policy.policy_id,
            reason: `action plugin missing: ${estimate.missingPlugins.join(",")}`
          });
          continue;
        }

        const constraintReasonCodes = [];
        const constraintRiskFlags = [];
        let hardPass = true;
        for (const constraint of policy.constraints || []) {
          const plugin = pluginRegistry.get("constraint", constraint.plugin);
          if (!plugin || typeof plugin.check !== "function") {
            hardPass = false;
            rejections.push({
              policyId: policy.policy_id,
              reason: `constraint plugin missing: ${constraint.plugin}`
            });
            break;
          }
          const checkResult = plugin.check({
            policy,
            constraint,
            ctx: {
              ...ctxBase,
              policy,
              user
            },
            estimate
          });
          if (Array.isArray(checkResult.reasonCodes)) {
            constraintReasonCodes.push(...checkResult.reasonCodes);
          }
          if (Array.isArray(checkResult.riskFlags)) {
            constraintRiskFlags.push(...checkResult.riskFlags);
          }
          if (!checkResult.ok) {
            hardPass = false;
            rejections.push({
              policyId: policy.policy_id,
              reason: checkResult.reasonCodes && checkResult.reasonCodes[0]
                ? checkResult.reasonCodes[0]
                : "constraint_failed"
            });
            break;
          }
        }
        if (!hardPass) {
          continue;
        }

        const scorer = pluginRegistry.get("scorer", policy.scoring.plugin);
        if (!scorer || typeof scorer.score !== "function") {
          rejections.push({
            policyId: policy.policy_id,
            reason: `scorer plugin missing: ${policy.scoring.plugin}`
          });
          continue;
        }
        const scoreResult = scorer.score({
          policy,
          ctx: {
            ...ctxBase,
            policy,
            user
          }
        });
        for (const instance of instances.length > 0 ? instances : [{}]) {
          candidates.push({
            policy,
            trigger,
            instance,
            ctx: ctxBase,
            estimate,
            scoreResult,
            constraintResult: {
              reasonCodes: constraintReasonCodes,
              riskFlags: constraintRiskFlags
            }
          });
        }
      }
    }

    const sorted = sortCandidates(candidates);
    const allocation = allocateCandidates(sorted);
    const executed = [];
    const storyCards = [];
    const grants = [];
    const explains = [];

    for (const candidate of allocation.winners) {
      const reserved = [];
      let reserveFailed = false;
      for (const constraint of candidate.policy.constraints || []) {
        const plugin = pluginRegistry.get("constraint", constraint.plugin);
        if (!plugin || typeof plugin.reserve !== "function") {
          continue;
        }
        const reserveResult = plugin.reserve({
          policy: candidate.policy,
          constraint,
          ctx: {
            ...ctxBase,
            policyId: candidate.policy.policy_id,
            user
          },
          estimate: candidate.estimate
        });
        if (!reserveResult.ok) {
          reserveFailed = true;
          rejections.push({
            policyId: candidate.policy.policy_id,
            reason: "reserve_failed"
          });
          break;
        }
        if (reserveResult.reserved) {
          reserved.push({
            plugin: constraint.plugin,
            payload: reserveResult.reserved
          });
        }
      }
      if (reserveFailed) {
        for (const item of reserved.reverse()) {
          const plugin = pluginRegistry.get("constraint", item.plugin);
          if (plugin && typeof plugin.release === "function") {
            plugin.release({
              reserved: item.payload,
              policy: candidate.policy
            });
          }
        }
        continue;
      }

      const plan = executionAdapter.compile({
        policy: candidate.policy,
        traceId
      });
      const explain = executionAdapter.explain({
        policy: candidate.policy,
        scoreResult: candidate.scoreResult,
        constraintResult: candidate.constraintResult
      });
      const runtimeResult = await executionAdapter.execute({
        ctx: {
          ...ctxBase,
          policyId: candidate.policy.policy_id,
          user
        },
        policy: candidate.policy,
        plan,
        traceId
      });

      if (!runtimeResult.success) {
        for (const item of reserved.reverse()) {
          const plugin = pluginRegistry.get("constraint", item.plugin);
          if (plugin && typeof plugin.release === "function") {
            plugin.release({
              reserved: item.payload,
              policy: candidate.policy
            });
          }
        }
        rejections.push({
          policyId: candidate.policy.policy_id,
          reason: "execution_failed"
        });
        continue;
      }

      for (const response of runtimeResult.responses || []) {
        if (Array.isArray(response.storyCards)) {
          storyCards.push(...response.storyCards);
        }
        if (Array.isArray(response.grants)) {
          grants.push(...response.grants);
        }
      }

      executed.push(candidate.policy.policy_id);
      explains.push({
        policy_id: candidate.policy.policy_id,
        ...explain
      });
    }

    const decision = {
      decision_id: `decision_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      merchant_id: merchantId,
      user_id: user && user.uid ? user.uid : null,
      event,
      event_id: ctxBase.eventId,
      trace_id: traceId,
      created_at: nowIso(),
      elapsed_ms: Math.max(0, now() - startedAt),
      executed,
      rejected: [
        ...allocation.skipped.map((item) => ({
          policyId: item.policy.policy_id,
          reason: item.rejectReason
        })),
        ...rejections
      ],
      explains,
      storyCards,
      grants
    };
    policyRegistry.saveDecision(decision);
    appendMetric("decisions_total", 1);
    appendMetric("decisions_executed_total", executed.length);
    appendMetric("decisions_rejected_total", decision.rejected.length);
    appendMetric("decision_latency_ms_total", decision.elapsed_ms);
    // structured log
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        tag: "policyos.decision",
        trace_id: traceId,
        merchant_id: merchantId,
        decision_id: decision.decision_id,
        event,
        executed: executed.length,
        rejected: decision.rejected.length,
        elapsed_ms: decision.elapsed_ms
      })
    );
    return decision;
  }

  function getDecisionExplain(decisionId) {
    const decision = policyRegistry.getDecision(decisionId);
    if (!decision) {
      return null;
    }
    return {
      decision_id: decision.decision_id,
      trace_id: decision.trace_id,
      merchant_id: decision.merchant_id,
      event: decision.event,
      executed: decision.executed,
      rejected: decision.rejected,
      explains: decision.explains,
      expected_range: decision.explains.map((item) => ({
        policy_id: item.policy_id,
        expected_range: item.expected_range || null
      }))
    };
  }

  return {
    evaluateEvent,
    getDecisionExplain
  };
}

module.exports = {
  createDecisionService
};
