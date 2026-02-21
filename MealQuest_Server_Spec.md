# 餐餐有戏 - 服务端技术架构规范 (Master-Aligned V2.0)

> 依据：`MealQuest_Spec.md`（唯一标准）
> 目标：构建可运行的核心后端闭环，承载资产账本、支付核销、退款回溯、TCA 执行与策略确认。

---

## 1. 架构目标与边界

1. 服务端负责“规则决策与状态落账”，不负责点餐流程。
2. 面向小微餐饮私域：优先保障正确性与可追溯。
3. 所有高风险动作必须满足：
   - 幂等
   - 可追踪 ledger
   - 可人工熔断

---

## 2. 当前工程形态

目录：`MealQuestServer/`

1. `src/core/`：纯算法内核。
2. `src/services/`：支付、策略、商户控制用例。
3. `src/store/`：内存仓储（可替换数据库）。
4. `src/http/`：Node HTTP API。
5. `test/`：`node:test` 单测与集成测试。

---

## 3. 数据模型

## 3.1 用户与资产

1. `wallet.principal`：本金（可退）。
2. `wallet.bonus`：赠送金（不可提现）。
3. `wallet.silver`：寻味碎银。
4. `vouchers[]`：口福红包状态（`ACTIVE/USED`）。
5. `merchantUsers[merchantId][userId]`：用户数据按商户域分桶存储（共享库强隔离）。

## 3.2 商户与风控

1. `killSwitchEnabled`：熔断状态。
2. `budgetCap/budgetUsed`：营销预算红线。
3. `campaigns[]`：已激活策略。
4. `proposals[]`：待确认 AI 提案。
5. `tenantPolicies[merchantId]`：租户策略（写冻结/实时开关/限流配额）。
6. `tenantMigrations[merchantId]`：迁移编排状态（phase/step/note/updatedAt）。
7. `tenantRouteFiles[merchantId]`：专库路由文件（重启后恢复商户专库绑定）。

## 3.3 资金与流水

1. `paymentsByMerchant[merchantId][paymentTxnId]`：支付记录与已退款金额按商户分桶。
2. `ledger[]`：`PAYMENT/REFUND` 流水。
3. `idempotencyMap`：幂等缓存。

---

## 4. 核心算法规范

## 4.1 智能支付 `buildCheckoutQuote`

顺序：
1. 临期可用券优先。
2. 扣赠送金。
3. 扣本金。
4. 扣碎银。
5. 余额不足走外部支付。

输出：`deduction + payable + remainingWallet`。

## 4.2 退款回溯 `applyRefundClawback`

原则：
1. 退款时优先回收赠送金消耗。
2. 若赠送金不足，转为回收本金。
3. 保证结果可解释：`fromBonus / fromPrincipal`。

## 4.3 TCA 执行 `runTcaEngine`

执行前置：
1. 熔断关闭。
2. 事件匹配。
3. 条件全部满足（AND）。
4. 预算未超限。

执行结果：
1. 策略执行 ID 列表。
2. Story JSON 注入列表。
3. 预算消耗递增。

## 4.4 Story JSON 结构校验

最小必填：
1. `templateId`
2. `narrative`
3. `assets[]`
4. `triggers[]`

缺失字段一律拒绝下发。

---

## 5. API 契约（V2）

## 5.1 读状态

1. `GET /health`
2. `GET /api/state?merchantId=&userId=`
3. `GET /api/merchant/dashboard?merchantId=`
4. `GET /api/audit/logs?merchantId=&limit=&cursor=&startTime=&endTime=&action=&status=`
5. `GET /api/ws/status?merchantId=`（商户在线状态）

## 5.1.1 鉴权

1. `POST /api/auth/mock-login`：获取测试令牌（开发联调用）。
2. 除 `/health` 与登录接口外，其余接口均要求 `Authorization: Bearer <token>`。
3. 角色约束：
   - `CUSTOMER`：可支付报价/支付执行/读取自身状态。
   - `CLERK`：可看驾驶舱、可执行收银，不可确认提案/熔断。
   - `MANAGER`：可退款、可触发 TCA，不可熔断与最终提案确认。
   - `OWNER`：拥有全部经营控制权限。

## 5.1.2 实时通道

