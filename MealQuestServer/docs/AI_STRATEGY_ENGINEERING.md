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

## Runtime Controls

| Variable | Default | Purpose |
| --- | --- | --- |
| `MQ_AI_MAX_RETRIES` | `2` | Retry attempts handled by LangChain/OpenAI client |

## Operational Expectations

1. AI outages return explicit `AI_UNAVAILABLE` with reason.
2. Business APIs stay functional even when AI is degraded.
3. Approval and risk control remain deterministic and are not delegated to model output.

## Recommended Rollout

1. Start with conservative retry settings (`MQ_AI_MAX_RETRIES=2`).
2. Monitor upstream latency/error rate and proposal conversion rate.
3. Tune retry count only when upstream reliability characteristics are stable.
