# PKG-S090-CUS-01 验收记录（顾客稳定性模块）

## 任务信息

- PackageID: `PKG-S090-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C07`
- 目标: 在顾客账户页主展示稳定性状态，并在接口异常时实现非阻断降级。

## 交付内容

1. 账户页稳定性模块
- 在账户页新增“服务稳定性”卡片。
- 展示稳定性等级（稳定/需留意/服务波动）、摘要文案、评估时间、关键原因。

2. 接口接入
- 通过顾客侧数据服务接入 `GET /api/state/customer-stability`。
- 保持现有会话机制与鉴权流程。

3. 降级策略
- 稳定性接口失败时仅该模块降级，显示“稳定性暂不可用，可稍后刷新”。
- 降级不影响账户页账票、提醒、反馈、隐私等其他模块。

## 关键实现位置

- `meal-quest-customer/src/pages/account/index.tsx`
- `meal-quest-customer/src/services/DataService.ts`
- `meal-quest-customer/src/services/apiDataService/index.ts`
- `meal-quest-customer/src/services/customerApp/stabilityService.ts`
- `meal-quest-customer/test/pages/account.test.tsx`
- `meal-quest-customer/test/services/data-service.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- --runInBand test/pages/account.test.tsx`
3. `cd meal-quest-customer && npm test -- --runInBand test/services/data-service.test.ts`

手工检查：
- 账户页可见“服务稳定性”模块且文案可理解；
- 稳定性为“服务波动”时可看到风险提示原因；
- 稳定性接口异常时仅该模块降级，其余模块正常；
- 页面刷新后稳定性信息可更新。