1. `GET ws://<host>/ws?merchantId=<id>&token=<jwt>`：建立商户域实时通道。
2. 服务端广播事件类型：
   - `PAYMENT_VERIFIED`
   - `PAYMENT_REFUNDED`
   - `PROPOSAL_CONFIRMED`
   - `KILL_SWITCH_CHANGED`
   - `TCA_TRIGGERED`

## 5.2 支付与退款

1. `POST /api/payment/quote`
2. `POST /api/payment/verify`（要求 `Idempotency-Key`）
3. `POST /api/payment/refund`（要求 `Idempotency-Key`）

## 5.3 策略与风控

1. `POST /api/merchant/proposals/:id/confirm`
2. `POST /api/merchant/kill-switch`
3. `POST /api/tca/trigger`
4. `GET /api/merchant/tenant-policy?merchantId=`（仅 `OWNER`）
5. `POST /api/merchant/tenant-policy`（仅 `OWNER`，可更新写冻结/实时开关/配额）
6. `GET /api/merchant/migration/status?merchantId=`（仅 `OWNER`）
7. `POST /api/merchant/migration/step`（仅 `OWNER`，执行冻结/解冻/编排标记）
8. `POST /api/merchant/migration/cutover`（仅 `OWNER`，自动冻结->切库->恢复写入）
9. `POST /api/merchant/migration/rollback`（仅 `OWNER`，自动冻结->回流共享库->恢复写入）

---

## 6. 安全与可观测性最小要求

1. 关键资金接口必须幂等。
2. 支付/退款必须写 ledger。
3. 策略执行需可追溯执行 ID。
4. Story JSON 下发前必须 schema 校验。
5. JWT 令牌必须校验签名与过期时间。
6. 资金与用户查询必须携带并校验 `merchantId` 租户边界。
7. 高风险动作必须记录审计日志（`who/when/tenant/action/status/details`）。
8. 审计查询接口仅商户角色可访问，且必须受商户 scope 限制。
9. `ws/status` 查询必须校验商户 scope，禁止跨商户读取在线状态。
10. 多租户策略层必须支持“写冻结（read-only）+ 每商户配额限流”双闸门。
11. 租户策略管理接口必须仅 `OWNER` 可写，且受商户 scope 限制。
12. 切库后路由元数据必须持久化，防止重启后商户流量回流共享库。

---

## 7. 测试规范

## 7.1 单元测试

1. `smartCheckout.test.js`：抵扣顺序与外部支付。
2. `clawback.test.js`：赠送金优先回收与本金兜底。
3. `tcaEngine.test.js`：预算判定与熔断阻断。

## 7.2 集成测试

`http.integration.test.js` 必须覆盖：
1. 报价
2. 支付
3. 退款
4. 提案确认
5. 天气触发策略执行
6. RBAC：`CLERK` 禁止提案确认，`MANAGER` 可退款
7. WebSocket：支付事件推送与在线连接数状态（含跨商户 scope 拒绝）
8. 持久化：重启后状态可恢复
9. 多租户隔离：同 `userId` 在不同商户域数据互不影响，跨商户退款拒绝
10. 租户路由：可按 `merchantId` 路由到商户专属数据源
11. 审计日志：高风险动作成功/拒绝均有落账
12. 审计查询：分页/游标可读，且客户角色不可访问
13. 租户策略：商户写冻结生效且返回明确错误码
14. 租户配额：单商户超限返回 `429`，且不影响其他商户
15. 租户策略管理：仅 Owner 可更新，跨商户修改必须拒绝
16. 租户策略持久化：重启后策略仍保持生效
17. 迁移编排：冻结/解冻步骤可在线执行并驱动租户策略联动
18. 自动切库：`migration/cutover` 执行后写流量进入专库且重启可恢复
19. 自动回滚：`migration/rollback` 后商户路由回共享库并恢复写流量

---

## 8. 需求追踪矩阵（总规范 -> 服务端）

| ID | 总规范条款 | 服务端要求 | 验收方式 |
| :-- | :-- | :-- | :-- |
| S-01 | 资产经济系统 | 钱包/红包/碎银统一账本 | 支付链路测试 |
| S-02 | 智能收银闭环 | 报价与核销可解释 | `quote/verify` 测试 |
| S-03 | Clawback 风控 | 退款回溯赠送金优先 | `clawback` 测试 |
| S-04 | 无确认不执行 | 提案确认后才激活策略 | API 集成测试 |
| S-05 | Kill Switch | 熔断后策略触发阻断 | `tcaEngine` + API 测试 |
| S-06 | Story Protocol | 下发前强校验 | `storyProtocol` 逻辑断言 |

