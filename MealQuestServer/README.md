# MealQuestServer

Minimal runnable backend implementation for MealQuest.

## Core Capabilities

- Smart payment deduction (expiring coupon -> wallet balance -> change -> external payment)
- Payment verification with idempotency protection
- Refund clawback (consume gifted balance first, then principal)
- Policy OS decision engine (policy/trigger/constraint/scoring/action plugins)
- Supplier order verification API
- Alliance configuration (store clusters, shared wallet, cross-store sync)
- JWT auth with role scope (`CUSTOMER`, `CLERK`, `MANAGER`, `OWNER`)
- WebSocket realtime events (payment, refund, agent stream, fuse, policy decision)
- PostgreSQL relational persistence (multi-table)
- Strong shared-db isolation with PostgreSQL RLS (`tenant_id`)
- High-risk audit logs

## Quick Start

```powershell
cd .\MealQuestServer
Copy-Item .env.example .env
npm install
npm start
```

## Required Environment

At minimum, configure:

```ini
MQ_DB_URL=postgres://user:password@host:5432/mealquest
MQ_DB_SCHEMA=public
MQ_DB_SNAPSHOT_KEY=main
MQ_DB_AUTO_CREATE=true
MQ_DB_ENFORCE_RLS=true
MQ_DB_ADMIN_URL=
MQ_AUTH_WECHAT_MINI_APP_ID=
MQ_AUTH_WECHAT_MINI_APP_SECRET=
MQ_AUTH_ALIPAY_VERIFY_URL=
MQ_AUTH_ALIPAY_APP_ID=
MQ_AUTH_ALIPAY_APP_SECRET=
MQ_AUTH_HTTP_TIMEOUT_MS=10000
DEEPSEEK_MODEL=deepseek-chat
LANGSMITH_TRACING=false
LANGSMITH_PROJECT=mealquest-local
LANGSMITH_ENDPOINT=
```

Set `DEEPSEEK_API_KEY` via host environment injection (CI/CD secret or process manager), not in `.env`.
Set `LANGSMITH_API_KEY` via host environment injection (CI/CD secret or process manager), not in `.env`.

## LangSmith Observability (Local)

LangChain `createAgent` tracing is enabled automatically when LangSmith env vars are set.

1. Inject API key in your shell/process environment:

```powershell
$env:LANGSMITH_API_KEY="lsv2_pt_xxx"
```

2. Enable tracing for local run:

```powershell
$env:LANGSMITH_TRACING="true"
$env:LANGSMITH_PROJECT="mealquest-local"
```

3. Start server and send one request to `POST /api/agent-os/tasks/stream`.
4. Open LangSmith project and verify traces include AI Digital Operations Officer runs.

Notes:

1. Runtime state model is still in-memory first.
2. `save()` persists runtime state into relational tables under `MQ_DB_SCHEMA`.
3. Runtime state is fully managed by relational tenant tables keyed by `MQ_DB_SNAPSHOT_KEY`.
4. Migration cutover keeps working with tenant snapshot keys.
5. Shared-db tables are persisted by `tenant_id`, with transaction-scoped `app.tenant_id` context.
6. PostgreSQL RLS is enabled by default (`MQ_DB_ENFORCE_RLS=true`) and can be disabled only for troubleshooting.
7. Idempotency records are persisted in PostgreSQL (`mq_idempotency_records`) and scoped by `tenant_id`.
8. Request pipeline enforces tenant-scoped serialization and flushes pending persistence before response.
9. When `MQ_DB_AUTO_CREATE=true`, server auto-creates the target database if it is missing.
10. If the app user has no `CREATEDB` privilege, set `MQ_DB_ADMIN_URL` with an admin connection that points to an existing admin database (for example `/postgres`), not the target business database.
11. Payment write operations execute on fresh tenant state within one PostgreSQL transaction (`runWithFreshState`).

## Merchant Onboarding

Merchant onboarding is now completed only through auth flow:

```text
POST /api/auth/merchant/request-code
POST /api/auth/merchant/phone-login
POST /api/auth/merchant/complete-onboard
```

Server starts with an empty merchant dataset by default. Use phone login and complete-onboard to create the first store.

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
4. `merchant/phone-login` returns `BOUND` (direct owner login) or `ONBOARD_REQUIRED` (new merchant needs onboarding).
5. `merchant/complete-onboard` consumes onboarding token and immediately returns OWNER token for cockpit entry.
6. If no phone is available at login time, server rejects the login request.

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
```

## Business APIs

AI Digital Operations Officer APIs:

```text
POST /api/agent-os/agents/search
POST /api/agent-os/sessions
POST /api/agent-os/tasks/stream
GET  /api/agent-os/sessions/:sessionId/state
POST /api/agent-os/sessions/:sessionId/history
```

`/api/agent-os/tasks/stream` emits SSE events:

```text
event: metadata data: { task_id, session_id }
event: messages data: [...]
event: values   data: { messages: [...] }
event: custom   data: { ... }
event: updates  data: { ... }
event: error    data: { error, message }
event: end      data: { session_id, task_id, status }
```

Agent runtime behavior:

1. Agent runtime state is fully managed by `/api/agent-os/*` session state.
2. Session scope is singleton per `merchantId + operatorId` (single thread for short-term memory).
3. Agent tasks are executed via `POST /api/agent-os/tasks/stream` and persisted in session/task records.
4. Context compaction is strict DeepSeek compression only; compression failure aborts write (no fallback truncation).
5. `command.resume` is currently rejected by runtime policy.

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
npm run policyos:validate-templates
```

## Docker

```powershell
Copy-Item .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3030/health
```
