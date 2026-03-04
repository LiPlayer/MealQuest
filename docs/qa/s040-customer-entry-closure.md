# S040 Customer Entry Closure

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S040 |
| Scope | Customer lane (`S040-CUS-01`) |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Source of Truth | `docs/specs/mealquest-spec.md`, `docs/roadmap.md` |

## 2. Delivered Scope

1. Rewrote startup entry flow (`scan -> merchant validation -> session warmup -> index launch`).
2. Rewrote customer home page to use the new customer service layer and stable asset-first rendering.
3. Rewrote account center page (`wallet/ledger/invoice/cancel-account`) with two-step cancellation guard.
4. Removed legacy `wxs-scroll-view` dependency from index page config.
5. Added/updated regression tests for startup and account page behavior under the rewritten flows.

## 3. Evidence Mapping

| task_id | Required Output | Evidence |
| --- | --- | --- |
| S040-CUS-01 | startup 扫码入店闭环 | `meal-quest-customer/src/pages/startup/index.tsx`, `meal-quest-customer/test/pages/startup.test.tsx` |
| S040-CUS-01 | 会话建立 + 首页资产首屏 | `meal-quest-customer/src/pages/index/index.tsx`, `meal-quest-customer/src/services/customerApp/sessionService.ts`, `meal-quest-customer/src/services/customerApp/stateService.ts` |
| S040-CUS-01 | 账本/发票/注销链路 | `meal-quest-customer/src/pages/account/index.tsx`, `meal-quest-customer/test/pages/account.test.tsx` |

## 4. Verification Commands

1. `cd meal-quest-customer && npm run typecheck` -> pass
2. `cd meal-quest-customer && npm run lint` -> pass
3. `cd meal-quest-customer && npm test -- --runInBand` -> pass (9 suites, 33 tests)
4. `cd meal-quest-customer && npm run test:contract:baseline` -> pass (4 suites, 12 tests)
5. `cd meal-quest-customer && npm run test:e2e:core` -> skipped (`WECHAT_E2E_AUTO_LAUNCH` not enabled)
6. `npm run check:encoding` -> pass

## 5. Risks / Follow-ups

1. `S040-SRV-01` and `S040-MER-01` are still pending; S040 cannot be closed at step level yet.
2. Core e2e runtime is environment-gated; real device or CI auto-launch run is still required for final step closure.
