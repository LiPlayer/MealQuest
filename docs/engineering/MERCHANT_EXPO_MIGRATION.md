# Merchant App Consolidation

## Status

Completed on March 3, 2026:
- Removed parallel `MealQuestMerchantExpo/`.
- Consolidated to a single app at `MealQuestMerchant/`.
- Unified startup entry: `scripts/start-merchant-app.ps1` and `scripts/start-merchant-app.sh`.

## Runtime Baseline

`MealQuestMerchant/src/context/MerchantContext.tsx` uses:
1. Official `useStream` from `@langchain/langgraph-sdk/react`.
2. Expo network runtime via `expo/fetch` injected in `callerOptions.fetch`.

## Verification Baseline

Run from repo root:
1. `cd MealQuestMerchant && npm run lint`
2. `cd MealQuestMerchant && npm run typecheck`
3. `npm run check:encoding`
