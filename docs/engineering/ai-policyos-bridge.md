# AI <-> Policy OS Bridge (Commercial Final)

## 1. Unified Lifecycle

All AI proposals must pass the same Policy OS lifecycle:

1. `DRAFT` (created from AI candidate)
2. `EVALUATE` (no side effects)
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

1. `POST /api/merchant/strategy-chat/proposals/:id/evaluate`
2. `POST /api/merchant/strategy-chat/proposals/:id/review`
3. `POST /api/merchant/strategy-chat/proposals/:id/publish`

Policy runtime workflow:

1. `POST /api/policyos/decision/evaluate` (dry-run)
2. `POST /api/policyos/decision/execute` (real execution)

`/api/policyos/decision/execute` is the only execute entry.

## 4. Governance Model

1. `JWT` handles identity/tenant/role.
2. Draft approval persists `approvalId` server-side.
3. Publish requires matching `approvalId` (`merchantId + draftId + ttl + unused`).
4. Execute requires explicit backend confirmation (`confirmed=true` or `x-execute-confirmed: true`), otherwise request is rejected.

## 5. Runtime Semantics

`evaluate`:

1. runs trigger/segment/constraint/score/allocation
2. returns selected/rejected/reason/risk/projection
3. does not reserve resources, does not execute actions, does not write ledger side effects

`execute`:

1. runs full pipeline including reserve/execute/release
2. writes ledger and resource states
3. records auditable decision trace

## 6. Merchant UI Contract

1. Multi-candidate proposals are auto-evaluated and ranked server-side before review.
2. Pending proposal must run evaluate before approve (backend hard check).
3. Approved proposals move to "ready-to-publish" queue.
4. Publish is explicit user action.
5. No auto execute on approve.

## 7. SaaS Template Governance

1. Merchants cannot edit template catalog.
2. Template DSL is managed by platform engineering/ops only.
3. Release pipeline blocks invalid templates (`npm run policyos:validate-templates`).

## 8. Controlled Agent Loop (Draft -> Critic -> Revise)

1. LLM first drafts proposal candidates from natural language.
2. When candidate quality is weak (e.g. low confidence or multi-candidate ambiguity), a critic round is triggered.
3. Critic returns structured issues, then revise rewrites candidates once (bounded max rounds).
4. Revised output still must pass Policy OS validation/evaluate/approval/publish.
5. LLM has no direct execution authority.
6. Illegal `policyPatch` fields are validated and rejected before proposal enters review; agent revise loop must fix violations.

## 9. Current LangGraph Backbone (Implemented)

Unary chat path (`generateStrategyChatTurn`) now runs explicit nodes:

1. `prepare_input`
2. `intent_parse`
3. `build_prompt`
4. `remote_decide`
5. `parse_response`
6. `candidate_generate`
7. `patch_validate`
8. `finalize_turn`
9. `critic_gate`
10. `critic_node`
11. `revise_node` (bounded loop)
12. `critic_finalize`
13. `simulate_candidates` (Policy OS tool injection)
14. `rank_candidates`
15. `explain_pack`
16. `approval_gate`
17. `publish_policy`
18. `publish_finalize`
19. `post_publish_monitor`
20. `memory_update`

`generateStrategyChatTurn` now uses this graph as the single unary pipeline.

Roadmap tracking: `docs/engineering/langgraph-agent-todo.md`
