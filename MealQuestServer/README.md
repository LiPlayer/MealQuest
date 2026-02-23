# MealQuestServer

Minimal runnable backend implementation for MealQuest.

## Core Capabilities

- Smart payment deduction (expiring coupon -> wallet balance -> change -> external payment)
- Payment verification with idempotency protection
- Refund clawback (consume gifted balance first, then principal)
- TCA engine (Trigger / Condition / Action)
- Merchant strategy proposal and approval workflow
- Emergency fire-sale override (`Priority:999 + TTL`)
- Supplier order verification API
- Alliance configuration (store clusters, shared wallet, cross-store sync)
- Social growth ledger (transfer and red packet, total amount conservation)
- JWT auth with role scope (`CUSTOMER`, `CLERK`, `MANAGER`, `OWNER`)
- WebSocket realtime events (payment, refund, strategy, fuse, TCA)
- PostgreSQL snapshot persistence
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
MQ_DB_STATE_TABLE=mealquest_state_snapshots
MQ_DB_SNAPSHOT_KEY=main
```

Notes:

1. Runtime state model is still in-memory first.
2. `save()` persists one JSONB snapshot to PostgreSQL by upsert.
3. Migration cutover and rollback keep working with tenant snapshot keys.

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

Example body:

```json
{
  "merchantId": "m_my_first_store",
  "name": "My First Store",
  "budgetCap": 500,
  "seedDemoUsers": true
}
```

## Auth and Debug Login

```text
POST /api/auth/mock-login
POST /api/auth/merchant/request-code
POST /api/auth/merchant/phone-login
```

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
POST /api/merchant/strategy-proposals
POST /api/merchant/campaigns/:id/status
POST /api/merchant/fire-sale
```

Supplier verification:

```text
POST /api/supplier/verify-order
```

Alliance and social APIs:

```text
GET  /api/merchant/alliance-config?merchantId=<id>
POST /api/merchant/alliance-config
GET  /api/merchant/stores?merchantId=<id>
POST /api/merchant/alliance/sync-user
POST /api/social/transfer
POST /api/social/red-packets
POST /api/social/red-packets/:packetId/claim
GET  /api/social/red-packets/:packetId?merchantId=<id>
POST /api/social/treat/sessions
POST /api/social/treat/sessions/:sessionId/join
POST /api/social/treat/sessions/:sessionId/close
GET  /api/social/treat/sessions/:sessionId?merchantId=<id>
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
