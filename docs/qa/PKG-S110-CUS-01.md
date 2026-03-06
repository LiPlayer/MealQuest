# PKG-S110-CUS-01 验收记录（顾客端灰度体验守护）

## 任务信息

- PackageID: `PKG-S110-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C07`
- 目标: 建立顾客端灰度体验守护提示与非阻断降级闭环，确保灰度波动不影响顾客主链路使用。

## 交付内容

1. 首页灰度体验守护提示
- 首页新增“灰度体验守护”模块，展示守护状态、顾客可理解说明与原因提示。
- 复用 `GET /api/state/customer-stability`，不新增顾客侧实验接口。
- 支持手动刷新守护状态。

2. 账户页守护说明补强
- 账户页“服务稳定性”模块升级为“服务稳定性与灰度守护”统一表达。
- 明确提示支付、账票、账户等主链路在守护态下仍可使用。
- 保持既有稳定性原因与驱动项可见性。

3. 降级与边界
- 守护接口异常时仅守护模块降级，提示“守护状态暂不可用，可稍后刷新”。
- 不向顾客暴露实验流量、实验分组、回滚明细等经营敏感信息。
- 守护模块不提供策略开关与回滚操作。

## 关键实现位置

- `meal-quest-customer/src/pages/index/index.tsx`
- `meal-quest-customer/src/pages/account/index.tsx`
- `meal-quest-customer/test/pages/index.test.tsx`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- test/pages/index.test.tsx test/pages/account.test.tsx`

手工检查：
- 首页可见“灰度体验守护”模块，且 `STABLE/WATCH/UNSTABLE` 文案可理解；
- 守护接口失败时仅该模块提示错误，支付按钮与资产内容仍可见；
- 账户页可见“服务稳定性与灰度守护”说明及主链路不受影响提示；
- 顾客端未出现实验流量或回滚等经营敏感字段。
