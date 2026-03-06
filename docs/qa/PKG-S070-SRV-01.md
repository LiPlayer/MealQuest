# PKG-S070-SRV-01 验收记录（提案可解释与决策支持）

## 任务信息

- PackageID: `PKG-S070-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C05, SRV-C06`
- 目标: 建立服务端 AI 提案生成、可解释评估与同意/驳回决策能力，形成可审计闭环。

## 交付内容

1. 提案 API 基线
- 新增提案生成：`POST /api/agent-os/proposals/generate`
- 新增提案列表：`GET /api/agent-os/proposals`
- 新增提案详情：`GET /api/agent-os/proposals/{proposalId}`
- 新增提案评估：`POST /api/agent-os/proposals/{proposalId}/evaluate`
- 新增提案决策：`POST /api/agent-os/proposals/{proposalId}/decide`

2. 决策与状态流转
- 提案状态覆盖 `PENDING / APPROVED / PUBLISHED / REJECTED`
- 默认同意语义：`APPROVE` 自动执行审批+发布（同意即发布）
- 驳回语义：`REJECT` 写入驳回状态与驳回原因

3. 可解释评估
- 评估结果回填提案工作流，包含命中/拦截统计、决策 ID、评估时间
- 提案详情支持读取 explain 相关摘要（原因码、风险标记、期望区间）

4. 数据与审计
- 提案数据收敛到 `policyOs.proposalsByMerchant`，不恢复 legacy 提案表
- 新增审计动作：
  - `AGENT_PROPOSAL_GENERATE`
  - `AGENT_PROPOSAL_EVALUATE`
  - `AGENT_PROPOSAL_DECIDE`
- 保持 legacy 提案路径 `strategy-chat/proposals` 404 不回归

## 关键实现位置

- `MealQuestServer/src/services/merchantService.ts`
- `MealQuestServer/src/http/routes/agentOsRoutes.ts`
- `MealQuestServer/src/policyos/state.ts`
- `MealQuestServer/src/http/serverHelpers.ts`
- `MealQuestServer/src/core/tenantPolicy.ts`
- `MealQuestServer/test/policy-os.s070.proposal-support.http.test.ts`

## 回归验证

1. `cd MealQuestServer && npm test -- --runInBand test/policy-os.s070.proposal-support.http.test.ts`
2. `cd MealQuestServer && npm test -- --runInBand test/agent-os.stream.integration.test.ts`
3. `cd MealQuestServer && npm test -- --runInBand test/policy-os.s060.lifecycle-library.http.test.ts`
4. `cd MealQuestServer && npm test -- --runInBand test/policy-os.s050.governance.http.test.ts`
5. `npm run verify`

手工检查：
- MANAGER 可生成提案、查看提案并发起评估；OWNER 可执行同意/驳回。
- OWNER 同意后提案进入 `PUBLISHED`，并返回 `policyId`。
- OWNER 驳回后提案进入 `REJECTED`，写入驳回原因。
- 跨商户请求返回 `403 merchant scope denied`。
