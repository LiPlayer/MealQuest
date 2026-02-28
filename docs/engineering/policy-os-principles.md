# Policy OS Basic Principles (Memory Guide)

## 1. What Policy OS Is

Policy OS is a generalized strategy runtime:

1. Policy logic is declarative (`PolicySpec DSL`)
2. Runtime behavior is plugin-based (`Trigger/Segment/Constraint/Scorer/Action`)
3. Engine main flow is fixed and not business-specific

## 2. Why We Replaced Priority-Only TCA

Single `priority` sorting cannot solve commercial constraints:

1. Budget pacing
2. Inventory hard lock
3. Frequency/fatigue caps
4. Risk and anti-fraud hooks
5. Explainable governance and rollback

Policy OS uses:

1. `lane` for coarse precedence
2. scorer utility for value ranking
3. allocator for global resource-constrained selection
4. overlap policy for conflict handling

## 3. Core Decision Flow

`load active policies -> instantiate candidates -> hard constraints -> score -> allocate -> reserve -> execute -> ledger/audit`

Hard constraints always run before score acceptance.

## 4. Governance Hard Constraints

Backend-enforced constraints:

1. No request, no decision
2. No approval token, no publish
3. No approval token, no execute

Policy lifecycle:

`draft -> submitted -> approved -> published -> expired/rolled_back`

## 5. TCA Positioning

TCA is downgraded to an execution adapter (`TCAExecutionAdapter`), not the policy brain.

## 6. Explainability Contract

Every decision should provide:

1. `reason_codes`
2. `risk_flags`
3. `expected_range`
4. `trace_id`

## 7. Money & Resource Rules

1. Double-account wallet (`principal`, `bonus`)
2. Clawback on refund (bonus first, principal fallback)
3. Resource plugins support `check/reserve/release`
4. TTL and rollback are first-class operations

## 8. How to Add New Strategy

1. Add new PolicySpec draft JSON
2. Submit -> approve -> publish
3. No engine core change required

Only add plugin when introducing new action/trigger/constraint/scorer/segment types.
