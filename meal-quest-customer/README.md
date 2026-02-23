# meal-quest-customer

Customer mini-program built with Taro + React.

## Local Mode

Local mode uses mock data and does not require backend server.

```powershell
cd .\meal-quest-customer
npm install
npm run dev:weapp
```

## Remote Integration Mode

Start backend server first (see `MealQuestServer/README.md`), then configure
`meal-quest-customer/.env.development` (or `.env.development.local`):

```ini
TARO_APP_USE_REMOTE_API=true
TARO_APP_SERVER_URL=http://127.0.0.1:3030
TARO_APP_DEFAULT_STORE_ID=m_my_first_store
```

Then run:

```powershell
npm run dev:weapp
```

Notes:

1. If remote API fails, client automatically falls back to local mock.
2. Client uses `/api/auth/mock-login` to fetch a test token.

## Test

```powershell
npm test
npm run test:e2e
```
