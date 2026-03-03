# MealQuest Operations Runbook

Last updated: March 3, 2026

## 1. Environment

Server required variables:
- `MQ_DB_URL`
- `MQ_JWT_SECRET`
- `MQ_PAYMENT_CALLBACK_SECRET`
- `HOST`
- `PORT`
- `MQ_AUTH_WECHAT_MINI_APP_ID`
- `MQ_AUTH_WECHAT_MINI_APP_SECRET`

Merchant app required variable:
- `EXPO_PUBLIC_MQ_SERVER_URL`

Customer app required variables:
- `TARO_APP_SERVER_URL`
- `TARO_APP_DEFAULT_STORE_ID`

## 2. Local Startup Order

1. Start server:
```bash
cd MealQuestServer
npm start
```
2. Start merchant app:
```bash
cd MealQuestMerchant
npm run dev:android
```
3. Start customer app:
```bash
cd meal-quest-customer
npm run dev:weapp
```

## 3. Pre-Release Gate

From repo root:
```bash
npm run verify
```

Then run server smoke test:
```bash
cd MealQuestServer
npm run test:smoke
```

## 4. Incident Recovery

1. Stop rollout for the affected service.
2. Roll back to the latest build that passed `npm run verify`.
3. Restore auth/payment/tenant-isolation first.
4. Re-run `verify` and `test:smoke` before reopening rollout.
