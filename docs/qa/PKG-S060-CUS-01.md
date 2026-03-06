# PKG-S060-CUS-01 验收记录（顾客端五阶段触达连续体验）

## 任务信息

- PackageID: `PKG-S060-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C06, CUS-C08`
- 目标: 建立顾客端五阶段触达连续体验与小游戏联动反馈，确保首页、账户页、启动页口径一致。

## 交付内容

1. 生命周期五阶段连续可见
- 首页新增“生命周期进度”区，展示获客/激活/活跃/扩收/留存五阶段状态与解释。
- 账户页新增“生命周期阶段记录”区，展示五阶段触达结果并保留原因码。
- 兼容历史标签映射（如 `PLAY` -> 活跃），保证服务端旧标签可正确落到五阶段。

2. 小游戏联动反馈可见
- 首页新增“小游戏联动反馈”区，展示可收集奖励、已解锁互动、最近互动统计。
- 账户页新增小游戏反馈区，展示最近互动项与奖励说明。
- 当无小游戏数据时，展示可理解的空态文案。

3. 启动页入口提示收口
- 启动页文案补齐生命周期触达与小游戏反馈提示，保持跨页面语义一致。

4. 降级与主链路保护
- 触达/小游戏数据缺失时仅降级对应展示区，不阻断支付、账票、注销等主链路。

## 关键实现位置

- `meal-quest-customer/src/services/dataTypes.ts`
- `meal-quest-customer/src/services/customerApp/mappers.ts`
- `meal-quest-customer/src/pages/index/index.tsx`
- `meal-quest-customer/src/pages/index/index.scss`
- `meal-quest-customer/src/pages/account/index.tsx`
- `meal-quest-customer/src/pages/account/index.scss`
- `meal-quest-customer/src/pages/startup/index.tsx`
- `meal-quest-customer/test/services/api-data-service.test.ts`
- `meal-quest-customer/test/pages/index.test.tsx`
- `meal-quest-customer/test/pages/account.test.tsx`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- --runInBand test/services/api-data-service.test.ts`
3. `cd meal-quest-customer && npm test -- --runInBand test/pages/index.test.tsx test/pages/account.test.tsx`
4. `cd meal-quest-customer && npm run test:contract:baseline`

手工检查：
- 首页可见五阶段进度与小游戏联动反馈，且文案可理解。
- 账户页可见生命周期阶段记录与小游戏反馈，原因码仅在有值时展示。
- 启动页提示进入后可查看生命周期触达和小游戏反馈。
- 异常场景仅局部降级，不影响支付、账票与注销。
