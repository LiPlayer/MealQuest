# MealQuest 场景推演与反推验证（2026-02-21）

> 基准文档：`MealQuest_Spec.md`
> 验证目标：从“用户/商户”双角色推演，反查文档与代码是否形成闭环。

---

## 1. 用户角色推演

## 1.1 场景 U1：新客扫码首进

1. 顾客扫码进入 `startup`。
2. 系统绑定门店并跳转首页。
3. 首页展示门店资产卡，不出现平台化门店列表。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 2.1、3.3。
2. 代码：`meal-quest-customer/src/pages/startup/index.tsx`。
3. 测试：`meal-quest-customer/test/pages/startup.test.tsx`。

结论：满足。

## 1.2 场景 U2：顾客支付抵扣

1. 顾客账单 52 元。
2. 系统按“临期券 -> 赠送金 -> 本金 -> 碎银 -> 外部支付”计算。
3. 返回可解释抵扣明细与支付单号。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 3.2。
2. 代码：
   - `meal-quest-customer/src/domain/smartCheckout.ts`
   - `MealQuestServer/src/core/smartCheckout.js`
3. 测试：
   - `meal-quest-customer/test/domain/smart-checkout.test.ts`
   - `MealQuestServer/test/smartCheckout.test.js`
   - `MealQuestServer/test/http.integration.test.js`

结论：满足。

## 1.3 场景 U3：远程联调失败回退

1. 顾客端开启远程模式。
2. API 调用失败后自动回退 Mock，流程不中断。
3. 失效 token 被清空，避免持续使用脏凭证。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 4.3、6.1。
2. 代码：
   - `meal-quest-customer/src/services/DataService.ts`
   - `meal-quest-customer/src/services/ApiDataService.ts`
3. 测试：`meal-quest-customer/test/services/data-service.test.ts`。

结论：满足。

---

## 2. 商户角色推演

## 2.1 场景 M1：老板确认 AI 提案并执行策略

1. 老板看到 `PENDING` 提案。
2. 点击确认后提案变 `APPROVED` 并转为活动策略。
3. 天气触发后策略执行并消耗预算。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 2.2、4.1、4.2。
2. 代码：
   - `MealQuestMerchant/src/domain/merchantEngine.ts`
   - `MealQuestServer/src/services/merchantService.js`
3. 测试：
   - `MealQuestMerchant/__tests__/merchant-engine.test.ts`
   - `MealQuestServer/test/http.integration.test.js`

结论：满足。

## 2.2 场景 M2：店长触发熔断后阻断营销

1. 店长开启 `kill switch`。
2. 后续 TCA 触发返回阻断。
3. 实时事件流收到熔断状态变更。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 2.4、4.2。
2. 代码：
   - `MealQuestMerchant/App.tsx`
   - `MealQuestServer/src/core/tcaEngine.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：
   - `MealQuestMerchant/__tests__/merchant-engine.test.ts`
   - `MealQuestServer/test/tcaEngine.test.js`
   - `MealQuestServer/test/http.integration.test.js`

结论：满足。

## 2.3 场景 M3：店员解释核销与实时排障

1. 店员执行智能核销，看到抵扣分解。
2. 收到实时事件后可按“仅异常”筛选。
3. 点击事件可展开 payload，支持复制详情用于排障。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 2.3、5.1、6.2。
2. 代码：
   - `MealQuestMerchant/App.tsx`
   - `MealQuestMerchant/src/services/realtimeEventViewModel.ts`
3. 测试：
   - `MealQuestMerchant/__tests__/merchant-engine.test.ts`
   - `MealQuestMerchant/__tests__/merchant-realtime-viewmodel.test.ts`
   - `MealQuestMerchant/__tests__/merchant-realtime.test.ts`

结论：满足。

## 2.4 场景 M4：店长查看审计日志追责

1. 店长进入审计日志区查看近期高风险操作。
2. 点击日志项展开 details，支持复制用于工单排查。
3. 点击“加载更多”获取下一页历史记录。

反推：
1. 文档：`MealQuest_Merchant_Spec.md` 2.5、5.1、6.2。
2. 代码：
   - `MealQuestMerchant/App.tsx`
   - `MealQuestMerchant/src/services/merchantApi.ts`
   - `MealQuestMerchant/src/services/auditLogViewModel.ts`
3. 测试：
   - `MealQuestMerchant/__tests__/merchant-audit-viewmodel.test.ts`
   - `MealQuestMerchant/__tests__/App.test.tsx`

结论：满足。

---

## 3. 服务端场景推演

## 3.1 场景 S1：支付 + 退款回溯

1. 支付后写入支付记录与流水。
2. 退款优先回收赠送金，不足回收本金。

反推：
1. 文档：`MealQuest_Server_Spec.md` 4.1、4.2、6。
2. 代码：
   - `MealQuestServer/src/core/clawback.js`
   - `MealQuestServer/src/services/paymentService.js`
3. 测试：
   - `MealQuestServer/test/clawback.test.js`
   - `MealQuestServer/test/http.integration.test.js`

结论：满足。

## 3.2 场景 S2：RBAC 权限边界

1. `CLERK` 不能确认提案。
2. `MANAGER` 可以退款但不能熔断。
3. `OWNER` 拥有完整经营控制权限。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.1.1。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/core/auth.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`。

