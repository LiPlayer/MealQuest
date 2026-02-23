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

## 1.4 场景 U4：顾客账户中心查账与注销

1. 顾客从首页进入账户中心，查看钱包、支付流水、发票列表。
2. 顾客端查询仅允许本人数据，跨用户 scope 必须拒绝。
3. 顾客二次确认后执行注销，成功后回到启动页并清理会话。

反推：
1. 文档：`MealQuest_Customer_Spec.md` 2.1、2.3、4.1、6.1。
2. 代码：
   - `meal-quest-customer/src/pages/account/index.tsx`
   - `meal-quest-customer/src/services/DataService.ts`
   - `meal-quest-customer/src/services/ApiDataService.ts`
3. 测试：
   - `meal-quest-customer/test/pages/account.test.tsx`
   - `meal-quest-customer/test/services/api-data-service-customer-center.test.ts`
   - `MealQuestServer/test/http.integration.test.js`（customer ledger/invoice scope 用例）

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
2. 在 `m_store_001` 完成支付后，`m_bistro` 用户钱包不受影响。
3. `m_bistro` 管理员尝试退款 `m_store_001` 的支付单，应被拒绝。

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

## 3.18 场景 S18：标准营销策略库全链路

1. 店长拉取策略模板库，需包含拉新/促活/提客单/留存/社交裂变全分类。
2. 选择模板分支生成提案后，提案进入收件箱 `PENDING`。
3. 店长确认提案后策略生效，可通过事件触发验证执行。
4. 将策略置为 `PAUSED` 后，相同事件不应再命中。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3、7.2；`MealQuest_Merchant_Spec.md` 2.3、2.4。
2. 代码：
   - `MealQuestServer/src/services/strategyLibrary.js`
   - `MealQuestServer/src/services/merchantService.js`
   - `MealQuestServer/src/http/server.js`
   - `MealQuestMerchant/src/services/merchantApi.ts`
3. 测试：`MealQuestServer/test/http.integration.test.js`（strategy library 用例）。

结论：满足。

## 3.19 场景 S19：供应商接口与异业联盟核验

1. 门店传入 `partnerId/orderId/minSpend` 发起联盟订单核验。
2. 若订单真实且满足门槛，返回 `verified=true`。
3. 门槛不满足或订单不存在时返回 `verified=false`。
4. 核验动作必须进入审计日志，支持追责。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.3、5.3、6。
2. 代码：
   - `MealQuestServer/src/services/supplierService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（supplier verify 用例）。

结论：满足。

## 3.20 场景 S20：人工接管定向急售

1. 店长一键创建急售策略，系统生成 `Priority:999` 且带 `TTL`。
2. 触发库存预警事件时急售策略优先命中。
3. 急售策略创建动作广播实时事件并记审计。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3、6；`MealQuest_Merchant_Spec.md` 2.4。
2. 代码：
   - `MealQuestServer/src/services/merchantService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（fire-sale 用例）。

结论：满足。

## 3.21 场景 S21：连锁钱包互通

1. 店长开启连锁配置 `walletShared=true`。
2. 顾客在 B 店支付时，系统可使用 A 店共享钱包进行扣减。
3. 支付响应返回 `walletScope`，可追溯命中的共享钱包来源。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.2、5.3；`MealQuest_Merchant_Spec.md` 2.5。
2. 代码：
   - `MealQuestServer/src/services/allianceService.js`
   - `MealQuestServer/src/services/paymentService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（alliance wallet sharing 用例）。

结论：满足。

## 3.22 场景 S22：社交裂变守恒账务

1. 用户 A 向用户 B 转赠碎银，A 减 B 增。
2. 用户 A 创建拼手气红包，总额先冻结。
3. 多用户领取后，领取总和严格等于红包总额，状态转 `FINISHED`。

反推：
1. 文档：`MealQuest_Server_Spec.md` 3.3、5.3；`MealQuest_Merchant_Spec.md` 2.6。
2. 代码：
   - `MealQuestServer/src/services/socialService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（social transfer/red packet 用例）。

结论：满足。

## 3.23 场景 S23：请客买单会话结算

1. 发起人创建请客会话（`GROUP_PAY` 或 `MERCHANT_SUBSIDY`）。
2. 多个用户参与出资后，店长执行结算。
3. 群买单支持超额自动按比例退款。
4. 老板补贴模式必须受日补贴上限约束，不足时会话失败并原路退款。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.3；`MealQuest_Merchant_Spec.md` 2.6。
2. 代码：
   - `MealQuestServer/src/services/treatPayService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（treat paying 两个用例）。

结论：满足。

## 3.24 场景 S24：顾客自助注销与交易匿名保留

1. 顾客在小程序侧发起 `cancel-account`。
2. 注销完成后，用户账号不可再次登录。
3. 历史交易记录保留但用户标识匿名化（满足合规留存与隐私删除并行）。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.2.1、6；`MealQuest_Customer_Spec.md` 6.1。
2. 代码：
   - `MealQuestServer/src/services/privacyService.js`
   - `MealQuestServer/src/http/server.js`
3. 测试：`MealQuestServer/test/http.integration.test.js`（customer cancel-account 用例）。

结论：满足。

## 3.25 场景 S25：顾客账务查询 scope 防护

1. 顾客可读取本人支付流水与发票列表。
2. 顾客跨用户查询（`userId != auth.userId`）应返回拒绝。
3. 顾客跨商户查询应返回 `merchant scope denied`。

反推：
1. 文档：`MealQuest_Server_Spec.md` 5.2、5.2.1、6；`MealQuest_Customer_Spec.md` 4.1、6.1。
2. 代码：
   - `MealQuestServer/src/http/server.js`
   - `meal-quest-customer/src/services/ApiDataService.ts`
3. 测试：`MealQuestServer/test/http.integration.test.js`（customer ledger/invoice scope 用例）。

结论：满足。

---

## 4. 测试回归结果（本轮）

1. `MealQuestServer`: 33/33 通过。
2. `MealQuestMerchant`: 24/24 通过。
3. `meal-quest-customer`: 33/33 通过。
4. `meal-quest-customer e2e`: 11 通过（设备依赖场景在未连接 DevTools 时自动 skip）。

---

## 5. 仍待深水区（不影响当前闭环）

1. 真实支付网关接入与回调签名验真。
2. 多租户物理分库的生产化编排（当前已具备自动 cutover/rollback 基础能力，下一步补跨库一致性校验事务化与幂等补偿）。
3. 线上级链路压测与故障演练（WebSocket 高并发、磁盘异常、网络抖动）。
