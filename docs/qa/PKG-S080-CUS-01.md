# PKG-S080-CUS-01 验收记录（顾客端体验完整性增强）

## 任务信息

- PackageID: `PKG-S080-CUS-01`
- Lane: `customer`
- CapabilityID: `CUS-C02, CUS-C07, CUS-C09, CUS-C11`
- 目标: 完成账户页内反馈提单与进展跟踪、消息分类一致性与隐私注销说明增强。

## 交付内容

1. 反馈提交与进展跟踪
- 账户页新增“问题反馈”区（内嵌式入口）。
- 支持文本提单：分类、标题、描述、联系方式。
- 接入反馈工单查询与详情时间线。
- 顾客可查看工单状态与处理进展（待处理/处理中/已解决/已关闭）。

2. 消息分类一致性
- 顾客端通知分类扩展支持 `FEEDBACK_TICKET`。
- 账户页消息摘要新增“反馈进展”未读计数展示。

3. 隐私与注销流程增强
- 账户页新增“隐私与账号管理”说明卡片。
- 明确注销影响：非交易数据删除，交易账票按法规保留。
- 注销失败时给出可理解错误提示，保留二次确认机制。

4. 顾客端 API 与数据合同扩展
- 新增反馈工单数据类型与服务封装。
- 新增 `DataService/ApiDataService` 反馈能力：
  - `createFeedbackTicket`
  - `getFeedbackTickets`
  - `getFeedbackTicketDetail`

## 关键实现位置

- `meal-quest-customer/src/services/dataTypes.ts`
- `meal-quest-customer/src/services/customerApp/feedbackService.ts`
- `meal-quest-customer/src/services/customerApp/notificationService.ts`
- `meal-quest-customer/src/services/apiDataService/index.ts`
- `meal-quest-customer/src/services/DataService.ts`
- `meal-quest-customer/src/pages/account/index.tsx`
- `meal-quest-customer/src/pages/account/index.scss`
- `meal-quest-customer/test/pages/account.test.tsx`
- `meal-quest-customer/test/services/api-data-service-customer-center.test.ts`
- `meal-quest-customer/test/services/data-service.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd meal-quest-customer && npm run typecheck`
2. `cd meal-quest-customer && npm test -- --runInBand test/services/data-service.test.ts test/services/api-data-service-customer-center.test.ts`
3. `cd meal-quest-customer && npm test -- --runInBand test/pages/account.test.tsx`

手工检查：
- 顾客可在账户页提交文本反馈，提交后可看到记录。
- 顾客可展开工单查看状态时间线。
- 反馈或通知接口异常时仅对应模块降级，不阻断账票与资产区域。
- 账户页可见隐私与注销说明，注销失败提示可理解。
