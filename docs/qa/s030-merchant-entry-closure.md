# S030 Merchant Entry Closure

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S030 |
| Scope | Server + Merchant + Customer compatibility |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Source of Truth | `docs/specs/mealquest-spec.md`, `docs/roadmap.md` |

## 2. Delivered Scope

1. Server-side merchant phone login and onboarding contracts are covered by HTTP integration tests.
2. Merchant app login -> quick-onboard -> session restore chain is implemented in context/api/storage modules.
3. Customer app compatibility checks confirm merchant entry changes did not break customer key paths.

## 3. Evidence Mapping

| task_id | Required Output | Evidence |
| --- | --- | --- |
| S030-SRV-01 | 商户认证与开店接口合同基线 | `MealQuestServer/test/http.integration.test.ts` test cases: `merchant phone login returns bound status and enforces merchant scope`, `merchant onboarding completion creates store and returns owner session`, `merchant onboarding is preserved across re-logins with persistence` |
| S030-MER-01 | login -> quick-onboard -> agent 首页与会话恢复链路 | `MealQuestMerchant/src/context/MerchantContext.tsx`, `MealQuestMerchant/src/services/apiClient.ts`, `MealQuestMerchant/src/services/authSessionStorage.ts` |
| S030-CUS-01 | 顾客主路径兼容验证 | `meal-quest-customer/test/pages/startup.test.tsx`, `meal-quest-customer/test/pages/account.test.tsx`, `docs/qa/s040-customer-entry-closure.md` |

## 4. Verification Commands

1. `cd MealQuestServer && npm test` -> pass (`65 passed, 0 failed`)
2. `cd MealQuestMerchant && npm run lint && npm run typecheck` -> pass
3. `cd meal-quest-customer && npm run typecheck && npm test -- --runInBand` -> pass (`9 suites, 33 tests`)

## 5. Manual Smoke Record

1. Merchant mobile smoke confirmation received on 2026-03-04: "我手动测试正常，继续下一步"。
2. This smoke confirmation is used as the S030 merchant baseline until dedicated merchant automated flow tests are introduced.
