# S110 - Acquisition Welcome Trigger & Eligibility Closure

- Date: 2026-03-05
- Scope: S110-SRV-01, S110-MER-01, S110-CUS-01

## What was closed

1. Server-side customer login (`/api/auth/customer/wechat-login`, `/api/auth/customer/alipay-login`) now auto-executes `USER_ENTER_SHOP` welcome decision and returns decision summary (`outcome`, `reasonCode`, `decisionId`, `traceId`).
2. Merchant dashboard now exposes `acquisitionWelcomeSummary` (24h hit/block counts, top block reasons, latest decision outcomes).
3. Customer state snapshot now prepends `WELCOME` activity card from latest welcome decision so customer-visible outcome is aligned with merchant-visible result.

## Verification commands

1. `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/http.integration.test.ts`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/policyOs.constraints.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run test:regression:ui`

## Key regression evidence

- Added/validated integration coverage in `MealQuestServer/test/http.integration.test.ts`:
  - customer login auto-triggers welcome HIT and both merchant/customer views are consistent;
  - customer login blocked welcome path exposes reason and both merchant/customer views are consistent.
- Existing policy constraint suite still passes for risk/frequency/budget gates.
