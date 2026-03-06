# PKG-S100-MER-01 验收记录（老板端自动化配置与日志）

## 任务信息

- PackageID: `PKG-S100-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C09`
- 目标: 建立老板端自动化配置与执行日志闭环，支持规则启停、结果追踪与权限分级。

## 交付内容

1. 自动化配置模块
- 新增老板端自动化页面。
- 接入 `GET /api/policyos/automation/config` 与 `PUT /api/policyos/automation/config`。
- 展示全局自动化状态、事件规则状态、更新时间与更新人。
- `OWNER` 可修改全局开关与规则开关，`MANAGER` 只读。

2. 执行日志模块
- 接入 `GET /api/policyos/automation/executions`。
- 支持 `event`、`outcome` 筛选与刷新。
- 展示命中/阻断/未命中摘要、原因码、时间与链路标识。

3. 角色与降级策略
- `OWNER / MANAGER` 可见自动化模块并请求接口。
- 非授权角色仅显示权限受限提示，不发起受限请求。
- 配置或日志接口异常时，仅对应模块降级，不影响其他老板端主路径。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/AutomationScreen.tsx`
- `MealQuestMerchant/app/(tabs)/automation.tsx`
- `MealQuestMerchant/app/(tabs)/_layout.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`

手工检查：
- OWNER 可切换全局自动化与规则开关并保存成功；
- MANAGER 可查看配置与日志，但无保存入口；
- 执行日志可按事件/结果筛选，并展示原因码与发生时间；
- 接口异常时仅自动化模块降级，不影响其他 Tab 能力。
