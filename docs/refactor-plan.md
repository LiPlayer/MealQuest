# MealQuest Policy OS Refactor Plan

## 1) Repo Diagnosis (Current Baseline)

Source of truth: `docs/specs/mealquest-spec.md`

Current marketing/ops execution chain in server:

1. HTTP trigger entry: `MealQuestServer/src/http/routes/merchantRoutes.js` (`POST /api/tca/trigger`)
2. Trigger service: `MealQuestServer/src/services/campaignService.js#triggerEvent`
3. Rule engine core: `MealQuestServer/src/core/tcaEngine.js`
4. Story protocol validation: `MealQuestServer/src/core/storyProtocol.js`
5. Strategy proposal to campaign activation: `MealQuestServer/src/services/merchantService.js#confirmProposal`
6. Tenant controls and audit:
   - Tenant policy gate: `MealQuestServer/src/core/tenantPolicy.js`
   - Audit read/write: `MealQuestServer/src/store/tenantRepository.js` + `/api/audit/logs`
7. Runtime transport:
   - WebSocket hub: `MealQuestServer/src/core/websocketHub.js`
   - Broadcast currently event-based without per-tenant sequence dedupe contract.

Key baseline constraints already present:

1. Kill switch switch-off gate
2. Campaign status and simple TTL (`ttlUntil`)
3. Basic budget cap (`used + costPerHit <= cap`)
4. Audit trail for risky operations

Key gaps for commercial generalized system:

1. Priority-only ordering (no global utility allocation)
2. Engine core tightly coupled with strategy changes
3. Missing plugin abstraction for trigger/constraint/action/scoring
4. Missing policy lifecycle registry (`draft/submitted/approved/published/rollback/expired`)
5. Missing approval token as hard backend execution guard
6. Missing policy-level explainability (`reason_codes/risk_flags/expected_range`)
7. Missing generalized reserve/release model for budget/inventory/frequency
8. Missing unified Policy OS APIs and lifecycle tests

## 2) Target Architecture (Final Shape)

Implemented modules:

1. `MealQuestServer/src/policyos/schemaRegistry.js`
2. `MealQuestServer/src/policyos/policyRegistry.js`
3. `MealQuestServer/src/policyos/pluginRegistry.js`
4. `MealQuestServer/src/policyos/decisionService.js`
5. `MealQuestServer/src/policyos/ledgerService.js`
6. `MealQuestServer/src/policyos/approvalTokenService.js`
7. `MealQuestServer/src/policyos/adapters/tcaExecutionAdapter.js`
8. `MealQuestServer/src/policyos/plugins/defaultPlugins.js`
9. `MealQuestServer/src/policyos/wsDispatcher.js`
10. `MealQuestServer/src/policyos/policyOsService.js`
11. Postgres persistence slot: `MealQuestServer/src/store/postgresDb.js` (`mq_policy_os`)

HTTP surface:

1. `POST /api/policyos/drafts`
2. `POST /api/policyos/drafts/:id/submit`
3. `POST /api/policyos/drafts/:id/approve`
4. `POST /api/policyos/drafts/:id/publish`
5. `GET /api/policyos/drafts`
6. `GET /api/policyos/policies`
7. `POST /api/policyos/policies/:id/rollback`
8. `POST /api/policyos/decision/evaluate`
9. `GET /api/policyos/decisions/:id/explain`
10. `GET /api/policyos/schemas`
11. `GET /api/policyos/plugins`
12. `POST /api/policyos/compliance/retention/run`

`/api/tca/trigger` is now routed to Policy OS decision execution path.

## 3) Migration Path (Phased, Safe Cutover)

### Phase A: Dual-stack foundation (done)

1. Add PolicySpec/Story schema registry and validation.
2. Add policy lifecycle registry and immutable policy versions.
3. Add plugin registry and default plugin set.
4. Add decision pipeline with explain output.
5. Add governance approval token verification on publish/execute.

Verification:

1. `policyOs.schema.test.js`
2. `policyOs.constraints.test.js`
3. `policyOs.ledger.test.js`

Rollback:

1. Disable Policy OS routes.
2. Route `/api/tca/trigger` back to legacy `campaignService.triggerEvent`.

### Phase B: Execution cutover (done)

1. Wire Policy OS service into app server service graph.
2. Add Policy OS route handler.
3. Switch `/api/tca/trigger` to Policy OS `evaluateDecision`.
4. Keep audit and websocket notifications.

Verification:

1. `policyOs.http.integration.test.js`

Rollback:

1. Revert `merchantRoutes.js` `/api/tca/trigger` block to legacy campaign service call.

### Phase C: Governance/retention hardening (done baseline)

1. Add retention job API and script.
2. Add behavior anonymization and transaction retention pruning.
3. Add per-tenant/per-store ws dispatcher sequence + dedupe state.

Verification:

1. Run retention job script with snapshot input and inspect output summary.

Rollback:

1. Retention job is explicit-trigger only; disable endpoint/script.

## 4) Feature Flag & Rollback Guidance

Recommended feature flags:

1. `POLICYOS_HTTP_ENABLED`
2. `POLICYOS_TCA_TRIGGER_ENABLED`
3. `POLICYOS_RETENTION_ENABLED`

Emergency rollback:

1. Turn off `POLICYOS_TCA_TRIGGER_ENABLED` and restore legacy trigger routing.
2. Keep Policy OS registry state intact (no data loss).
3. Continue serving read-only policy APIs for audit/replay.

## 5) Acceptance Mapping (Generalization)

1. Add new policy by DSL only:
   - create new draft spec and publish, no engine core changes.
2. Add new trigger/constraint/action/scorer:
   - register plugin once, no decision flow rewrite.
3. Version/audit/rollback/explain:
   - all present in policy registry + decision explain + audit integration.
4. Strong backend governance:
   - publish and execute require valid approval token.