结论：满足。

## 3.3 场景 S3：实时通道与重启恢复

1. 商户端建立 `/ws` 连接并接收支付事件。
2. 服务重启后，持久化模式仍保留已写状态。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.1.2、7.2。
2. 代码：
   - `MealQuestServer/src/core/websocketHub.js`
   - `MealQuestServer/src/store/persistentDb.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`。

结论：满足。

## 3.4 场景 S4：跨商户隔离（共享库强隔离）

1. 两个商户使用同一 `userId=u_demo`。
2. 在 `m_demo` 完成支付后，`m_bistro` 用户钱包不受影响。
3. `m_bistro` 管理员尝试退款 `m_demo` 的支付单，应被拒绝。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.1、3.3、6、7.2。
2. 代码：
   - `MealQuestServer/src/store/inMemoryDb.js`
   - `MealQuestServer/src/services/paymentService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（tenant isolation 用例）。

结论：满足。

## 3.5 场景 S5：热点商户专库路由

1. 默认商户走默认数据源。
2. `m_bistro` 通过租户路由挂载到专属数据源。
3. 在 `m_bistro` 支付后，支付记录落专库，不落默认库。

反推：
1. 文档：`MealQuest_Server_Spec.md` 7.2、10。
2. 代码：
   - `MealQuestServer/src/core/tenantRouter.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（tenant router 用例）。

结论：满足。

## 3.6 场景 S6：高风险动作审计追溯

1. 顾客完成支付后记录 `PAYMENT_VERIFY/SUCCESS`。
2. 店员越权确认提案被拒绝，记录 `PROPOSAL_CONFIRM/DENIED`。
3. 店长切换熔断，记录 `KILL_SWITCH_SET/SUCCESS`。

反推：
1. 文档：`MealQuest_Server_Spec.md` 6、7.2、10。
2. 代码：
   - `MealQuestServer/src/store/inMemoryDb.js`
   - `MealQuestServer/src/store/tenantRepository.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（audit log 用例）。

结论：满足。

## 3.7 场景 S7：审计日志查询与权限

1. 店长分页查询本商户审计日志。
2. 顾客访问审计日志接口应被拒绝。
3. 商户越权查询其它商户日志应被拒绝。
4. 审计日志支持按 `action/status` 精准筛选。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.1、6、7.2。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/store/tenantRepository.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（audit log endpoint 用例）。

结论：满足。

## 3.8 场景 S8：在线状态查询的商户隔离

1. 商户端查询自身 `ws/status` 可获取在线连接数。
2. 商户越权查询其它商户在线状态应被拒绝（`merchant scope denied`）。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.1、6、7.2、10。
2. 代码：
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（websocket push 用例）。

结论：满足。

## 3.9 场景 S9：租户写冻结与配额限流

1. 当商户进入迁移窗口（`writeEnabled=false`）时，支付核销等写操作应被阻断。
2. 当商户写流量超过配额时，应返回 `429` 且错误码为 `TENANT_RATE_LIMITED`。
3. 单商户超限不应影响其他商户正常写入。

反推：
1. 文档：`MealQuest_Server_Spec.md` 6、7.2、11。
2. 代码：
   - `MealQuestServer/src/core/tenantPolicy.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（tenant policy 用例）。

