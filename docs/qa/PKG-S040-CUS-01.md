# PKG-S040-CUS-01 验收记录（顾客端行为与触达口径）

## 任务信息

- PackageID: `PKG-S040-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C03`
- 目标: 建立顾客端行为与触达口径可见能力，让顾客可理解“命中/未命中”结果与原因。

## 交付内容

1. 首页活动区口径可见化
- 在 `ActivityArea` 中展示用户友好解释文案。
- 若有 `reasonCode`，以低权重形式展示“原因码：xxx”。

2. 账户页口径摘要
- 新增“触达口径摘要”卡片，展示：
  - 长期价值导向说明
  - 行为信号清单（扫码入店、活动触达、支付核销、账票查询）
  - 最近触达结果（阶段、命中状态、解释、可选原因码）

3. 触达解释映射
- 顾客端对常见 `reasonCode` 映射为可理解文案（如 `segment_mismatch` -> 当前条件未满足）。
- 未识别原因码统一降级为“暂未命中当前活动条件”。

4. 降级策略
- 口径数据不可用时显示“口径暂不可用”，不阻断支付、账票、资产等主链路。

## 关键实现位置

- `meal-quest-customer/src/services/customerApp/mappers.ts`
- `meal-quest-customer/src/services/dataTypes.ts`
- `meal-quest-customer/src/components/ActivityArea.tsx`
- `meal-quest-customer/src/pages/account/index.tsx`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- --runInBand test/services/api-data-service.test.ts test/pages/index.test.tsx test/pages/account.test.tsx`

覆盖场景：
- reasonCode 到用户友好解释映射正确；
- 首页活动区显示解释与可选原因码；
- 账户页显示触达口径摘要与最近触达结果。
