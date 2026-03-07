# meal-quest-customer

Customer mini-program built with Taro + React.

## Runtime Mode

Start backend server first (see `MealQuestServer/README.md`), then configure
`meal-quest-customer/.env` (single source):

```ini
TARO_APP_SERVER_URL=http://127.0.0.1:3030
```

Then run:

```powershell
cd .\meal-quest-customer
npm install
npm run dev:weapp
```

Notes:

1. The app runs in server mode only (no local mock fallback).
2. Client resolves auth provider from runtime/build platform automatically.
3. WeChat uses `/api/auth/customer/wechat-login`; Alipay uses `/api/auth/customer/alipay-login`.
4. CLI env vars override `.env` values. Example:

```powershell
$env:TARO_APP_SERVER_URL="http://192.168.1.10:3030"
npm run dev:weapp
```

5. Legacy files `.env.development/.env.production/.env.test` are no longer supported.
6. Default store entry via env is disabled. Entry is allowed only by scan params or `lastStore`.

## Test

```powershell
npm test
npm run test:e2e
```
