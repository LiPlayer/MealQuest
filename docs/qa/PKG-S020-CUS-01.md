# PKG-S020-CUS-01 验收记录（顾客侧入店兼容验证）

## 任务信息

- PackageID: `PKG-S020-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C01`
- 目标: 顾客端兼容老板端入店码能力，扫码后可完成门店识别、可用性校验与入店跳转。

## 兼容路径

1. 启动页解析入店参数
- 页面: `meal-quest-customer/src/pages/startup/index.tsx`
- 能力: 解析 `merchantId/storeId/scene`，执行门店可用性校验。

2. 门店可用性校验
- 服务: `meal-quest-customer/src/services/customerApp/stateService.ts`
- 能力: 调用 `/api/merchant/exists` 判断入店码有效性。

3. 入店后跳转首页
- 页面: `meal-quest-customer/src/pages/startup/index.tsx`
- 能力: 校验通过后缓存门店并 `reLaunch` 到首页，进入顾客主链路。

## 回归验证

1. `cd meal-quest-customer && npm run test:regression:ui` 通过。
2. `test/pages/startup.test.tsx` 覆盖扫码成功、扫码失败、无效门店提示等关键兼容场景。
