# PKG-S030-CUS-01 验收记录（顾客端基础功能闭环）

## 任务信息

- PackageID: `PKG-S030-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C01, CUS-C02, CUS-C04, CUS-C05`
- 目标: 小程序完成扫码入店、资产查看、支付核销、账票查询闭环。

## 闭环路径

1. 扫码入店
- 页面: `meal-quest-customer/src/pages/startup/index.tsx`
- 能力: 解析扫码参数、校验门店可用性、入店后跳转首页。

2. 资产首页
- 页面: `meal-quest-customer/src/pages/index/index.tsx`
- 能力: 展示钱包/权益/活动，并支持进入支付与账户中心。

3. 支付核销
- 页面: `meal-quest-customer/src/pages/index/index.tsx`
- 服务: `meal-quest-customer/src/services/customerApp/checkoutService.ts`
- 能力: 发起支付并展示支付结果反馈。

4. 账票查询
- 页面: `meal-quest-customer/src/pages/account/index.tsx`
- 服务: `meal-quest-customer/src/services/customerApp/billingService.ts`
- 能力: 查询支付流水与电子发票，支持账号注销入口。

## 回归验证

1. `cd meal-quest-customer && npm run test:regression:ui` 通过。
2. 覆盖用例：`test/pages/startup.test.tsx`、`test/pages/index.test.tsx`、`test/pages/account.test.tsx`。
