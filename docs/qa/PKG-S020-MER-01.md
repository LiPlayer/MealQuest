# PKG-S020-MER-01 验收记录（老板端登录/开店/看板闭环）

## 任务信息

- PackageID: `PKG-S020-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C01, MER-C02, MER-C03`
- 目标: 老板端具备登录、开店、看板三段闭环，并在会话恢复后自动拉取经营看板。

## 闭环路径

1. 登录入口
- 路由: `MealQuestMerchant/app/login.tsx`
- 页面: `MealQuestMerchant/src/screens/LoginScreen.tsx`
- 能力: 手机号请求验证码、验证码登录，登录后进入看板。

2. 首次开店
- 路由: `MealQuestMerchant/app/quick-onboard.tsx`
- 页面: `MealQuestMerchant/src/screens/QuickOnboardScreen.tsx`
- 能力: 未绑定商户时进入开店页，提交门店名完成开店并建立 Owner 会话。

3. 看板落地
- 页面: `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- 能力: 展示门店经营摘要、顾客入店读数与策略摘要。

4. 会话与数据装配
- 上下文: `MealQuestMerchant/src/context/MerchantContext.tsx`
- 能力: 认证态恢复、登录态路由分流、登录后自动刷新 `getMerchantDashboard`。

## 验证结果

1. `cd MealQuestMerchant && npm run lint` 通过。
2. `cd MealQuestMerchant && npm run typecheck` 通过。
3. 登录 -> 开店 -> 看板的路由分流逻辑在 `login.tsx`、`quick-onboard.tsx`、`MerchantContext.tsx` 已闭环。
