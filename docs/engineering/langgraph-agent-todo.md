# LangGraph Agent TODO (Policy OS Bridge)

Status legend:

1. `[x]` implemented
2. `[~]` in progress
3. `[ ]` pending

## 12-Step Agent Backbone

1. `[x]` `IntentParse` node  
   Promoted into explicit LangGraph state node (`intent_parse`) before prompt build.
2. `[x]` `CandidateGenerate` node  
   Added explicit candidate expansion node (`candidate_generate`) in unary graph flow.
3. `[x]` `PatchValidate` tool node  
   Added explicit validation node (`patch_validate`) with normalized/invalid split in graph state.
4. `[x]` `Critic` node  
   Added explicit `critic_gate` + `critic_node` routing in unary graph state.
5. `[x]` `Revise` node  
   Added bounded `revise_node` loop with graph conditional routing and round cap.
6. `[x]` `Evaluate` tool node  
   Added `evaluate_candidates` node with optional Policy OS evaluation tool injection.
7. `[x]` `Rank` node  
   Added `rank_candidates` node using unified value/risk/cost ordering.
8. `[x]` `ExplainPack` node  
   Added `explain_pack` node to attach explain bundle and protocol metadata.
9. `[x]` `HumanApprovalGate` node  
   Added `approval_gate` node with backend approval token/validator checks.
10. `[x]` `Publish` tool node  
    Added `publish_policy` + `publish_finalize` nodes with publish tool wiring.
11. `[x]` `PostPublishMonitor` node  
    Added `post_publish_monitor` node with monitor hook + heuristic fallback recommendations.
12. `[x]` `MemoryUpdate` node  
    Added `memory_update` node with structured facts and optional persistence hook.

## Next Increment

1. Harden monitor/memory hook contracts with schema validation and timeout guardrails.
2. Add richer pause/adjust playbooks driven by observed execution metrics.
3. Keep execution authority in Policy OS tool nodes only.
