# S040 Entry Closure

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S040 |
| Scope | Server + Merchant + Customer |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Source of Truth | `docs/specs/mealquest-spec.md`, `docs/roadmap.md` |

## 2. Delivered Scope

1. Server: extended merchant dashboard contract with read-only customer-entry visibility (`customerEntry`).
2. Merchant: added read-only customer-entry card and dashboard pull in authenticated session.
3. Customer: rewrote startup entry flow (`scan -> merchant validation -> session warmup -> index launch`).
4. Customer: rewrote home/account pages and removed legacy `wxs-scroll-view` dependency.
5. Added/updated regression tests covering login/entry/state visibility contracts.

## 3. Evidence Mapping

| task_id | Required Output | Evidence |
| --- | --- | --- |
| S040-SRV-01 | 顾客登录与入店合同基线（扫码入店/会话建立/资产状态） | `MealQuestServer/test/http.integration.test.ts` (`customer wechat login binds phone as primary identity`, `merchant exists endpoint returns precise availability`, `merchant dashboard exposes read-only customer entry visibility after customer login`) |
| S040-MER-01 | 顾客入店状态变化只读可见性 | `MealQuestMerchant/src/context/MerchantContext.tsx`, `MealQuestMerchant/src/screens/AgentScreen.tsx`, `MealQuestMerchant/src/services/apiClient.ts` |
| S040-CUS-01 | startup 扫码入店闭环 | `meal-quest-customer/src/pages/startup/index.tsx`, `meal-quest-customer/test/pages/startup.test.tsx` |
| S040-CUS-01 | 会话建立 + 首页资产首屏 | `meal-quest-customer/src/pages/index/index.tsx`, `meal-quest-customer/src/services/customerApp/sessionService.ts`, `meal-quest-customer/src/services/customerApp/stateService.ts` |
| S040-CUS-01 | 账本/发票/注销链路 | `meal-quest-customer/src/pages/account/index.tsx`, `meal-quest-customer/test/pages/account.test.tsx` |

## 4. Verification Commands

1. `cd MealQuestServer && npm test` -> pass (66 tests)
2. `cd MealQuestMerchant && npm run lint && npm run typecheck` -> pass
3. `cd meal-quest-customer && npm run typecheck` -> pass
4. `cd meal-quest-customer && npm test -- --runInBand` -> pass (9 suites, 33 tests)
5. `cd meal-quest-customer && Remove-Item Env:WECHAT_WS_ENDPOINT -ErrorAction SilentlyContinue; Remove-Item Env:WECHAT_SERVICE_PORT -ErrorAction SilentlyContinue; $env:WECHAT_CLI_PATH='D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'; npm run test:e2e:core` -> pass (2 tests)
6. `npm run check:encoding` -> pass

## 5. Risks / Follow-ups

1. WeChat DevTools trust/project permissions must stay enabled on the execution machine; otherwise auto-launch may fail before test runtime.
2. Legacy connect env variables (`WECHAT_WS_ENDPOINT`, `WECHAT_SERVICE_PORT`) are intentionally unsupported in S040 closure.
