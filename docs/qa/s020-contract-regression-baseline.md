# S020 Contract Regression Baseline

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S020 |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Source of Truth | docs/specs/mealquest-spec.md, docs/roadmap.md |

## 2. Canonical Entry Commands

1. Root (one-shot):
- `npm run test:contract:baseline`

2. Server:
- `cd MealQuestServer && npm run test:contract:baseline`

3. Merchant:
- `cd MealQuestMerchant && npm run test:contract:baseline`

4. Customer:
- `cd meal-quest-customer && npm run test:contract:baseline`

## 3. Coverage Baseline By Domain

### 3.1 Server Contract Domains

- `test/policyOs.schema.test.ts`
  - Policy/Story schema contract validation baseline.
- `test/policyOs.constraints.test.ts`
  - Constraint contract baseline (budget/库存/治理约束执行结果).
- `test/policyOs.ledger.test.ts`
  - Ledger contract baseline (grant/clawback/idempotency rule).
- `test/omniAgentService.stream.test.ts`
  - Omni Agent service stream contract baseline (provider-agnostic stream tuple and memory compressor behavior).

### 3.1.1 Deep Triage Tests (On Demand)

- `test/policyOs.http.integration.test.ts`
- `test/agentOs.stream.integration.test.ts`
- `test/http.integration.test.ts`
- Use these when baseline passes but HTTP route-level regressions are suspected.

### 3.2 Merchant Contract Domains

- `eslint .`
  - route/request payload usage and cross-module API call consistency under static analysis.
- `tsc --noEmit`
  - API DTO and context contract type safety for login/onboard/session/agent entry flows.

### 3.3 Customer Contract Domains

- `test/services/api-data-service.test.ts`
  - `apiDataService` payment/invoice/state query mapping contract.
- `test/services/api-data-service-customer-center.test.ts`
  - customer-center endpoints (including cancel-account) contract and parameter mapping.
- `test/pages/startup.test.tsx`
  - startup page scan/login/merchant parse flow contract.
- `test/pages/account.test.tsx`
  - account page ledger/invoice rendering and action contract.

## 4. Failure Localization Mapping

| Signal | First Check | Domain Owner | Typical Action |
| --- | --- | --- | --- |
| PolicyOS decision contract failure | `cd MealQuestServer && npm run test:contract:baseline` | server | Inspect PolicyOS route/service request schema and response envelope |
| Agent stream event mismatch | `cd MealQuestServer && npm run test:contract:baseline` | server + merchant | Verify stream event format and merchant parser compatibility |
| Merchant contract compile/lint failure | `cd MealQuestMerchant && npm run test:contract:baseline` | merchant | Fix API call payload/response type drift |
| Customer apiDataService mapping failure | `cd meal-quest-customer && npm run test:contract:baseline` | customer + server | Reconcile endpoint params, field names, and envelope mapping |
| Page-level contract regression (startup/account) | `cd meal-quest-customer && npm run test:contract:baseline` | customer | Align UI data-binding and fallback handling with service contract |

## 5. S020 Delivery Checklist

1. Three-lane baseline commands are stable and repeatable. ✅
2. Failures can be mapped to server/merchant/customer ownership quickly. ✅
3. Root one-shot command can run all baseline checks. ✅
