const { ensurePolicyOsState } = require("../state");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function registerDefaultPlugins({ pluginRegistry, db, ledgerService, now = () => Date.now() }) {
  if (!pluginRegistry) {
    throw new Error("pluginRegistry is required");
  }

  pluginRegistry.register("trigger", "event_trigger_v1", {
    match({ trigger, ctx }) {
      const expected = String(trigger.event || trigger.params.event || "").trim().toUpperCase();
      const actual = String((ctx && ctx.event) || "").trim().toUpperCase();
      return Boolean(expected && actual && expected === actual);
    },
    expandCandidates({ trigger, ctx }) {
      const requested = Math.max(1, Math.floor(toNumber(trigger.params.instances, 1)));
      const maxInstances = Math.max(1, Math.floor(toNumber(ctx.policy.program.max_instances, 1)));
      const size = Math.min(requested, maxInstances);
      return Array.from({ length: size }).map((_, idx) => ({
        instance: idx + 1
      }));
    }
  });

  pluginRegistry.register("segment", "all_users_v1", {
    eval() {
      return {
        matched: true,
        reasonCodes: ["segment:all_users"]
      };
    }
  });

  pluginRegistry.register("segment", "tag_segment_v1", {
    eval({ user, segment }) {
      const requiredTags = Array.isArray(segment.params.tags) ? segment.params.tags : [];
      const userTags = Array.isArray(user && user.tags) ? user.tags : [];
      const matched = requiredTags.every((tag) => userTags.includes(tag));
      return {
        matched,
        reasonCodes: matched ? ["segment:tag_match"] : ["segment:tag_mismatch"]
      };
    }
  });

  pluginRegistry.register("constraint", "kill_switch_v1", {
    check({ ctx }) {
      const merchant = ctx.merchant || {};
      if (merchant.killSwitchEnabled) {
        return {
          ok: false,
          reasonCodes: ["constraint:kill_switch"],
          riskFlags: ["KILL_SWITCH_ENABLED"]
        };
      }
      return {
        ok: true,
        reasonCodes: ["constraint:kill_switch_pass"]
      };
    },
    reserve() {
      return { ok: true };
    },
    release() {
      return { ok: true };
    }
  });

  pluginRegistry.register("constraint", "budget_guard_v1", {
    check({ policy, constraint, estimate }) {
      const state = ensurePolicyOsState(db);
      const key = `${policy.resource_scope.merchant_id}|${policy.policy_id}`;
      const budgetState = state.resourceStates.budget[key] || {
        used: 0,
        cap: toNumber(constraint.params.cap, Number.MAX_SAFE_INTEGER),
        minuteWindowStartMs: 0,
        minuteSpent: 0
      };
      const cap = toNumber(constraint.params.cap, budgetState.cap);
      const cost = toNumber(estimate.cost, toNumber(constraint.params.cost_per_hit, 0));
      const maxPerMinute = toNumber(
        policy.program && policy.program.pacing && policy.program.pacing.max_cost_per_minute,
        Number.MAX_SAFE_INTEGER
      );
      const nowMs = now();
      const sameWindow = nowMs - toNumber(budgetState.minuteWindowStartMs, 0) < 60 * 1000;
      const minuteSpent = sameWindow ? toNumber(budgetState.minuteSpent, 0) : 0;
      if (toNumber(budgetState.used, 0) + cost > cap) {
        return {
          ok: false,
          reasonCodes: ["constraint:budget_cap_exceeded"],
          riskFlags: ["BUDGET_CAP_EXCEEDED"]
        };
      }
      if (minuteSpent + cost > maxPerMinute) {
        return {
          ok: false,
          reasonCodes: ["constraint:budget_pacing_exceeded"],
          riskFlags: ["BUDGET_PACING_EXCEEDED"]
        };
      }
      return {
        ok: true,
        reasonCodes: ["constraint:budget_pass"]
      };
    },
    reserve({ policy, constraint, estimate }) {
      const state = ensurePolicyOsState(db);
      const key = `${policy.resource_scope.merchant_id}|${policy.policy_id}`;
      const current = state.resourceStates.budget[key] || {
        used: 0,
        cap: toNumber(constraint.params.cap, Number.MAX_SAFE_INTEGER),
        minuteWindowStartMs: 0,
        minuteSpent: 0
      };
      const nowMs = now();
      const cost = toNumber(estimate.cost, toNumber(constraint.params.cost_per_hit, 0));
      const sameWindow = nowMs - toNumber(current.minuteWindowStartMs, 0) < 60 * 1000;
      const next = {
        used: toNumber(current.used, 0) + cost,
        cap: toNumber(constraint.params.cap, current.cap),
        minuteWindowStartMs: sameWindow ? current.minuteWindowStartMs : nowMs,
        minuteSpent: (sameWindow ? toNumber(current.minuteSpent, 0) : 0) + cost
      };
      state.resourceStates.budget[key] = next;
      return {
        ok: true,
        reserved: {
          type: "budget",
          key,
          amount: cost
        }
      };
    },
    release({ reserved }) {
      const state = ensurePolicyOsState(db);
      if (!reserved || reserved.type !== "budget") {
        return { ok: true };
      }
      const current = state.resourceStates.budget[reserved.key];
      if (!current) {
        return { ok: true };
      }
      current.used = Math.max(0, toNumber(current.used, 0) - toNumber(reserved.amount, 0));
      current.minuteSpent = Math.max(0, toNumber(current.minuteSpent, 0) - toNumber(reserved.amount, 0));
      state.resourceStates.budget[reserved.key] = current;
      return { ok: true };
    }
  });

  pluginRegistry.register("constraint", "inventory_lock_v1", {
    check({ policy, constraint }) {
      const state = ensurePolicyOsState(db);
      const sku = String(constraint.params.sku || "").trim();
      if (!sku) {
        return { ok: true, reasonCodes: ["constraint:inventory_skip"] };
      }
      const key = `${policy.resource_scope.merchant_id}|${sku}`;
      const inventory = state.resourceStates.inventory[key] || {
        reserved: 0,
        hardCap: toNumber(constraint.params.max_units, Number.MAX_SAFE_INTEGER)
      };
      const need = Math.max(1, Math.floor(toNumber(constraint.params.reserve_units, 1)));
      if (toNumber(inventory.reserved, 0) + need > toNumber(inventory.hardCap, Number.MAX_SAFE_INTEGER)) {
        return {
          ok: false,
          reasonCodes: ["constraint:inventory_exceeded"],
          riskFlags: ["INVENTORY_HARD_LOCK"]
        };
      }
      return { ok: true, reasonCodes: ["constraint:inventory_pass"] };
    },
    reserve({ policy, constraint }) {
      const state = ensurePolicyOsState(db);
      const sku = String(constraint.params.sku || "").trim();
      if (!sku) {
        return { ok: true };
      }
      const key = `${policy.resource_scope.merchant_id}|${sku}`;
      const current = state.resourceStates.inventory[key] || {
        reserved: 0,
        hardCap: toNumber(constraint.params.max_units, Number.MAX_SAFE_INTEGER)
      };
      const need = Math.max(1, Math.floor(toNumber(constraint.params.reserve_units, 1)));
      current.reserved = toNumber(current.reserved, 0) + need;
      current.hardCap = toNumber(constraint.params.max_units, current.hardCap);
      state.resourceStates.inventory[key] = current;
      return {
        ok: true,
        reserved: {
          type: "inventory",
          key,
          amount: need
        }
      };
    },
    release({ reserved }) {
      const state = ensurePolicyOsState(db);
      if (!reserved || reserved.type !== "inventory") {
        return { ok: true };
      }
      const current = state.resourceStates.inventory[reserved.key];
      if (!current) {
        return { ok: true };
      }
      current.reserved = Math.max(0, toNumber(current.reserved, 0) - toNumber(reserved.amount, 0));
      state.resourceStates.inventory[reserved.key] = current;
      return { ok: true };
    }
  });

  pluginRegistry.register("constraint", "frequency_cap_v1", {
    check({ policy, ctx, constraint }) {
      const state = ensurePolicyOsState(db);
      const userId = String(ctx.user && ctx.user.uid ? ctx.user.uid : "").trim();
      if (!userId) {
        return {
          ok: false,
          reasonCodes: ["constraint:frequency_missing_user"],
          riskFlags: ["FREQUENCY_SCOPE_INVALID"]
        };
      }
      const daily = Math.max(1, Math.floor(toNumber(constraint.params.daily, 1)));
      const windowSec = Math.max(60, Math.floor(toNumber(constraint.params.window_sec, 86400)));
      const key = `${policy.resource_scope.merchant_id}|${policy.policy_id}|${userId}`;
      const nowMs = now();
      const recent = (state.resourceStates.frequency[key] || []).filter(
        (ts) => nowMs - toNumber(ts, 0) < windowSec * 1000
      );
      state.resourceStates.frequency[key] = recent;
      if (recent.length >= daily) {
        return {
          ok: false,
          reasonCodes: ["constraint:frequency_exceeded"],
          riskFlags: ["FREQUENCY_CAP"]
        };
      }
      return { ok: true, reasonCodes: ["constraint:frequency_pass"] };
    },
    reserve({ policy, ctx }) {
      const state = ensurePolicyOsState(db);
      const userId = String(ctx.user && ctx.user.uid ? ctx.user.uid : "").trim();
      if (!userId) {
        return { ok: true };
      }
      const key = `${policy.resource_scope.merchant_id}|${policy.policy_id}|${userId}`;
      const recent = Array.isArray(state.resourceStates.frequency[key])
        ? state.resourceStates.frequency[key]
        : [];
      const marker = now();
      state.resourceStates.frequency[key] = [...recent, marker];
      return {
        ok: true,
        reserved: {
          type: "frequency",
          key,
          marker
        }
      };
    },
    release({ reserved }) {
      const state = ensurePolicyOsState(db);
      if (!reserved || reserved.type !== "frequency") {
        return { ok: true };
      }
      const items = Array.isArray(state.resourceStates.frequency[reserved.key])
        ? state.resourceStates.frequency[reserved.key]
        : [];
      state.resourceStates.frequency[reserved.key] = items.filter((item) => item !== reserved.marker);
      return { ok: true };
    }
  });

  pluginRegistry.register("constraint", "anti_fraud_hook_v1", {
    check({ ctx, constraint }) {
      const maxRiskScore = toNumber(constraint.params.max_risk_score, 0.8);
      const currentRisk = toNumber(ctx.riskScore, 0);
      if (currentRisk > maxRiskScore) {
        return {
          ok: false,
          reasonCodes: ["constraint:anti_fraud_blocked"],
          riskFlags: ["ANTI_FRAUD_BLOCK"]
        };
      }
      return {
        ok: true,
        reasonCodes: ["constraint:anti_fraud_pass"]
      };
    },
    reserve() {
      return { ok: true };
    },
    release() {
      return { ok: true };
    }
  });

  pluginRegistry.register("scorer", "expected_profit_v1", {
    score({ policy, ctx }) {
      const estimate = (ctx.modelEstimate && typeof ctx.modelEstimate === "object")
        ? ctx.modelEstimate
        : {};
      const p = toNumber(estimate.p, 0.5);
      const v = toNumber(estimate.v, 1);
      const c = toNumber(estimate.c, 0);
      const riskPenalty = toNumber(estimate.riskPenalty, 0);
      const fatiguePenalty = toNumber(estimate.fatiguePenalty, 0);
      const utility = p * v - c - riskPenalty - fatiguePenalty;
      const spread = Math.max(0.05, Math.abs(utility) * 0.25);
      return {
        utility,
        uncertainty: Math.min(1, Math.max(0, toNumber(estimate.uncertainty, 0.15))),
        estimateCost: c,
        expectedRange: {
          min: utility - spread,
          max: utility + spread
        },
        reasonCodes: [`score:${policy.scoring.plugin}`]
      };
    }
  });

  pluginRegistry.register("action", "wallet_grant_v1", {
    estimateCost({ action }) {
      return {
        cost: toNumber(action.params.cost, action.params.amount),
        budgetCost: toNumber(action.params.cost, action.params.amount)
      };
    },
    execute({ ctx, action, traceId }) {
      const user = ctx.user;
      const account = String(action.params.account || "bonus");
      const amount = toNumber(action.params.amount, 0);
      if (!user || amount <= 0) {
        return {
          success: false,
          reasonCodes: ["action:wallet_grant_invalid"]
        };
      }
      const ledger = ledgerService.grant({
        merchantId: ctx.merchantId,
        user,
        account,
        amount,
        idempotencyKey: `${ctx.merchantId}|${ctx.eventId}|${ctx.policyId}|${action.plugin}|${account}|${amount}`,
        metadata: {
          traceId,
          policyId: ctx.policyId,
          source: "policyos"
        }
      });
      return {
        success: true,
        ledgerTxnId: ledger.txnId,
        grants: [
          {
            account,
            amount
          }
        ],
        reasonCodes: ["action:wallet_grant_applied"]
      };
    }
  });

  pluginRegistry.register("action", "story_inject_v1", {
    estimateCost({ action }) {
      return {
        cost: toNumber(action.params.cost, 0),
        budgetCost: toNumber(action.params.cost, 0)
      };
    },
    execute({ policy }) {
      return {
        success: true,
        storyCards: policy.story ? [{ ...policy.story, generatedAt: nowIso() }] : [],
        reasonCodes: ["action:story_injected"]
      };
    }
  });

  pluginRegistry.register("action", "noop_v1", {
    estimateCost() {
      return {
        cost: 0,
        budgetCost: 0
      };
    },
    execute() {
      return {
        success: true,
        reasonCodes: ["action:noop"]
      };
    }
  });
}

module.exports = {
  registerDefaultPlugins
};
