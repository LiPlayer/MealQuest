# S040 Entry Closure (Reopened)

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S040 |
| Scope | Server + Merchant + Customer |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Status | pass |
| Source of Truth | `docs/specs/mealquest-spec.md`, `docs/roadmap.md` |

## 2. Delivered Scope

1. Server: extended merchant dashboard contract with read-only customer-entry visibility (`customerEntry`).
2. Merchant: added read-only customer-entry card and dashboard pull in authenticated session.
3. Merchant: delivered dedicated entry-QR page with local QR generation (`merchantId`) and image save/share actions, with entry unified at dashboard.
4. Merchant: fixed QR return-path stability by switching to root stack shell + safe fallback when history stack is absent.
5. Merchant: froze IA shell early with tabs placeholders (`dashboard/agent/approvals/replay/risk`) to reduce S110+ route churn.
6. Customer: rewrote startup/index/account pages into unified modern layout system while keeping scan-entry/payment/account contracts unchanged.
7. Added/updated regression checks for entry and account key paths.

## 3. Evidence Mapping

| task_id | Required Output | Evidence |
| --- | --- | --- |
| S040-SRV-01 | 顾客登录与入店合同基线（扫码入店/会话建立/资产状态） | `MealQuestServer/test/http.integration.test.ts` (`customer wechat login binds phone as primary identity`, `merchant exists endpoint returns precise availability`, `merchant dashboard exposes read-only customer entry visibility after customer login`) |
| S040-MER-01 | 顾客入店状态变化只读可见性 | `MealQuestMerchant/src/context/MerchantContext.tsx`, `MealQuestMerchant/src/screens/AgentScreen.tsx`, `MealQuestMerchant/src/services/apiClient.ts` |
| S040-MER-02 | merchant entry QR source (`preview + save + share`) | `MealQuestMerchant/src/screens/EntryQrScreen.tsx`, `MealQuestMerchant/src/services/entryQrService.ts`, `MealQuestMerchant/app/entry-qrcode.tsx`, `MealQuestMerchant/src/screens/DashboardScreen.tsx` |
| S040-MER-03 | merchant IA shell freeze + QR back-navigation safety | `MealQuestMerchant/app/_layout.tsx`, `MealQuestMerchant/app/(tabs)/_layout.tsx`, `MealQuestMerchant/app/(tabs)/dashboard.tsx`, `MealQuestMerchant/app/(tabs)/approvals.tsx`, `MealQuestMerchant/app/(tabs)/replay.tsx`, `MealQuestMerchant/app/(tabs)/risk.tsx` |
| S040-CUS-01 | startup 扫码入店闭环 | `meal-quest-customer/src/pages/startup/index.tsx`, `meal-quest-customer/test/pages/startup.test.tsx` |
| S040-CUS-01 | 会话建立 + 首页资产首屏 | `meal-quest-customer/src/pages/index/index.tsx`, `meal-quest-customer/src/components/CustomerCardStack.tsx`, `meal-quest-customer/src/components/CustomerBottomDock.tsx` |
| S040-CUS-01 | 账本/发票/注销链路 | `meal-quest-customer/src/pages/account/index.tsx`, `meal-quest-customer/test/pages/account.test.tsx` |

## 4. Verification Commands

1. `cd MealQuestMerchant && npm run lint && npm run typecheck` -> pass
2. `cd meal-quest-customer && npm run typecheck` -> pass
3. `cd meal-quest-customer && npm test -- --runInBand test/pages/startup.test.tsx test/pages/account.test.tsx` -> pass (2 suites, 8 tests)
4. `npm run check:encoding` -> pass (`OK (41 file(s) scanned)`)
5. `cd meal-quest-customer && npm run test:e2e:core` -> skipped on Ubuntu (`weapp e2e is windows-only`)

## 5. Manual Smoke Record

1. 2026-03-04 商户端手工冒烟确认：二维码保存/分享测试通过（用户确认）。
2. 此记录用于 `S040-MER-02` 的手工验收闭环。

## 6. Risks / Follow-ups

1. Customer e2e is intentionally Windows-only; non-Windows environments skip `test:e2e:core` by design.
