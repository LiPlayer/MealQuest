# PKG-S030-MER-01 验收记录（老板端入店运营与顾客状态可见）

## 任务信息

- PackageID: `PKG-S030-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C11, MER-C03`
- 目标: 老板端具备入店码运营能力，并在看板看到顾客入店状态与支付链路摘要。

## 能力覆盖

1. 入店二维码运营
- 页面: `MealQuestMerchant/src/screens/EntryQrScreen.tsx`
- 能力: 生成/展示门店二维码，支持保存与分享，满足线下引流入店。

2. 顾客状态可见
- 页面: `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- 能力: 看板展示总顾客、今日新增、今日入店和账务追溯摘要。

3. 顾客入店只读视图
- 页面: `MealQuestMerchant/src/screens/AgentScreen.tsx`
- 能力: 在 AI 协作页同步展示顾客入店关键读数，支持老板快速决策。

## 验证结果

1. `cd MealQuestMerchant && npm run lint` 通过。
2. `cd MealQuestMerchant && npm run typecheck` 通过。
3. 关键数据来自服务端看板接口，和顾客端扫码入店链路保持一致。
