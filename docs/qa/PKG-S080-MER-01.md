# PKG-S080-MER-01 验收记录（老板端顾客体验与反馈可见）

## 任务信息

- PackageID: `PKG-S080-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C03, MER-C12`
- 目标: 建立老板端顾客体验健康度与反馈汇总可见能力，支持看板与提醒双入口只读观测。

## 交付内容

1. 看板体验健康度模块
- 看板新增“顾客体验健康度”卡片。
- 接入 `GET /api/state/experience-guard`。
- 展示总体状态、健康分、路径摘要、告警提示与刷新操作。

2. 提醒中心反馈汇总
- 提醒中心摘要新增 `FEEDBACK_TICKET` 未读统计。
- 类别筛选新增 `FEEDBACK_TICKET`。
- 新增反馈汇总只读区，接入 `GET /api/feedback/summary`（7天窗口）。
- 展示工单总数、未解决/已解决、状态分布与最近工单。

3. 角色与降级策略
- `OWNER / MANAGER`：可查询并展示体验健康度与反馈汇总。
- `CLERK`：模块可见但显示权限受限提示，不请求受限接口。
- 体验/反馈接口异常时仅对应模块降级，不阻断提醒列表与已读能力。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- `MealQuestMerchant/src/screens/NotificationsScreen.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`
3. `cd MealQuestMerchant && npm run test:contract:baseline`

手工检查：
- OWNER/MANAGER 在看板可见“顾客体验健康度”模块并可刷新；
- OWNER/MANAGER 在提醒中心可见反馈汇总与 `FEEDBACK_TICKET` 筛选；
- CLERK 可见模块但仅显示权限受限提示；
- 反馈/体验接口异常时，其它提醒能力可继续使用。
