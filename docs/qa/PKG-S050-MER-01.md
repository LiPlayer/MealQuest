# PKG-S050-MER-01 验收记录（老板端审批/回放/风险闭环）

## 任务信息

- PackageID: `PKG-S050-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C05, MER-C06, MER-C07, MER-C08`
- 目标: 完成老板端审批中心、执行回放、风险控制闭环，替换原有占位页。

## 交付内容

1. 审批中心页面接入真实治理接口
- 接入 `GET /api/policyos/governance/overview`
- 接入 `GET /api/policyos/governance/approvals`
- 支持按 `ALL / SUBMITTED / APPROVED / PUBLISHED` 过滤审批队列
- `OWNER` 可执行审批与发布动作：
  - `POST /api/policyos/drafts/{draftId}/approve`
  - `POST /api/policyos/drafts/{draftId}/publish`

2. 执行回放页面接入真实回放接口
- 接入 `GET /api/policyos/governance/replays`
- 支持 `mode / outcome / event` 过滤
- 展示 `decisionId`、`traceId`、`reasonCodes`、`createdAt` 等回放字段

3. 风控页补齐紧急停机与策略启停
- 接入 `POST /api/merchant/kill-switch` 实现紧急停机开关
- 接入 `GET /api/policyos/policies?includeInactive=true` 查询策略状态
- 接入策略启停：
  - `POST /api/policyos/policies/{policyId}/pause`
  - `POST /api/policyos/policies/{policyId}/resume`
- 非 OWNER 角色仅可查看，不可执行启停动作

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/ApprovalsScreen.tsx`
- `MealQuestMerchant/src/screens/ReplayScreen.tsx`
- `MealQuestMerchant/src/screens/RiskRevenueConfigScreen.tsx`
- `MealQuestMerchant/app/(tabs)/approvals.tsx`
- `MealQuestMerchant/app/(tabs)/replay.tsx`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`

手工检查：
- 审批页可查看队列并在 OWNER 角色执行审批/发布；
- 回放页可按条件过滤并看到拦截原因码；
- 风控页可执行紧急停机、策略暂停/恢复；
- 接口异常时页面有错误提示且可重试刷新。
