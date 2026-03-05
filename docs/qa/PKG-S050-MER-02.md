# PKG-S050-MER-02 验收记录（老板端提醒中心）

## 任务信息

- PackageID: `PKG-S050-MER-02`
- Lane: `merchant`
- CapabilityID: `MER-C12`
- 目标: 建立老板端提醒中心（待办/告警）闭环，支持筛选、分页与已读回执。

## 交付内容

1. 提醒中心入口与页面
- 在老板端底部导航新增“提醒”Tab。
- 新增提醒中心页面，展示未读摘要、筛选条件、提醒列表。

2. 提醒接口接入
- `GET /api/notifications/inbox`
- `GET /api/notifications/unread-summary`
- `POST /api/notifications/read`
- 支持 `status/category` 过滤与 `cursor` 分页加载。

3. 提醒操作闭环
- 支持单条“标记已读”。
- 支持“全部已读”批量回执。
- 已读后同步刷新未读汇总与列表状态。

4. 降级与可用性
- 接口异常时展示错误信息并支持手动刷新。
- 异常不阻断审批、回放、风控页使用。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/screens/NotificationsScreen.tsx`
- `MealQuestMerchant/app/(tabs)/notifications.tsx`
- `MealQuestMerchant/app/(tabs)/_layout.tsx`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`
3. `cd MealQuestMerchant && npm run test:contract:baseline`

手工检查：
- 提醒 Tab 可进入并展示未读摘要；
- 筛选条件切换后列表正确；
- 单条已读与全部已读可生效；
- 有更多数据时可“加载更多”；
- 接口失败时可见错误提示且可刷新恢复。
