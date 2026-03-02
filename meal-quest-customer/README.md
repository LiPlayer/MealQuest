# meal-quest-customer

Customer mini-program built with Taro + React.

## Runtime Mode

Start backend server first (see `MealQuestServer/README.md`), then configure
`meal-quest-customer/.env.development` (or `.env.development.local`):

```ini
TARO_APP_SERVER_URL=http://127.0.0.1:3030
TARO_APP_DEFAULT_STORE_ID=m_my_first_store
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

## Test

```powershell
npm test
npm run test:e2e
```
