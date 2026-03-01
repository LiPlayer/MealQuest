# AI Strategy Engineering Notes

This document describes the production-grade architecture used by `createAiStrategyService`.

## Architecture Layers

1. Workflow Orchestration (`src/services/aiStrategyService.js`)
   - Deterministic pipeline:
     - stream assistant output
     - parse proposal envelope
     - evaluate/rank
     - approval/publish gating
     - post-publish monitor/memory update
   - Business guardrails remain in merchant service (`proposal review`, `risk blocking`, `policy lifecycle`).

2. Model Gateway (`src/services/aiStrategy/langchainModelGateway.js`)
   - Uses LangChain v1 official `createAgent` runtime as the primary entrypoint.
   - Model backend uses `@langchain/openai` `ChatOpenAI` for OpenAI/DeepSeek providers.
   - Structured output uses `responseFormat` strategies:
     - `openai`: `providerStrategy(...)`
     - `deepseek`: `toolStrategy(...)`
   - Streaming uses `agent.streamEvents(..., { version: "v2" })` and emits normalized `start/token/end`.

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
