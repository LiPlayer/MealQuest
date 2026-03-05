# PKG-S030-SRV-01 验收记录（顾客状态/支付/账票基础能力）

## 任务信息

- PackageID: `PKG-S030-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C02, SRV-C03, SRV-C04`
- 目标: 服务端建立顾客状态读取、支付核销、账票查询基础能力，并保证作用域隔离。

## 能力覆盖

1. 顾客状态快照
- 路径: `GET /api/state?merchantId=...&userId=...`
- 能力: 返回顾客资产、活动、策略结果及门店上下文快照。

2. 支付核销主链路
- 路径: `POST /api/payment/quote`
- 路径: `POST /api/payment/verify`
- 能力: 支持支付报价、核销确认、可选返回支付后 `state` 快照。

3. 支付流水与发票
- 路径: `GET /api/payment/ledger`
- 路径: `GET /api/invoice/list`
- 能力: 顾客可在本门店作用域下读取支付流水与发票数据。

## 关键实现位置

- `MealQuestServer/src/http/routes/systemRoutes.ts`
- `MealQuestServer/src/http/routes/paymentRoutes.ts`
- `MealQuestServer/src/http/routes/invoiceRoutes.ts`
- `MealQuestServer/src/services/paymentService.ts`
- `MealQuestServer/src/services/invoiceService.ts`

## 回归验证

1. `payment verify supports includeState payload for post-payment refresh`
2. `customer can query own payment ledger and invoices with strict scope`

以上场景由 `MealQuestServer/test/http.integration.test.ts` 覆盖并通过。
