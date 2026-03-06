# PKG-S070-MER-01 验收记录（老板端 AI 提案决策）

## 任务信息

- PackageID: `PKG-S070-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C04, MER-C05`
- 目标: 完成老板端 AI 对话、提案同意/驳回闭环，打通 S070 服务端提案能力。

## 交付内容

1. Agent 页新增提案决策区
- 新增提案列表、状态筛选、详情查看与刷新能力。
- 支持从“当前意图/最近一次对话”生成提案。

2. 提案接口接入
- 生成提案：`POST /api/agent-os/proposals/generate`
- 提案列表：`GET /api/agent-os/proposals`
- 提案详情：`GET /api/agent-os/proposals/{proposalId}`
- 提案评估：`POST /api/agent-os/proposals/{proposalId}/evaluate`
- 提案决策：`POST /api/agent-os/proposals/{proposalId}/decide`

3. 决策闭环
- `OWNER` 支持“同意并发布（APPROVE）”和“驳回（REJECT）”。
- 驳回要求填写原因并在详情中回显。
- `MANAGER` 仅可评估和查看，不能执行同意/驳回。

4. 可解释与提示
- 提案详情展示评估时间、原因码、风险标记。
- 接口异常时在提案区内提示，不阻断 AI 对话区。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/AgentScreen.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`

手工检查：
- OWNER 可完成提案生成 -> 评估 -> 同意发布/驳回全流程；
- MANAGER 可生成和评估，但无同意/驳回操作入口；
- 提案接口报错时仅提案区提示错误，不影响 AI 流式对话发送；
- 驳回提案必须填写原因，并在提案详情中可见。
