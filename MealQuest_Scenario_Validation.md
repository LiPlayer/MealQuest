# MealQuest 场景推演与反推验证 (2026-02-21)

> 基准文档：`MealQuest_Spec.md`
> 验证目标：从“用户/商户”双角色推演，反查文档与代码是否闭环。

---

## 1. 用户角色推演

## 1.1 场景 U1：新客扫码首进

1. 顾客扫码进入 `startup`。
2. 系统绑定门店并跳转首页。
3. 首页展示门店专属资产卡，不展示平台化门店列表。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 第 2.1、3.3 节已定义。
2. 代码：`meal-quest-customer/src/pages/startup/index.tsx`。
3. 测试：`meal-quest-customer/test/pages/startup.test.tsx`。

结论：满足。

## 1.2 场景 U2：顾客支付抵扣

1. 顾客账单 52 元。
2. 系统优先用临期券，再扣赠送金、本金、碎银。
3. 生成外部支付差额与支付单号。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 第 3.2 节。
2. 代码：
   - `meal-quest-customer/src/domain/smartCheckout.ts`
   - `meal-quest-customer/src/services/MockDataService.ts`
   - `meal-quest-customer/src/pages/index/index.tsx`
3. 测试：
   - `meal-quest-customer/test/domain/smart-checkout.test.ts`
   - `meal-quest-customer/test/services/mock-data-service.test.ts`

结论：满足。

## 1.3 场景 U3：支付后资产沉淀

1. 支付后卡片数据同步下降。
2. 被使用的券状态更新为 `USED`。
3. 首页可看到最新资产状态。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 第 4 节、7 节。
2. 代码：`meal-quest-customer/src/services/MockDataService.ts` `executeCheckout`。
3. 测试：`meal-quest-customer/test/services/mock-data-service.test.ts`。

结论：满足。

---

## 2. 商户角色推演

## 2.1 场景 M1：老板确认 AI 提案

1. 老板在决策收件箱看到 `PENDING` 提案。
2. 点击确认后提案转为 `APPROVED`，并激活活动策略。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 第 2.2、4.1 节。
2. 代码：`MealQuestMerchant/src/domain/merchantEngine.ts` `approveProposal`。
3. 测试：`MealQuestMerchant/__tests__/merchant-engine.test.ts`。

结论：满足。

## 2.2 场景 M2：熔断阻断策略

1. 老板开启熔断开关。
2. 后续天气触发事件应被阻断。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 第 2.4、4.2 节。
2. 代码：`MealQuestMerchant/src/domain/merchantEngine.ts` `toggleKillSwitch/triggerCampaigns`。
3. 测试：`MealQuestMerchant/__tests__/merchant-engine.test.ts`。

结论：满足。

## 2.3 场景 M3：店员解释核销

1. 店员执行智能核销。
2. 系统给出券/赠送金/本金/外部支付拆分。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 第 2.3、4.3 节。
2. 代码：`MealQuestMerchant/src/domain/merchantEngine.ts` `smartCashierVerify`。
3. 测试：`MealQuestMerchant/__tests__/merchant-engine.test.ts`。

结论：满足。

---

## 3. 服务端场景推演

## 3.1 场景 S1：支付与退款回溯

1. 用户完成支付，写入支付流水。
2. 发起退款，优先回收赠送金，不足回收本金。

反推：
1. 文档：`MealQuest_Server_Spec.md` 第 4.1、4.2 节。
2. 代码：
   - `MealQuestServer/src/core/smartCheckout.js`
   - `MealQuestServer/src/core/clawback.js`
   - `MealQuestServer/src/services/paymentService.js`
3. 测试：
   - `MealQuestServer/test/smartCheckout.test.js`
   - `MealQuestServer/test/clawback.test.js`
   - `MealQuestServer/test/http.integration.test.js`

结论：满足。

## 3.2 场景 S2：提案确认后触发执行

1. 商户确认提案。
2. 触发天气事件后执行新增策略。

反推：
1. 文档：`MealQuest_Server_Spec.md` 第 5、9 节。
2. 代码：
   - `MealQuestServer/src/services/merchantService.js`
   - `MealQuestServer/src/core/tcaEngine.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`。

结论：满足。

## 3.3 场景 S3：熔断保护

1. 商户开启熔断。
2. TCA 触发返回阻断，不执行动作。

反推：
1. 文档：`MealQuest_Server_Spec.md` 第 4.3、6 节。
2. 代码：`MealQuestServer/src/core/tcaEngine.js`。
3. 测试：`MealQuestServer/test/tcaEngine.test.js`。

结论：满足。

---

## 4. 差距与后续建议（当前仍未覆盖）

1. 真实支付渠道接入（当前为模拟支付）。
2. 多租户持久化数据库（当前内存仓储）。
3. 实时 WebSocket 推送（当前 HTTP 触发演练）。
4. 更细颗粒度 RBAC（Owner/Manager/Clerk）。

这些为“工程深化项”，不影响当前“规范闭环可运行验证”结论。
