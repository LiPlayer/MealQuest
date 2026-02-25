# MealQuestMerchant

React Native merchant app (operations cockpit + cashier + strategy confirmation).

## First Launch Flow

On first launch, the owner onboarding flow is:

1. Phone login (verification code)
2. New-user guide
3. Create store (merchant onboarding)
4. Contract merchant application
5. Enter merchant cockpit

After completion, the app stores an "onboarded" flag locally.
On later launches, it goes directly to the cockpit.

If you need to debug onboarding pages again, clear app data and reopen the app.

## Configuration

This app uses `react-native-config`.

Configuration file path is fixed:

1. Prefer `MealQuestMerchant/.env.local`
2. Fallback to `MealQuestMerchant/.env`

Restart Metro after changing environment values.

## Quick Start (Recommended)

Run from repository root:

```powershell
.\scripts\start-merchant-app.ps1 -Platform android
```

Optional flags:

1. `-AutoStartServer`: start backend server in background automatically
2. `-NoMetro`: skip Metro startup (use only if Metro is already running)
3. `-NoLaunch`: start environment + Metro only, skip install/run
4. `-Platform ios`: launch iOS debug app

## Manual Start

```powershell
cd .\MealQuestMerchant
npm install
npx react-native start --reset-cache
npm run android
```

## Integration Notes

1. Cockpit mode calls backend APIs for strategy approval, fuse, and TCA operations.
2. Merchant login is exchanged by `/api/auth/merchant/phone-login`.
3. Realtime events come from `/ws`.
4. Audit timeline is fetched from `/api/audit/logs` with filters and pagination.
5. If backend is unavailable, UI shows connection status and degrades gracefully.
6. Social operations (transfer, red packet, treat session) are removed from merchant UI and backend scope.

## Test

```powershell
cd .\MealQuestMerchant
npm test
npm run test:regression:ui
```
