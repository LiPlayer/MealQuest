# AI <-> Policy OS Bridge (Commercial Final)

## 1. Unified Lifecycle

All AI proposals must pass the same Policy OS lifecycle:

1. `DRAFT` (created from AI candidate)
2. `SIMULATE` (no side effects)
3. `APPROVE` (owner approval)
4. `PUBLISH` (becomes active policy)
5. `EXECUTE` (runtime event-driven execution)

Key rule: `approve != publish != execute`.

## 2. Two Business Entrances

1. Boss active request: merchant sends explicit demand in strategy chat.
2. AI proactive scan: merchant triggers AI scan from UI, AI proposes based on current signals.

Both entrances converge into the same lifecycle above.

## 3. API Surface

Merchant proposal workflow:

1. `POST /api/merchant/strategy-chat/proposals/:id/simulate`
2. `POST /api/merchant/strategy-chat/proposals/:id/review`
3. `POST /api/merchant/strategy-chat/proposals/:id/publish`

Policy runtime workflow:

1. `POST /api/policyos/decision/simulate` (dry-run)
2. `POST /api/policyos/decision/execute` (real execution)

`/api/policyos/decision/evaluate` is kept as execute alias.

## 4. Governance Model

1. `JWT` handles identity/tenant/role.
2. Draft approval persists `approvalId` server-side.
3. Publish requires matching `approvalId` (`merchantId + draftId + ttl + unused`).
4. Execute does not require per-call approval token; governance is enforced by published policy state and backend constraints.

## 5. Runtime Semantics

`simulate`:

1. runs trigger/segment/constraint/score/allocation
2. returns selected/rejected/reason/risk/projection
3. does not reserve resources, does not execute actions, does not write ledger side effects

`execute`:

1. runs full pipeline including reserve/execute/release
2. writes ledger and resource states
3. records auditable decision trace

## 6. Merchant UI Contract

1. Pending proposal must run simulation before approve.
2. Approved proposals move to "ready-to-publish" queue.
3. Publish is explicit user action.
4. No auto execute on approve.

