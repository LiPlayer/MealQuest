# S060 - Ledger & Audit Baseline Closure

- Scope: S060-SRV-01, S060-MER-01, S060-CUS-01
- Date: 2026-03-05
- Status: pass

## Delivered

1. Server trace baseline is closed: `policyRegistry/policyOsService` now expose `listDecisions` for unified decision trace query in dashboard/state snapshot paths.
2. Ledger read API normalizes mixed timestamp fields (`timestamp` + `createdAt`) to preserve payment and PolicyOS ledger compatibility.
3. Merchant dashboard provides 24h trace summary card (payments/ledger/invoices/audits/decisions + pending chain count).
4. Customer ledger mapper supports `createdAt` fallback to avoid broken timestamp rendering.

## Verification Commands

1. `cd MealQuestServer && npm run test:step:s060` (pass, non-sandbox rerun for localhost bind)
2. `cd MealQuestMerchant && npm run lint && npm run typecheck` (pass)
3. `cd meal-quest-customer && npm test -- --runInBand test/services/api-data-service-customer-center.test.ts test/pages/account.test.tsx` (pass)

## Key Evidence

- `MealQuestServer/src/policyos/policyRegistry.ts`
- `MealQuestServer/src/policyos/policyOsService.ts`
- `MealQuestServer/src/http/routes/paymentRoutes.ts`
- `MealQuestServer/src/services/merchantService.ts`
- `MealQuestServer/test/policyOs.constraints.test.ts`
- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/context/MerchantContext.tsx`
- `MealQuestMerchant/src/domain/merchantEngine.ts`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- `meal-quest-customer/src/services/customerApp/mappers.ts`
- `meal-quest-customer/test/services/api-data-service-customer-center.test.ts`

## Notes

1. Sandbox execution of `test:step:s060` fails on `listen EPERM 127.0.0.1`; rerun outside sandbox passes.
2. `S110` remains next pointer and should restore dedicated step-suite when S110 implementation starts.
