# MealQuestServer

Minimal runnable backend implementation for MealQuest.

## Core Capabilities

- Smart payment deduction (expiring coupon -> wallet balance -> change -> external payment)
- Payment verification with idempotency protection
- Refund clawback (consume gifted balance first, then principal)
- TCA engine (Trigger / Condition / Action)
- AI-driven merchant strategy proposal and approval workflow
- LangGraph-based strategy planning orchestration
- Emergency fire-sale override (`Priority:999 + TTL`)
- Supplier order verification API
- Alliance configuration (store clusters, shared wallet, cross-store sync)
- JWT auth with role scope (`CUSTOMER`, `CLERK`, `MANAGER`, `OWNER`)
- WebSocket realtime events (payment, refund, strategy, fuse, TCA)
- PostgreSQL relational persistence (multi-table)
- Strong shared-db isolation by merchant scope
- High-risk audit logs

## Quick Start

```powershell
cd .\MealQuestServer
Copy-Item .env.example .env
npm install
npm start
```

You can also start from repository scripts:

```powershell
.\scripts\start-server.ps1 -Profile dev
.\scripts\start-server.ps1 -Profile staging
.\scripts\start-server.ps1 -Profile prod
```

## Required Environment

At minimum, configure:

```ini
MQ_DB_URL=postgres://user:password@host:5432/mealquest
MQ_DB_SCHEMA=public
MQ_DB_LEGACY_SNAPSHOT_TABLE=mealquest_state_snapshots
# backward compatible alias:
MQ_DB_STATE_TABLE=mealquest_state_snapshots
MQ_DB_SNAPSHOT_KEY=main
MQ_DB_AUTO_CREATE=true
MQ_DB_ADMIN_URL=
MQ_AUTH_WECHAT_MINI_APP_ID=
MQ_AUTH_WECHAT_MINI_APP_SECRET=
MQ_AUTH_ALIPAY_VERIFY_URL=
MQ_AUTH_ALIPAY_APP_ID=
MQ_AUTH_ALIPAY_APP_SECRET=
MQ_AUTH_HTTP_TIMEOUT_MS=10000
MQ_AI_PROVIDER=bigmodel
MQ_AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
MQ_AI_MODEL=glm-4.7-flash
MQ_AI_API_KEY=
MQ_AI_TIMEOUT_MS=45000
MQ_AI_MAX_CONCURRENCY=1
MQ_AI_MAX_RETRIES=2
MQ_AI_RETRY_BACKOFF_MS=180
MQ_AI_CIRCUIT_BREAKER_THRESHOLD=4
MQ_AI_CIRCUIT_BREAKER_COOLDOWN_MS=30000
```

Notes:

1. Runtime state model is still in-memory first.
2. `save()` persists runtime state into relational tables under `MQ_DB_SCHEMA`.
3. On first run, if relational rows do not exist for `MQ_DB_SNAPSHOT_KEY`, server tries one-time import from the legacy snapshot table.
4. Migration cutover and rollback keep working with tenant snapshot keys.
5. When `MQ_DB_AUTO_CREATE=true`, server auto-creates the target database if it is missing.
6. If the app user has no `CREATEDB` privilege, set `MQ_DB_ADMIN_URL` with an admin connection.
7. `MQ_AI_PROVIDER=bigmodel` is supported with BigModel chat completions endpoint.
8. `MQ_AI_API_KEY` is required for BigModel (`provider=bigmodel`), optional for local openai-compatible servers.
9. If model inference is unavailable, strategy proposal API returns `AI_UNAVAILABLE` (no local fallback strategy is generated).
10. `MQ_AI_MAX_CONCURRENCY` controls in-process AI request queue parallelism (set `1` for strict serial execution).
11. `MQ_AI_MAX_RETRIES` and `MQ_AI_RETRY_BACKOFF_MS` control transient upstream retry behavior.
12. `MQ_AI_CIRCUIT_BREAKER_*` prevents repeated upstream failures from cascading across requests.
13. Strategy planning is orchestrated by LangGraph (`prepare_input -> remote_decide -> assemble_plan`).

## Merchant Onboarding

Create a custom merchant without relying on `m_store_001`:

```powershell
cd .\MealQuestServer
npm run onboard:merchant -- --merchant-id m_my_first_store --name "My First Store"
```

API endpoints:

