# PKG-S050-CUS-01 验收记录（顾客端执行反馈 / 降级 / 消息接收）

## 任务信息

- PackageID: `PKG-S050-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C04, CUS-C07, CUS-C10`
- 目标: 建立顾客端执行反馈、异常降级与消息接收规则闭环，不阻断支付主链路。

## 交付内容

1. 账户页内消息接收能力
- 在 `account` 页新增“消息提醒”区，展示未读汇总与提醒列表。
- 接入通知接口：
  - `GET /api/notifications/inbox`
  - `GET /api/notifications/unread-summary`
  - `POST /api/notifications/read`

2. 自动已读策略
- 顾客进入账户页后自动执行 `markAll=true` 已读回执。
- 已读后刷新未读统计与列表状态，保持展示一致。

3. 执行反馈与降级
- 保持触达命中/未命中解释与原因码可见（首页活动区 + 账户页触达摘要）。
- 消息接口异常时，仅消息区显示“提醒暂不可用，可稍后刷新”，不影响账票/支付/注销能力。

4. 数据服务容错
- 通知查询与回执失败时，不清空顾客会话 token，避免误伤主流程。

## 关键实现位置

- `meal-quest-customer/src/services/customerApp/notificationService.ts`
- `meal-quest-customer/src/services/apiDataService/index.ts`
- `meal-quest-customer/src/services/DataService.ts`
- `meal-quest-customer/src/pages/account/index.tsx`
- `meal-quest-customer/src/pages/account/index.scss`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- --runInBand test/pages/account.test.tsx`
3. `cd meal-quest-customer && npm test -- --runInBand test/services/api-data-service-customer-center.test.ts`
4. `cd meal-quest-customer && npm run test:contract:baseline`

手工检查：
- 进入账户页可见消息提醒区并显示未读摘要。
- 首次进入账户页后未读提醒被自动回执为已读。
- 消息接口失败时仅消息区降级，支付与账票仍可正常访问。
