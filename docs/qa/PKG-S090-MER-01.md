# PKG-S090-MER-01 验收记录（老板端 KPI 与 Go/No-Go 面板）

## 任务信息

- PackageID: `PKG-S090-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C10`
- 目标: 在老板端看板内建立长期 KPI 与发布门可见能力，支持 Go/No-Go 判定与原因解释。

## 交付内容

1. 看板发布门模块
- 在 `Dashboard` 新增长期 KPI 与发布门卡片，不新增独立 Tab。
- 接入 `GET /api/state/release-gate`。
- 展示最终发布建议（`GO/NO_GO/NEEDS_REVIEW`）、核心 KPI、四门状态与数据充分性。

2. 角色与交互规则
- `OWNER / MANAGER`：可查看完整发布门明细并支持手动刷新。
- `CLERK`：模块可见但仅显示权限提示，不请求受限接口。

3. 降级策略
- 接口异常时仅发布门模块降级，显示“发布门数据暂不可用”并允许重试。
- 降级不影响看板内其他模块能力。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`
3. `cd MealQuestMerchant && npm run test:contract:baseline`

手工检查：
- OWNER/MANAGER 可见发布门最终建议、核心 KPI、四门状态与样本充分性；
- `NEEDS_REVIEW` 状态下可看到样本不足原因码；
- CLERK 仅看到权限提示，不显示受限明细；
- 发布门接口报错时仅该模块降级，其他看板模块仍可正常使用。
