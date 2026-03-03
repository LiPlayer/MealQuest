# MealQuest Implemented Features (Current Snapshot)

Last updated: 2026-03-03

This document records capabilities currently available in code.
Normative product/engineering source remains: `docs/specs/mealquest-spec.md`.

## 1. Server (`MealQuestServer`)

### 1.1 Auth and onboarding
- `GET /health`, `GET /metrics`
- Merchant phone auth:
  - `POST /api/auth/merchant/request-code`
  - `POST /api/auth/merchant/phone-login`
  - `POST /api/auth/merchant/complete-onboard`
- Customer social auth:
  - `POST /api/auth/customer/wechat-login`
  - `POST /api/auth/customer/alipay-login`
- Merchant basic discovery:
  - `GET /api/merchant/catalog`
  - `GET /api/merchant/exists`

### 1.2 Payments, ledger, invoice, privacy
- Payments:
  - `POST /api/payment/quote`
  - `POST /api/payment/verify` (idempotent)
  - `POST /api/payment/refund` (idempotent)
  - `POST /api/payment/callback` (signature verified)
  - `GET /api/payment/ledger`
- Invoices:
  - `POST /api/invoice/issue`
  - `GET /api/invoice/list`
- Privacy:
  - `POST /api/privacy/export-user`
  - `POST /api/privacy/delete-user`
  - `POST /api/privacy/cancel-account`

### 1.3 Strategy chat / LangGraph bridge
- LangGraph-compatible endpoints:
  - `POST /api/langgraph/assistants/search`
  - `POST /api/langgraph/threads`
  - `GET /api/langgraph/threads/:threadId`
  - `GET /api/langgraph/threads/:threadId/state`
  - `POST /api/langgraph/threads/:threadId/history`
  - `POST /api/langgraph/runs/stream`
  - `POST /api/langgraph/threads/:threadId/runs/stream`
  - `POST /api/langgraph/runs/:runId/cancel`
- Stream transport: Server-Sent Events with `metadata/values/messages/end/error`.
- Current strategy workflow is chat-oriented.

### 1.4 Policy OS lifecycle and runtime
- Schemas/plugins:
  - `GET /api/policyos/schemas`
  - `GET /api/policyos/plugins`
- Draft lifecycle:
  - `POST /api/policyos/drafts`
  - `GET /api/policyos/drafts`
  - `POST /api/policyos/drafts/:id/submit`
  - `POST /api/policyos/drafts/:id/approve`
  - `POST /api/policyos/drafts/:id/publish`
- Policy runtime:
  - `GET /api/policyos/policies`
  - `POST /api/policyos/policies/:id/pause`
  - `POST /api/policyos/policies/:id/resume`
  - `POST /api/policyos/decision/evaluate`
  - `POST /api/policyos/decision/execute` (requires confirmed signal)
  - `GET /api/policyos/decisions/:id/explain`
  - `POST /api/policyos/compliance/retention/run`

### 1.5 Merchant operations / multi-tenant governance
- Merchant ops:
  - `GET /api/merchant/dashboard`
  - `POST /api/merchant/kill-switch`
  - `GET /api/merchant/contract/status`
  - `POST /api/merchant/contract/apply`
  - `POST /api/supplier/verify-order`
- Alliance:
  - `GET /api/merchant/alliance-config`
  - `POST /api/merchant/alliance-config`
  - `GET /api/merchant/stores`
  - `POST /api/merchant/alliance/sync-user`
- Tenant policy and migration:
  - `GET /api/merchant/tenant-policy`
  - `POST /api/merchant/tenant-policy`
  - `GET /api/merchant/migration/status`
  - `POST /api/merchant/migration/step`
  - `POST /api/merchant/migration/cutover`

### 1.6 State, audit, websocket status
- `GET /api/state`
- `GET /api/ws/status`
- `GET /api/audit/logs`
- Audit logging is implemented for high-risk actions (success/denied/failed).

## 2. Merchant app (`MealQuestMerchant`)

### 2.1 Implemented screens and flows
- `LoginScreen`
- `QuickOnboardScreen`
- `StrategyScreen` (chat mode)
- `StrategyScreen` includes:
  - Chat UI with streaming progress display
  - Retry for failed user message
  - Goal input and send flow

### 2.2 Current engineering status
- App source and routing are present and wired (`expo-router` structure exists).
- Merchant app `npm run typecheck` passes on current branch baseline.

## 3. Customer app (`meal-quest-customer`)

- Project scaffold exists in monorepo.

## 4. Test baseline at snapshot time

- `cd MealQuestServer && npm test` -> pass (`60/60`)
- `cd MealQuestMerchant && npm run typecheck` -> pass
- `npm run check:encoding` -> pass

## 5. Repo automation baseline

- Root repo task scripts:
  - `scripts/repo-task.js`
  - `scripts/check-encoding.js`
- Root `repo-task.js` is the monorepo bootstrap/lint/typecheck/test entrypoint.
- App startup commands:
  - `cd MealQuestServer && npm start`
  - `cd MealQuestMerchant && npm run dev:android` / `npm run dev:ios`
  - `cd meal-quest-customer && npm run dev:weapp`
