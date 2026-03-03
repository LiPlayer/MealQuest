# Merchant Expo Migration Layout

## Purpose

`MealQuestMerchantExpo/` is a parallel migration track for the merchant app.
It coexists with `MealQuestMerchant/` so rollback remains immediate.

## Directory Layout

- `MealQuestMerchant/`: legacy React Native CLI app (kept during migration)
- `MealQuestMerchantExpo/`: Expo Dev Client migration app
- `scripts/start-merchant-app.ps1`: legacy RN launch entry
- `scripts/start-merchant-expo-app.ps1`: Expo launch entry

## Runtime Strategy

`MealQuestMerchantExpo/src/context/MerchantContext.tsx` uses:

1. Official `useStream` path when runtime stream APIs are available.
2. SSE fallback path when runtime support is incomplete.

This removes hard runtime failure while preserving streaming behavior.

## Verification Baseline

For Expo migration changes:

1. `cd MealQuestMerchantExpo && npm run typecheck`
2. `cd MealQuestMerchantExpo && npm run lint` (warnings currently tolerated)
3. `npm run check:encoding` from repo root
