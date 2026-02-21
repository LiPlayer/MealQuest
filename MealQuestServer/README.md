# MealQuestServer

基于 `MealQuest_Spec.md` 的服务端最小可运行实现，覆盖以下核心链路：

- 智能抵扣（临期券优先 -> 余额 -> 碎银 -> 外部支付）
- 支付核销与幂等保护
- 退款 Clawback（优先回收赠送金，不足时回收本金）
- TCA 规则触发执行（Trigger/Condition/Action）
- 商户策略提案确认与熔断开关

## 运行

```bash
npm start
```

## 测试

```bash
npm test
```