结论：满足。

## 3.10 场景 S10：租户策略管理权限边界

1. `OWNER` 可查询并更新本商户 `tenant-policy`。
2. 跨商户查询或更新应返回 `merchant scope denied`。
3. 非 `OWNER`（如 `MANAGER`）更新策略应返回 `permission denied`。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3、6、7.2。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/core/tenantPolicy.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（tenant policy api 用例）。

结论：满足。

## 3.11 场景 S11：租户策略重启恢复

1. 首次启动将商户设置为 `writeEnabled=false`。
2. 服务重启后再次查询策略，仍为冻结状态。
3. 重启后支付写接口仍被 `TENANT_WRITE_DISABLED` 阻断。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.2、7.2、10。
2. 代码：
   - `MealQuestServer/src/store/inMemoryDb.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（persistent tenant policy 用例）。

结论：满足。

## 3.12 场景 S12：迁移编排步骤联动

1. `OWNER` 查询迁移状态，初始为 `IDLE`。
2. 执行 `FREEZE_WRITE` 后迁移状态变 `FROZEN`，支付写操作被阻断。
3. 执行 `UNFREEZE_WRITE` 后迁移状态变 `RUNNING`，支付写操作恢复。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3、7.2、10。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/store/inMemoryDb.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（migration runbook api 用例）。

结论：满足。

## 3.13 场景 S13：自动切库与重启恢复路由

1. `OWNER` 调用 `migration/cutover` 后，商户被切到专库并恢复写流量。
2. 切库后新支付只写入专库，不落默认共享库。
3. 服务重启后商户仍绑定专库，写流量不回流共享库。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.2、5.3、7.2、10。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/store/inMemoryDb.js`
   - `MealQuestServer/src/core/tenantRouter.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（persistent tenant dedicated route after cutover 用例）。

结论：满足。

## 3.14 场景 S14：自动回滚回流共享库

1. 商户已切专库后，执行 `migration/rollback` 应回流共享库。
2. 回滚后迁移状态应为 `ROLLBACK` 且 `dedicatedDbAttached=false`。
3. 回滚后新支付应落共享库，不再写入专库。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3、7.2、10。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `MealQuestServer/src/core/tenantRouter.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（migration rollback 用例）。

结论：满足。

## 3.15 场景 S15：外部支付回调验签与异步入账

1. 大额订单进入 `PENDING_EXTERNAL` 状态，等待回调确认。
2. 非法签名回调应拒绝（`invalid callback signature`）。
3. 合法签名回调后订单状态转为 `PAID`，并可继续退款与开票流程。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.2、6、10。
2. 代码：
   - `MealQuestServer/src/services/paymentService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（external callback 用例）。

结论：满足。

## 3.16 场景 S16：电子发票助手

1. 未结算订单不允许开票。
2. 已结算订单可开票并返回 `invoiceNo`。
3. 发票可按商户/用户查询。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.2.1、6、10。
2. 代码：
   - `MealQuestServer/src/services/invoiceService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（invoice 链路用例）。

结论：满足。

## 3.17 场景 S17：隐私导出与匿名化删除

1. 仅 `OWNER` 可导出/删除用户数据。
2. 导出内容包含用户、支付、发票、流水快照。
3. 删除动作执行后用户进入匿名化状态（`isDeleted=true`）。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.2.1、6、10。
2. 代码：
   - `MealQuestServer/src/services/privacyService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（privacy 用例）。

结论：满足。

---

## 4. 测试回归结果（本轮）

1. `MealQuestServer`: 25/25 通过。
2. `MealQuestMerchant`: 14/14 通过。
3. `meal-quest-customer`: 19/19 通过。

---

## 5. 仍待深水区（不影响当前闭环）

1. 真实支付网关接入与回调签名验真。
2. 多租户物理分库的生产化编排（当前已具备自动 cutover/rollback 基础能力，下一步补跨库一致性校验事务化与幂等补偿）。
3. 线上级链路压测与故障演练（WebSocket 高并发、磁盘异常、网络抖动）。
