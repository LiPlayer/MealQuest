# PKG-S020-MER-02 验收记录（老板端入店二维码管理）

## 任务信息

- PackageID: `PKG-S020-MER-02`
- Lane: `merchant`
- CapabilityID: `MER-C11`
- 目标: 老板端可生成、展示、保存、分享门店入店二维码，支撑顾客扫码入店。

## 能力覆盖

1. 入店二维码页面
- 页面: `MealQuestMerchant/src/screens/EntryQrScreen.tsx`
- 能力: 使用 `merchantId` 生成门店二维码并展示门店信息。

2. 入店码分发
- 服务: `MealQuestMerchant/src/services/entryQrService.ts`
- 能力: 支持二维码图片保存到相册、分享给顾客或门店物料渠道。

3. 导航连通
- 入口: `MealQuestMerchant/src/screens/DashboardScreen.tsx`（`门店 Entry QR`）
- 能力: 老板可从看板直接进入二维码管理页。

## 验证结果

1. `cd MealQuestMerchant && npm run lint` 通过。
2. `cd MealQuestMerchant && npm run typecheck` 通过。
3. 二维码页面路由守卫与会话守卫已生效，未登录时会重定向到登录/开店流程。
