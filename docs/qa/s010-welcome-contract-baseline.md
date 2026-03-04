# S010 Welcome Contract Baseline

## 1. Meta

| Field | Value |
| --- | --- |
| StepID | S010 |
| Date | 2026-03-04 |
| Owner | AI/Agent |
| Source of Truth | docs/specs/mealquest-spec.md, docs/roadmap.md |

### 1.1 Task To Evidence Mapping

| task_id | Required Output | Evidence |
| --- | --- | --- |
| S010-SRV-01 | Acquisition/Welcome event + API + audit fields | Section 2, Section 3, `MealQuestServer/test/http.integration.test.ts` (`acquisition welcome template supports USER_ENTER_SHOP evaluate/execute`) |
| S010-MER-01 | Merchant-side key mapping check (Agent entry + merchant entry/session fields) | Section 4, `MealQuestMerchant/src/context/MerchantContext.tsx`, `MealQuestMerchant/src/services/apiClient.ts`, `MealQuestMerchant/src/services/authSessionStorage.ts` |
| S010-CUS-01 | Mini-program mapping check (`state/payment/invoice`) | Section 5, `meal-quest-customer/src/services/apiDataService/index.ts`, `meal-quest-customer/test/services/api-data-service.test.ts`, `meal-quest-customer/test/services/api-data-service-customer-center.test.ts` |

## 2. Canonical Welcome Event And Template

- Canonical template: `acquisition_welcome_gift`
- Canonical trigger event: `USER_ENTER_SHOP`
- Canonical source:
  - `MealQuestServer/src/policyos/templates/strategy-templates.v1.json`

## 3. Server Contract Baseline (S010-SRV-01)

### 3.1 PolicyOS Decision APIs

1. `POST /api/policyos/decision/evaluate`
- Request baseline:
  - required: `event`
  - conditional: `merchantId` (or from auth scope)
  - optional: `userId`, `eventId`, `context`, `draftId|draft_id`
- Behavior baseline:
  - event normalized to upper-case
  - tenant policy guard: `POLICY_EVALUATE`
- Response baseline:
  - includes `decision_id`, `selected[]`, `rejected[]`, `explains[]`, `projected[]`
- Audit baseline:
  - action: `POLICY_EVALUATE`
  - details: `decisionId`, `selected`, `rejected`

2. `POST /api/policyos/decision/execute`
- Request baseline:
  - required: `event`
  - required confirm signal: header `x-execute-confirmed|x-policyos-execute-confirmed` or body `confirmed|executeConfirmed=true`
  - conditional: `merchantId` (or from auth scope)
  - optional: `userId`, `eventId`, `context`
- Behavior baseline:
  - tenant policy guard: `POLICY_EXECUTE`
  - without confirm returns `400 execute confirmation is required`
- Response baseline:
  - includes `decision_id`, `executed[]`, `rejected[]`
- Audit baseline:
  - action: `POLICY_EXECUTE`
  - details: `decisionId`, `executed`

### 3.2 AgentOS Stream API

1. `POST /api/agent-os/tasks/stream`
- Request baseline:
  - required scope: merchant role + `merchantId` + `operatorId`
  - required body fields used by merchant app: `merchantId`, `agent_id`, `input.messages[]`, `stream_mode[]`, `metadata.merchantId`
- Behavior baseline:
  - tenant policy guard: `AGENT_WRITE`
  - returns `text/event-stream`
- Stream event baseline:
  - `metadata` with `task_id`, `session_id`
  - `messages` token deltas
  - `custom` progress payload
  - `error` with `error|message`
  - `end` with `session_id`, `task_id`, `status`
- Operation mapping baseline:
  - `POST /api/agent-os/tasks/stream` => `AGENT_TASK_RUN`

### 3.3 State/Payment/Invoice Query APIs (Cross-check for S010-CUS-01)

1. `GET /api/state`
- required: `merchantId`
- conditional: `userId` (required for customer role)
- role scope: merchant roles + customer
- scope guard: `merchant scope denied`, `user scope denied`
- response baseline: `merchant`, `user`, `dashboard`, `policyOs`

2. `GET /api/payment/ledger`
- required: `merchantId`
- optional: `userId`, `limit`
- role scope: merchant roles + customer
- customer user scope guard enabled (`user scope denied`)
- response baseline: `merchantId`, `userId|null`, `items[]`

3. `GET /api/invoice/list`
- required: `merchantId`
- optional: `userId`, `limit`
- role scope: merchant roles + customer
- customer user scope guard enabled (`user scope denied`)
- response baseline: `merchantId`, `items[]`

