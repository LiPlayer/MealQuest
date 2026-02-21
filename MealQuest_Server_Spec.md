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

## 3.2 商户与风控

1. `killSwitchEnabled`：熔断状态。
2. `budgetCap/budgetUsed`：营销预算红线。
3. `campaigns[]`：已激活策略。
4. `proposals[]`：待确认 AI 提案。

## 3.3 资金与流水

1. `payments[paymentTxnId]`：支付记录与已退款金额。
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

## 5.2 支付与退款

1. `POST /api/payment/quote`
2. `POST /api/payment/verify`（要求 `Idempotency-Key`）
3. `POST /api/payment/refund`（要求 `Idempotency-Key`）

## 5.3 策略与风控

1. `POST /api/merchant/proposals/:id/confirm`
2. `POST /api/merchant/kill-switch`
3. `POST /api/tca/trigger`

---

## 6. 安全与可观测性最小要求

1. 关键资金接口必须幂等。
2. 支付/退款必须写 ledger。
3. 策略执行需可追溯执行 ID。
4. Story JSON 下发前必须 schema 校验。

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

后续（保持总规范一致）：
1. 内存仓储替换为持久化数据库。
2. 引入 JWT 鉴权和多租户隔离。
3. 接入真实 WebSocket 推送通道。
