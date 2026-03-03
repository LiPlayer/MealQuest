# Step Manual Checklist Template

Use this template for optional/manual acceptance in `docs/roadmap.md` section `05.5`.

## Global Fields

| Field | Value |
| --- | --- |
| StepID | |
| Date | |
| Executor | AI/Agent |
| Env | dev / staging / prod |
| Related Commit/PR | |

## Required Checklist Items

1. Scenario
2. Expected Result
3. Actual Result
4. Evidence Path (log/screenshot/replay)
5. Conclusion (`pass` / `fail`)

## S010

1. Verify contract field list is consistent across Server/Merchant/Customer.
2. Record one successful integration chain evidence.

## S020

1. Re-run contract baseline tests.
2. Confirm failures can be mapped to concrete modules.

## S110

1. Validate 4 core Welcome scenarios.
2. Confirm reason code and audit trace are present.

## S120

1. Validate approval token and TTL behavior.
2. Confirm kill switch blocks execution.

## S130

1. Validate payment -> ledger -> invoice chain.
2. Confirm `traceId` replay works.

## S210

1. Verify dashboard metric visibility and consistency.
2. Confirm fallback rendering when metric source is missing.

## S220

1. Verify approval queue consistency.
2. Verify replay path contains `approvalId` and `traceId`.

## S310

1. Verify customer critical path under normal network.
2. Verify weak-network recovery consistency.

## S410

1. Run release drill and rollback drill.
2. Verify on-call/alert workflow execution.

## S420

1. Verify tenant isolation checks.
2. Verify cost metrics coverage and threshold alarms.