### 3.4 Audit Field Baseline

- Common audit envelope fields:
  - `merchantId`
  - `action`
  - `status`
  - `auth`
  - `details`
- Welcome decision critical details:
  - `decisionId`
  - `selected|rejected|executed`
- Query/stream path operation codes (policy mapping):
  - `POLICY_EVALUATE`, `POLICY_EXECUTE`, `AGENT_TASK_RUN`

## 4. Merchant Mapping Baseline (S010-MER-01)

### 4.1 Agent Stream Parse Mapping

- Source: `MealQuestMerchant/src/context/MerchantContext.tsx`
- Request mapping:
  - `merchantId` -> body `merchantId`
  - `OFFICIAL_AGENT_ID` -> body `agent_id`
  - user input -> body `input.messages[0].content`
- SSE parse mapping:
  - `messages` -> assistant text concat
  - `custom` -> `AgentProgressEvent`
    - `phase`, `status`, `tokenCount`, `elapsedMs`, `at`, `resultStatus`, `error`
  - `error` -> throw and surface message

### 4.2 Merchant Entry/Session Contract Mapping

- Source:
  - `MealQuestMerchant/src/services/apiClient.ts`
  - `MealQuestMerchant/src/context/MerchantContext.tsx`
  - `MealQuestMerchant/src/services/authSessionStorage.ts`
- API mapping:
  - `POST /api/auth/merchant/request-code` for SMS request
  - `POST /api/auth/merchant/phone-login` returns `BOUND` or `ONBOARD_REQUIRED`
  - `POST /api/auth/merchant/complete-onboard` binds owner and store
  - `GET /api/merchant/stores` hydrates merchant name for restored session
- Session mapping:
  - persisted key: `mq_merchant_auth_session`
  - required fields: `token`, `merchantId`, `role`, `phone`
  - hydration path: persisted session -> `getMerchantStores` -> in-memory authenticated session

### 4.3 S010 Merchant Conclusion

- Merchant app consumes canonical AgentOS stream event set (`messages/custom/error`).
- Merchant entry/session field semantics are aligned with server auth/onboard contracts.

## 5. Customer Mapping Baseline (S010-CUS-01)

### 5.1 State Mapping

- Source: `meal-quest-customer/src/services/apiDataService/index.ts`
- API call:
  - `GET /api/state?merchantId={storeId}&userId={session.userId}`
- Mapping:
  - response -> `toHomeSnapshot` -> customer home payload (`merchant`, `wallet`, `fragments`, `vouchers`, activities)

### 5.2 Ledger Mapping

- API call:
  - `GET /api/payment/ledger?merchantId={storeId}&userId={session.userId}&limit={limit}`
- Mapping:
  - `txnId`, `merchantId`, `userId`, `type`, `amount`, `timestamp`, `paymentTxnId`

### 5.3 Invoice Mapping

- API call:
  - `GET /api/invoice/list?merchantId={storeId}&userId={session.userId}&limit={limit}`
- Mapping:
  - `invoiceNo`, `merchantId`, `userId`, `paymentTxnId`, `amount`, `status`, `issuedAt`, `title`

### 5.4 S010 Customer Conclusion

- Customer API service mapping fields match current `state/payment/invoice` response contracts.
- User scope and merchant scope protections exist on server routes.

## 6. Minimal Welcome Chain Regression Evidence

1. Server end-to-end chain (template + event):
  - `MealQuestServer/test/http.integration.test.ts`
  - test case: `acquisition welcome template supports USER_ENTER_SHOP evaluate/execute`
  - assertion focus:
    - template-derived policy can be draft/submitted/approved/published
    - `USER_ENTER_SHOP` evaluate returns selected actions
    - execute with confirm signal returns executed actions
2. Customer mapping verification:
  - `meal-quest-customer/test/services/api-data-service.test.ts`
  - validates customer `state` request contract usage
3. Query mapping verification:
  - `meal-quest-customer/test/services/api-data-service-customer-center.test.ts`
  - validates `payment/ledger` and `invoice/list` mapping contract

## 7. S010 Delivery Checklist

1. Contract field list frozen: event/API/audit ✅
2. Merchant mapping checklist completed ✅
3. Customer mapping checklist completed (`state/payment/invoice`) ✅
4. At least one Acquisition (Welcome) main chain regression passed ✅
5. Acceptance command evidence:
  - `npm run verify` ✅
  - `cd MealQuestServer && npm test` ✅
  - `cd MealQuestMerchant && npm run lint && npm run typecheck` ✅
  - `cd meal-quest-customer && npm run typecheck && npm test` ✅
