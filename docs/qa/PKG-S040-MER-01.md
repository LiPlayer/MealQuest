# PKG-S040-MER-01 验收记录（老板端数据与模型可见口径）

## 任务信息

- PackageID: `PKG-S040-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C03, MER-C04`
- 目标: 在老板端看板与 Agent 页面展示统一的数据与模型口径，支撑策略解释一致性。

## 交付内容

1. 商家端口径接口接入
- 接入 `GET /api/state/contract?merchantId=...`
- 接入 `GET /api/state/model-contract?merchantId=...`
- 将响应映射为统一 `contractVisibility` 状态（版本、目标指标、公式、覆盖摘要、错误状态）

2. Dashboard 口径展示
- 新增“数据与模型口径”卡片，展示：
  - 数据/模型口径版本
  - 目标指标与窗口
  - 核心公式
  - 数据域、事件、模型信号摘要
- 支持“刷新口径”操作

3. Agent 口径快照
- 在 AI 协作页展示口径快照条，显示同源版本与目标指标
- 支持刷新口径，保证与 Dashboard 一致

4. 降级策略
- 口径接口失败时显示“口径数据暂不可用”
- 失败不阻断 Dashboard 指标浏览和 Agent 聊天流程

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/context/MerchantContext.tsx`
- `MealQuestMerchant/src/domain/merchantEngine.ts`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- `MealQuestMerchant/src/screens/AgentScreen.tsx`

## 回归验证

1. `cd MealQuestMerchant && npm run lint`
2. `cd MealQuestMerchant && npm run typecheck`
3. `cd MealQuestMerchant && npm run test:contract:baseline`

手工检查：
- 登录后 Dashboard 与 Agent 同时可见口径信息；
- 手动刷新可更新口径；
- 服务异常时提示降级但主流程可用。
