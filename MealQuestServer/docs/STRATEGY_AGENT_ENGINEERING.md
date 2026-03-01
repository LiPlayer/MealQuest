# Strategy Agent Engineering Notes

This document describes the production setup for `createStrategyAgentService`.

## Source Layout

All agent runtime code is under `src/services/strategyAgent/`:

1. `index.js`
   - Service facade (`streamStrategyChatTurn`, `getRuntimeInfo`)
   - Business normalization and guardrail integration
2. `stateGraph.js`
   - LangGraph `StateGraph` definition for deterministic pipeline execution
3. `schemas.js`
   - Zod schemas for strict structured output (`decision`, `critic`, `revise`)
4. `prompts.js`
   - Message builders for chat/decision/critic/revise stages
5. `constants.js`
   - Provider defaults, protocol versions, and runtime constants
6. `langchainModelFactory.js`
   - Provider normalization and chat model instantiation
7. `langchainAgentRuntime.js`
   - LangChain `createAgent` invoke/stream wrapper
8. `langchainModelGateway.js`
   - Stable service-facing gateway around LangChain runtime

## Pipeline Contract

1. Stream plain assistant text tokens.
2. Resolve strict structured decision (`CHAT` or `PROPOSAL`) using Zod schema.
3. Execute LangGraph pipeline:
   - `critic_revise`
   - `rank_evaluate`
   - `approval_publish`
   - `post_publish`
4. Return final turn with protocol metadata, explain pack, and publish/monitor/memory result blocks.

## Runtime Controls

| Variable | Default | Purpose |
| --- | --- | --- |
| `MQ_AI_PROVIDER` | `deepseek` | Provider binding (`deepseek` / `zhipuai` / `openai`) |
| `DEEPSEEK_API_KEY` | - | Required when provider is `deepseek` |
| `ZHIPUAI_API_KEY` | - | Required when provider is `zhipuai` |
| `OPENAI_API_KEY` | - | Required when provider is `openai` |

## Operational Guarantees

1. AI outage path returns explicit `AI_UNAVAILABLE` style fallback behavior.
2. Approval/publish remains deterministic and server-enforced.
3. Model output is never trusted directly without schema validation and policy normalization.
