# S140 Retention Winback Closure

- Step: `S140`
- Strategy: `RET_DORMANT_WINBACK_14D_V1`
- Date: `2026-03-05`
- Verified by: `AI/Agent`

## Scope

1. Retention sample strategy template and completeness gate are enforceable in Policy OS.
2. Customer login now returns `retentionDecision` with hit/block outcome and reason.
3. Merchant dashboard exposes `retentionWinbackSummary` with `reactivationRate24h`.
4. Customer state activities expose Retention hit/block feedback with visible reason.
5. Merchant dashboard UI shows Retention hit/block/回流率 and latest blocking reason.
6. S140 dedicated step suite is executable through `npm run test:step:s140`.

## Fixed Decision Notes

1. Retention sample default profile is frozen as balanced voucher with `inactiveDays >= 14` and `isNewUser = false`.
2. Frequency cap is frozen at 14-day window with at most 1 hit per customer.
3. Merchant-side reactivation rate is frozen as `Hit / (Hit + Blocked)` over 24h decisions.
4. Visibility consistency is required between login response, merchant summary, and customer activity.

## Verification

1. `cd MealQuestServer && npm run test:step:s140`
- Result: pass

2. `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/policyOs.constraints.test.ts`
- Result: pass

3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
- Result: pass

4. `cd meal-quest-customer && npm run test:regression:ui`
- Result: pass