---

## 9. 用户/商户双角色场景推演（反推文档与代码）

## 9.1 用户视角：支付 + 退款

1. 用户支付时优先吃掉临期券与余额。
2. 支付成功后流水可查。
3. 发生退款时，系统优先回收赠送金权益。

反推检查：
1. 文档必须定义抵扣顺序与退款回溯。
2. 代码必须返回可解释 deduction/clawback。
3. 测试必须验证金额变化正确。

## 9.2 商户视角：策略确认 + 熔断

1. 老板收到 AI 提案，点击确认。
2. 天气事件触发后策略执行并消耗预算。
3. 毛利风险时老板开启熔断，后续触发全部阻断。

反推检查：
1. 文档必须定义“确认后执行”与熔断优先级。
2. 代码必须实现 proposal -> campaign 转换。
3. 测试必须覆盖 blockedByKillSwitch。

---

## 10. 当前版本完成度说明

已完成：
1. 智能抵扣内核。
2. 退款回溯内核。
3. TCA + Story 校验。
4. 提案确认与熔断。
5. HTTP API 与端到端集成测试。
6. JWT 鉴权接入。
7. 持久化存储（`data/db.json`）与重启恢复。
8. WebSocket 实时推送与在线连接数监测接口。
9. 细颗粒角色权限控制（Customer/Clerk/Manager/Owner）。
10. 共享库强隔离：用户与支付数据按商户分桶，关键路径校验租户边界。
11. 租户路由层（`TenantRouter`）：支持热点商户挂载独立数据源。
12. 审计日志（`auditLogs`）：支付、退款、提案确认、熔断、TCA 触发均可追溯。
13. 审计日志查询接口（`/api/audit/logs`）：支持按商户、时间窗、动作、结果分页查询。
14. 在线状态接口（`/api/ws/status`）：已启用商户 scope 强校验，跨商户查询返回 `merchant scope denied`。
15. 租户策略管理（`tenantPolicy`）：支持商户写冻结、实时通道开关、按操作限流（配额治理基础能力）。
16. 租户策略管理 API（`/api/merchant/tenant-policy`）：支持 Owner 在线查询/更新策略并写审计日志。
17. 租户策略持久化：`tenantPolicies` 纳入快照，重启后自动恢复。
18. 迁移编排 API（`/api/merchant/migration/*`）：支持 Owner 查询状态并执行冻结/解冻步骤。
19. 自动切库能力：`/api/merchant/migration/cutover` 可在线切换商户到专库并持久化路由。
20. 自动回滚能力：`/api/merchant/migration/rollback` 可在线回流共享库并清理专库路由绑定。

后续（保持总规范一致）：
1. 内存仓储替换为持久化数据库。
2. 物理分库与租户路由（热点商户独立库）及配额治理能力。
3. 接入真实支付网关与异步回调签名校验链路。

---

## 11. 多租户规模化演进策略（对应 10 万用户 / 千店量级）

阶段 A：共享库强隔离（当前）
1. 数据按商户分桶（`merchantUsers/paymentsByMerchant`），所有读写强制校验 `merchantId` scope。
2. 适用：商户数量增长但热点不明显，优先降低系统复杂度与运维成本。
3. 配额治理：通过 `tenantPolicy` 对商户启用写冻结与按操作限流（`PAYMENT_VERIFY/REFUND/TCA...`）。

阶段 B：热点商户物理分库（下一步）
1. 保持统一 API 与租户路由层，仅将热点商户迁移到专属数据源。
2. 迁移原则：单商户 QPS/存储/大表增长持续高于阈值，且影响共享库稳定性。
3. 回退能力：路由可快速切回共享库，避免一次性全量分库带来的高风险。
4. 迁移期间可结合 `tenantPolicy.writeEnabled=false` 进入商户读写冻结窗口，完成数据搬迁后再恢复写流量。

为何不一次到位全量分库
1. 绝大多数商户在早期是长尾负载，全量分库会带来过高运维与数据治理成本。
2. 共享库阶段更利于快速迭代业务规则与审计模型，降低架构冻结风险。
3. 热点优先分库可在收益最大处优先消除瓶颈，投入产出比更高。
