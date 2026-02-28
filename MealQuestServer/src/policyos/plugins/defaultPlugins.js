const { ensurePolicyOsState } = require("../state");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getByPath(target, field) {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const segments = String(field || "")
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }
  let cursor = target;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function resolveConditionField({ ctx, user, field }) {
  const normalized = asString(field);
  if (!normalized) {
    return undefined;
  }
  const directContext = getByPath(ctx, normalized);
  if (directContext !== undefined) {
    return directContext;
  }
  const directUser = getByPath(user, normalized);
  if (directUser !== undefined) {
    return directUser;
  }
  const userScoped = getByPath(user, `wallet.${normalized}`);
  if (userScoped !== undefined) {
    return userScoped;
  }
  return undefined;
}

function evaluateCondition({ actual, op, expected }) {
  const normalizedOp = asString(op).toLowerCase() || "eq";
  if (normalizedOp === "neq") {
    return actual !== expected;
  }
  if (normalizedOp === "gte") {
    return toNumber(actual, Number.NEGATIVE_INFINITY) >= toNumber(expected, Number.POSITIVE_INFINITY);
  }
  if (normalizedOp === "gt") {
    return toNumber(actual, Number.NEGATIVE_INFINITY) > toNumber(expected, Number.POSITIVE_INFINITY);
  }
  if (normalizedOp === "lte") {
    return toNumber(actual, Number.POSITIVE_INFINITY) <= toNumber(expected, Number.NEGATIVE_INFINITY);
  }
  if (normalizedOp === "lt") {
    return toNumber(actual, Number.POSITIVE_INFINITY) < toNumber(expected, Number.NEGATIVE_INFINITY);
  }
  if (normalizedOp === "includes") {
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return String(actual || "").includes(String(expected || ""));
  }
  if (normalizedOp === "in") {
    return Array.isArray(expected) ? expected.includes(actual) : false;
  }
  if (normalizedOp === "nin") {
    return Array.isArray(expected) ? !expected.includes(actual) : true;
  }
  return actual === expected;
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

  pluginRegistry.register("segment", "legacy_condition_segment_v1", {
    eval({ user, segment, ctx }) {
      const params = segment && segment.params && typeof segment.params === "object" ? segment.params : {};
      const conditions = Array.isArray(params.conditions)
        ? params.conditions.filter((item) => item && typeof item === "object")
        : [];
      if (conditions.length === 0) {
        return {
          matched: true,
          reasonCodes: ["segment:legacy_conditions_empty"]
        };
      }
      const logic = String(params.logic || "AND").trim().toUpperCase();
      const items = conditions.map((condition) => {
        const actual = resolveConditionField({
          ctx,
          user,
          field: condition.field
        });
        return evaluateCondition({
          actual,
          op: condition.op,
          expected: condition.value
        });
      });
      const matched = logic === "OR" ? items.some(Boolean) : items.every(Boolean);
      return {
        matched,
        reasonCodes: matched ? ["segment:legacy_conditions_match"] : ["segment:legacy_conditions_mismatch"]
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

  pluginRegistry.register("action", "voucher_grant_v1", {
    estimateCost({ action }) {
      const voucher = action && action.params && action.params.voucher && typeof action.params.voucher === "object"
        ? action.params.voucher
        : {};
      const fallbackCost = toNumber(voucher.value, 0);
      const resolvedCost = Math.max(0, toNumber(action.params && action.params.cost, fallbackCost));
      return {
        cost: resolvedCost,
        budgetCost: resolvedCost
      };
    },
    execute({ ctx, action, traceId }) {
      const user = ctx.user;
      if (!user) {
        return {
          success: false,
          reasonCodes: ["action:voucher_grant_missing_user"]
        };
      }
      const params = action && action.params && typeof action.params === "object" ? action.params : {};
      const voucher = params.voucher && typeof params.voucher === "object" ? params.voucher : {};
      const expiresInSec = Math.max(60, Math.floor(toNumber(params.expires_in_sec, 7 * 24 * 60 * 60)));
      const nowMs = now();
      const voucherId =
        asString(voucher.id) ||
        `voucher_${String(ctx.policyId || "policy").replace(/[^a-zA-Z0-9_]/g, "_")}_${String(
          ctx.eventId || "event"
        ).replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const amount = Math.max(0, toNumber(params.cost, voucher.value));
      if (!Array.isArray(user.vouchers)) {
        user.vouchers = [];
      }
      const existed = user.vouchers.find((item) => item && item.id === voucherId);
      if (!existed) {
        user.vouchers.push({
          id: voucherId,
          type: asString(voucher.type) || "NO_THRESHOLD_VOUCHER",
          name: asString(voucher.name) || "Policy Voucher",
          value: Math.max(0, toNumber(voucher.value, 0)),
          minSpend: Math.max(0, toNumber(voucher.minSpend, 0)),
          discountRate: toNumber(voucher.discountRate, 0),
          status: "ACTIVE",
          expiresAt: new Date(nowMs + expiresInSec * 1000).toISOString()
        });
      }
      const ledger = ledgerService.record({
        merchantId: ctx.merchantId,
        userId: user.uid,
        type: "POLICYOS_ASSET_GRANT",
        idempotencyKey: `${ctx.merchantId}|${ctx.eventId}|${ctx.policyId}|${action.plugin}|${voucherId}`,
        entries: [
          {
            account: "marketing_expense",
            direction: "DEBIT",
            amount
          },
          {
            account: "user_asset:voucher",
            direction: "CREDIT",
            amount
          }
        ],
        metadata: {
          traceId,
          policyId: ctx.policyId,
          voucherId,
          source: "policyos"
        }
      });
      return {
        success: true,
        ledgerTxnId: ledger.txnId,
        vouchers: [
          {
            id: voucherId
          }
        ],
        reasonCodes: ["action:voucher_grant_applied"]
      };
    }
  });

  pluginRegistry.register("action", "fragment_grant_v1", {
    estimateCost({ action }) {
      const amount = Math.max(0, toNumber(action && action.params && action.params.amount, 0));
      const resolvedCost = Math.max(0, toNumber(action && action.params && action.params.cost, amount));
      return {
        cost: resolvedCost,
        budgetCost: resolvedCost
      };
    },
    execute({ ctx, action, traceId }) {
      const user = ctx.user;
      if (!user) {
        return {
          success: false,
          reasonCodes: ["action:fragment_grant_missing_user"]
        };
      }
      const params = action && action.params && typeof action.params === "object" ? action.params : {};
      const fragmentType = asString(params.type) || "general";
      const amount = Math.max(0, Math.floor(toNumber(params.amount, 0)));
      if (amount <= 0) {
        return {
          success: false,
          reasonCodes: ["action:fragment_grant_invalid_amount"]
        };
      }
      const cost = Math.max(0, toNumber(params.cost, amount));
      if (!user.fragments || typeof user.fragments !== "object") {
        user.fragments = {};
      }
      user.fragments[fragmentType] = Math.max(
        0,
        Math.floor(toNumber(user.fragments[fragmentType], 0)) + amount
      );
      const ledger = ledgerService.record({
        merchantId: ctx.merchantId,
        userId: user.uid,
        type: "POLICYOS_ASSET_GRANT",
        idempotencyKey: `${ctx.merchantId}|${ctx.eventId}|${ctx.policyId}|${action.plugin}|${fragmentType}|${amount}`,
        entries: [
          {
            account: "marketing_expense",
            direction: "DEBIT",
            amount: cost
          },
          {
            account: `user_asset:fragment:${fragmentType}`,
            direction: "CREDIT",
            amount: cost
          }
        ],
        metadata: {
          traceId,
          policyId: ctx.policyId,
          fragmentType,
          amount,
          source: "policyos"
        }
      });
      return {
        success: true,
        ledgerTxnId: ledger.txnId,
        fragments: [
          {
            type: fragmentType,
            amount
          }
        ],
        reasonCodes: ["action:fragment_grant_applied"]
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