```text
POST /api/merchant/onboard
GET  /api/merchant/catalog
```

Engineering reference:

- `docs/AI_STRATEGY_ENGINEERING.md` (AI strategy architecture, resilience, rollout)

Example body:

```json
{
  "merchantId": "m_my_first_store",
  "name": "My First Store",
  "budgetCap": 500,
  "seedDemoUsers": true
}
```

## Auth

```text
POST /api/auth/customer/wechat-login
POST /api/auth/customer/alipay-login
POST /api/auth/merchant/request-code
POST /api/auth/merchant/phone-login
```

Notes:

1. `customer/wechat-login` exchanges mini-program `code` with WeChat, then auto-binds a phone identity for merchant-scoped customer sessions.
2. `customer/alipay-login` exchanges Alipay `code` with a configured verification endpoint, then binds by phone.
3. Same phone under the same merchant resolves to the same customer account across WeChat and Alipay.
4. `merchant/phone-login` issues OWNER token by `phone + code`, with optional `merchantId` for scoped session.
5. If no phone is available at login time, server rejects the login request.

Optional protection for onboarding APIs:

- Set `MQ_ONBOARD_SECRET`
- Send header `x-onboard-secret`

## Tenant Routing and Policy

`createAppServer` supports:

- `tenantDbMap` for hotspot tenant routing
- `tenantPolicyMap` for write freeze, WS gating, and per-action limits

Policy APIs (owner only):

```text
GET  /api/merchant/tenant-policy?merchantId=<id>
POST /api/merchant/tenant-policy
```

Migration orchestration (owner only):

```text
GET  /api/merchant/migration/status?merchantId=<id>
POST /api/merchant/migration/step
POST /api/merchant/migration/cutover
POST /api/merchant/migration/rollback
```

## Business APIs

Strategy library and operations:

```text
GET  /api/merchant/strategy-library?merchantId=<id>
GET  /api/merchant/strategy-configs?merchantId=<id>
GET  /api/merchant/strategy-chat/session?merchantId=<id>&sessionId=<optional>
POST /api/merchant/strategy-chat/sessions
POST /api/merchant/strategy-chat/messages
POST /api/merchant/strategy-chat/proposals/:id/review
POST /api/merchant/campaigns/:id/status
POST /api/merchant/fire-sale
```

Strategy chat behavior:

1. Strategy chat is continuous within the active session (`strategy-chat/session`).
2. When AI drafts a proposal card, session enters `PENDING_REVIEW`.
3. Merchant must immediately `APPROVE` or `REJECT` via `strategy-chat/proposals/:id/review` before sending next message.
4. Creating a new session resets chat context (history sessions are not exposed by API).

Supplier verification:

```text
POST /api/supplier/verify-order
```

Alliance APIs:

```text
GET  /api/merchant/alliance-config?merchantId=<id>
POST /api/merchant/alliance-config
GET  /api/merchant/stores?merchantId=<id>
POST /api/merchant/alliance/sync-user
```

Audit and WS status:

```text
GET /api/audit/logs?merchantId=<id>&limit=<n>&cursor=<cursor>&startTime=<iso>&endTime=<iso>&action=<ACTION>&status=<STATUS>
GET /api/ws/status?merchantId=<id>
```

## WebSocket

```text
ws://127.0.0.1:3030/ws?merchantId=m_store_001&token=<JWT>
```

## External Payment Callback

Configure callback secret:

```ini
MQ_PAYMENT_CALLBACK_SECRET=mealquest-payment-callback-secret
```

Callback endpoint:

```text
POST /api/payment/callback
Header: X-Payment-Signature: <hmac-sha256(JSON(body), secret)>
Body: { merchantId, paymentTxnId, externalTxnId, status, paidAmount, callbackId }
```

If an order has external payable amount, `/api/payment/verify` returns `PENDING_EXTERNAL`.
When callback is verified, payment moves to `PAID` and settlement finalizes.

## Invoice and Privacy APIs

```text
POST /api/invoice/issue
GET  /api/invoice/list?merchantId=<id>&userId=<optional>&limit=<optional>
POST /api/privacy/export-user
POST /api/privacy/delete-user
POST /api/privacy/cancel-account
```

## Metrics

```text
GET /metrics
```

Prometheus-style text output.

## Test

```powershell
npm test
```

## Docker

```powershell
Copy-Item .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3030/health
```
