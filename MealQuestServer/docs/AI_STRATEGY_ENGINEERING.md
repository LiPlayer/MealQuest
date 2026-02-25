# AI Strategy Engineering Notes

This document describes the production-grade architecture used by `createAiStrategyService`.

## Architecture Layers

1. Workflow Orchestration (`src/services/aiStrategyService.js`)
   - LangGraph planner graph: `prepare_input -> remote_decide -> assemble_plan`
   - LangGraph chat graph: `prepare_input -> remote_decide -> finalize_turn`
   - Business guardrails remain in merchant service (`proposal review`, `risk blocking`, `campaign lifecycle`).

2. Model Gateway (`src/services/aiStrategy/langchainModelGateway.js`)
   - Uses LangChain official `@langchain/openai` `ChatOpenAI` client against OpenAI-compatible endpoints.
   - Encapsulates request payload normalization and response extraction.
   - Keeps provider-specific payload extensions isolated (for example BigModel `thinking` control).

3. Resilience Layer (`src/services/aiStrategy/resilience.js`)
   - Exponential backoff retry for transient failures.
   - Circuit breaker for repeated upstream failures to avoid cascading latency.
   - Runtime diagnostics snapshot for operations.

## Runtime Controls

| Variable | Default | Purpose |
| --- | --- | --- |
| `MQ_AI_MAX_CONCURRENCY` | `1` | In-process queue parallelism for upstream inference calls |
| `MQ_AI_MAX_RETRIES` | `2` | Retry attempts for transient upstream errors |
| `MQ_AI_RETRY_BACKOFF_MS` | `180` | Base backoff duration (exponential) |
| `MQ_AI_CIRCUIT_BREAKER_THRESHOLD` | `4` | Consecutive failures before opening circuit |
| `MQ_AI_CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Circuit-open cooldown window |

## Operational Expectations

1. AI outages return explicit `AI_UNAVAILABLE` with reason.
2. Business APIs stay functional even when AI is degraded.
3. Circuit breaker state is visible via `strategy-library` runtime info (`aiRuntime.circuitBreaker`).
4. Approval and risk control remain deterministic and are not delegated to model output.

## Recommended Rollout

1. Start in low concurrency (`MQ_AI_MAX_CONCURRENCY=1`) and default retries.
2. Monitor `circuitBreaker.isOpen`, `queuePending`, and proposal conversion rate.
3. Raise concurrency only after stable upstream latency and error rates are observed.
