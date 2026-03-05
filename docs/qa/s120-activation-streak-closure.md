# S120 Activation Streak Closure

- Step: `S120`
- Strategy: `ACT_CHECKIN_STREAK_RECOVERY_V1`
- Date: `2026-03-05`
- Verified by: `AI/Agent`

## Scope

1. Activation sample strategy template landed in Policy OS catalog.
2. Login decision path now returns both `welcomeDecision` and `activationDecision`.
3. Merchant dashboard provides `activationRecoverySummary` (hit/block/reason/latest).
4. Customer state activities show Activation hit/block cards.
5. Policy completeness gate blocks incomplete action params before draft workflow.
6. S120 dedicated step suite added: `test:step:s120`.

## Fixed Decision Notes

1. Steady activation profile: `inactiveDays >= 7` and `checkinStreakDays >= 3`.
2. Trigger reuses `USER_ENTER_SHOP` unified execution entry.
3. Streak counting is based on natural-day deduplicated checkin decision logs.
4. Incomplete policy parameters must fail before submit/publish/execute.
5. Agent proposal requires owner confirmation before execution.

## Verification

1. `cd MealQuestServer && npm run test:step:s120`
- Result: pass (`27/27`, rerun outside sandbox because localhost listen is blocked in sandbox)

2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
- Result: pass

3. `cd meal-quest-customer && npm run test:regression:ui`
- Result: pass (`3 suites`, `12 tests`)

## Notes

- Customer regression still prints known React warning in test DOM for `scrollY`; non-blocking and unchanged baseline behavior.
