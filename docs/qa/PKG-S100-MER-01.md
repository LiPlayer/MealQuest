# PKG-S100-MER-01 验收记录（老板端策略激活与自动执行回放）

## 任务信息

- PackageID: `PKG-S100-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C09`
- 目标: 建立老板端策略激活与自动执行回放闭环，不向老板暴露原子事件开关。

## 交付内容

1. 策略激活与回放入口收敛
- 删除老板端自动化配置独立页面与入口。
- 高级工具入口保留审批、回放、风控、提醒、完整看板等能力，不再提供自动化开关入口。
- 老板通过生命周期策略激活与策略启停管理生效范围，通过回放观察自动执行结果。

2. 执行回放模块
- 复用执行回放能力承接自动执行结果观测。
- 支持按事件与结果筛选并刷新查看。
- 展示命中/阻断/未命中摘要、原因码、时间与链路标识。

3. 角色与降级策略
- `OWNER` 可管理策略激活与启停，`MANAGER` 只读查看。
- 非授权角色仅显示权限受限提示，不发起受限请求。
- 回放接口异常时，仅对应模块降级，不影响其他老板端主路径。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/app/(tabs)/_layout.tsx`
- `MealQuestMerchant/src/screens/ToolsHubScreen.tsx`
- `MealQuestMerchant/src/screens/HomeScreen.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`

手工检查：
- 高级工具不再出现“自动化运营”入口；
- 老板通过策略激活与回放理解自动执行结果，无需配置事件开关；
- 执行回放可按事件/结果筛选，并展示原因码与发生时间；
- 接口异常时仅回放模块降级，不影响其他 Tab 能力。
