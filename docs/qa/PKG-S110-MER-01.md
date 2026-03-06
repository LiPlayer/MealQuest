# PKG-S110-MER-01 验收记录（老板端实验与灰度监控）

## 任务信息

- PackageID: `PKG-S110-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C10`
- 目标: 建立老板端实验配置、灰度监控与回滚闭环，确保老板可控且风险可见。

## 交付内容

1. Risk 主入口实验控制
- 在 Risk 页面新增“实验与灰度监控”模块。
- 接入 `GET /api/policyos/experiments/config`、`PUT /api/policyos/experiments/config`、`GET /api/policyos/experiments/metrics`、`POST /api/policyos/experiments/rollback`。
- `OWNER` 可调整实验开关、流量比例并执行回滚；`MANAGER` 只读。

2. Dashboard 实验摘要
- 在看板新增“实验灰度摘要（S110）”卡片。
- 展示实验状态、流量、核心 uplift、风险状态与最近回滚时间。
- 提供跳转到 Risk 页面入口，形成“可见 -> 可控”闭环。

3. 权限与降级
- `OWNER / MANAGER` 可请求实验读接口；`OWNER` 可写。
- 非授权角色仅提示，不触发受限操作。
- 实验接口异常时仅实验模块降级，不影响看板与风控页其他模块。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/RiskRevenueConfigScreen.tsx`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`

手工检查：
- OWNER 可切换实验开关、设置流量并保存成功；
- OWNER 可执行回滚，状态变更为已回滚，回滚记录可见；
- MANAGER 可查看实验状态/指标/风险，但无保存和回滚可操作入口；
- Dashboard 与 Risk 的实验状态、流量和风险信息一致；
- 实验接口失败时仅实验模块报错，不影响页面其他模块使用。
