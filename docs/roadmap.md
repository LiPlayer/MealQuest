# MealQuest 从0开发路线与推进指针手册（可独立开发版）

> 规范真源：`docs/specs/mealquest-spec.md`
> 执行真源：`docs/roadmap.md`（本文件）
> 说明：仓库当前没有独立 Runbook 文档，排障 Runbook 内嵌在本文件第 `06` 章。

## 00. 文档契约

### 00.1 本文件职责

1. 定义从0到商用可用的唯一开发路线（Master Step Sequence）。
2. 维护当前推进位置（Progress Pointer）。
3. 维护步骤证据账本（Evidence Ledger）。
4. 提供按 StepID 索引的排障入口（Runbook）。
5. 提供可独立接手开发的标准检查清单（Ready-for-Solo）。

### 00.2 指针语义（强制）

1. 指针之前步骤：已实现且已验收（`done` + 证据齐全）。
2. 指针当前步骤：唯一主执行步骤（`in_progress` 或 `blocked`）。
3. 指针之后步骤：待执行步骤。
4. 无证据不得标记 `done`，不得前移指针。
5. 回归失败或线上事故证明失效时，步骤状态必须回退，指针必须回拨。

### 00.3 状态枚举（唯一）

1. `not_started`
2. `in_progress`
3. `blocked`
4. `done`

### 00.4 更新规则（强制）

1. 任何代码、接口、策略、风控变更，必须更新对应 `StepID`。
2. 每次前移或回拨指针，必须同时更新第 `02` 章和第 `04` 章。
3. PR 必须声明 `StepID`、`EvidenceRef`、`PointerChange`。
4. 本文档禁止使用待定占位符；责任人默认写 `AI/Agent`。

---

## 01. 从0路线本体（Master Step Sequence）

> 路线本体永远从0开始定义，不因当前实现状态删减步骤或改顺序。

| StepID | Phase | Step Name | Prerequisites | Exit Criteria |
| --- | --- | --- | --- | --- |
| S010 | P0 | 冻结 Welcome 事件与 API 最小契约 | 无 | 事件/API/审计字段冻结并回归通过 |
| S020 | P0 | 契约回归基线建立 | S010 done | 三端契约测试可重复执行 |
| S110 | P1 | Welcome 触发与资格判定闭环 | S020 done | 触发/预算/库存/反套利四场景通过 |
| S120 | P1 | Welcome 审批与执行治理闭环 | S110 done | Approval Token、TTL、Kill Switch 可用 |
| S130 | P1 | Welcome 发放核销账务一致性 | S120 done | 支付到台账到发票到审计链路一致 |
| S210 | P2 | 商户经营看板最小可用版本 | S130 done | 商户可查看命中、消耗、收益、风险 |
| S220 | P2 | 审批中心与执行回放 | S210 done | 商户可确认、执行、回放策略记录 |
| S310 | P3 | 顾客关键路径体验强化 | S220 done | 关键转化路径稳定并可观测 |
| S410 | P4 | 商用发布门与值守门落地 | S310 done | 发布、回滚、演练、告警流程可执行 |
| S420 | P4 | 规模化治理与成本约束 | S410 done | 多店扩展机制与成本监控闭环 |

---

## 02. 推进指针（Progress Pointer）

> 仅用本章判断“下一步干什么”。

### 02.1 指针状态

| Field | Value |
| --- | --- |
| Last Updated | 2026-03-03 |
| Current StepID | S010 |
| Current Status | in_progress |
| Next StepID | S020 |
| Pointer Owner | AI/Agent |
| Pointer Note | 先完成 Welcome 契约冻结与证据闭环，再进入功能闭环阶段 |

### 02.2 指针前移条件检查清单（全部满足）

1. 当前步骤状态为 `done`。
2. 证据账本含测试证据。
3. 证据账本含运行证据（日志/截图/PR 之一）。
4. 无未关闭 blocker。
5. 对应质量门禁命令通过。

### 02.3 指针回拨条件

1. 关键回归测试失败。
2. 线上事故证明退出条件不再满足。
3. 已记录证据无效或不可复现。

---

## 03. Step 卡片（执行说明）

> 每个步骤都必须有可直接执行的卡片。新增步骤必须复用同模板。

### 03.1 Step 卡模板

1. `StepID`
2. `Objective`
3. `Inputs`
4. `Outputs`
5. `Prerequisites`
6. `Impacted Paths`
7. `Implementation Checklist`
8. `Acceptance Criteria`
9. `Verification Commands`
10. `Failure Signals`
11. `Triage Entry`
12. `Evidence Required`
13. `Rollback`
14. `Owner / Status / UpdatedAt`

### 03.2 S010 - 冻结 Welcome 事件与 API 最小契约

- `StepID`: S010
- `Objective`: 冻结 Welcome 核心事件、API、审计字段，消除跨端漂移。
- `Inputs`:
  1. `docs/specs/mealquest-spec.md`
  2. 现有三端实现
- `Outputs`:
  1. 事件契约清单
  2. API 契约清单
  3. 审计字段清单
- `Prerequisites`: 无
- `Impacted Paths`:
  1. `MealQuestServer/src/http/routes`
  2. `MealQuestServer/src/policyos`
  3. `MealQuestMerchant/src/services`
  4. `meal-quest-customer/src/services/apiDataService`
- `Implementation Checklist`:
  1. 固化事件：`USER_ENTER_SHOP`、`WELCOME_POLICY_HIT`、`WELCOME_GRANTED`、`PAYMENT_VERIFIED`。
  2. 固化 API：顾客首页聚合、商户策略视图、支付核验回写。
  3. 固化审计字段：`policyId`、`decision`、`reason`、`operatorId`、`approvalId`、`ttl`、`traceId`。
  4. 契约映射到测试入口并绑定 StepID。
- `Acceptance Criteria`:
  1. 字段语义唯一且无歧义。
  2. 至少一条 Welcome 主链路集成测试通过。
- `Verification Commands`:
  1. `npm run verify`
  2. `cd MealQuestServer && npm test`
- `Failure Signals`:
  1. 前端解析失败或字段缺失。
  2. 同一字段跨端含义冲突。
- `Triage Entry`: `RB-CONTRACT-001`
- `Evidence Required`:
  1. 契约 diff
  2. 测试输出
- `Rollback`: 恢复旧字段兼容读取（一个迭代窗口）
- `Owner / Status / UpdatedAt`: `AI/Agent / in_progress / 2026-03-03`

### 03.3 S020 - 契约回归基线建立

- `StepID`: S020
- `Objective`: 建立稳定可复跑的契约回归基线。
- `Inputs`: S010 输出
- `Outputs`: 统一契约回归清单与命令入口
- `Prerequisites`: S010 done
- `Impacted Paths`:
  1. `MealQuestServer/test`
  2. `meal-quest-customer/test`
  3. `MealQuestMerchant/src/services`
- `Implementation Checklist`:
  1. 整理三端契约测试清单。
  2. 明确高风险用例（支付、审计、策略结果）。
  3. 把失败定位路径写入 Runbook。
- `Acceptance Criteria`:
  1. 契约测试可重复执行。
  2. 失败时可定位到责任模块。
- `Verification Commands`:
  1. `npm run verify`
- `Failure Signals`:
  1. 测试结果不稳定或不可复现。
- `Triage Entry`: `RB-CONTRACT-002`
- `Evidence Required`:
  1. 回归清单
  2. 回归测试输出
- `Rollback`: 回退到上一版稳定契约
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.4 S110 - Welcome 触发与资格判定闭环

- `StepID`: S110
- `Objective`: 完成触发、预算、库存、反套利资格判定闭环。
- `Inputs`: S020 输出
- `Outputs`: 可解释判定与审计记录
- `Prerequisites`: S020 done
- `Impacted Paths`:
  1. `MealQuestServer/src/policyos`
  2. `MealQuestServer/src/services/merchantService.ts`
  3. `MealQuestServer/src/services/paymentService.ts`
- `Implementation Checklist`:
  1. 固化判定顺序与短路规则。
  2. 固化 reason code 枚举。
  3. 覆盖四类核心场景测试。
- `Acceptance Criteria`:
  1. 触发成功、预算耗尽、库存不足、套利拦截可回归。
  2. 审计可解释判定路径。
- `Verification Commands`:
  1. `cd MealQuestServer && npm test`
  2. `cd MealQuestServer && node --test test/policyOs.constraints.test.ts`
- `Failure Signals`:
  1. 误发放、误拦截、reason 缺失。
- `Triage Entry`: `RB-WELCOME-110`
- `Evidence Required`:
  1. 四场景测试输出
  2. 执行日志样例
- `Rollback`: 回切到上个稳定规则版本
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.5 S120 - Welcome 审批与执行治理闭环

- `StepID`: S120
- `Objective`: 打通 AI 建议 -> 人工确认 -> 执行治理链路。
- `Inputs`: S110 输出
- `Outputs`: 审批执行可追溯链
- `Prerequisites`: S110 done
- `Impacted Paths`:
  1. `MealQuestServer/src/policyos/approvalTokenService.ts`
  2. `MealQuestServer/src/http/routes/policyOsRoutes.ts`
  3. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- `Implementation Checklist`:
  1. 落地 Approval Token 生命周期。
  2. 打通 TTL 覆盖策略与 Kill Switch。
  3. 对齐商户端审批状态与失败原因。
- `Acceptance Criteria`:
  1. 无审批 token 的高风险动作被拒绝。
  2. TTL 到期自动失效且可追溯。
- `Verification Commands`:
  1. `npm run verify`
  2. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
- `Failure Signals`:
  1. 越权执行、TTL 失效、状态不同步。
- `Triage Entry`: `RB-WELCOME-120`
- `Evidence Required`:
  1. 审批流回归测试
  2. 商户端操作证据
- `Rollback`: 停用自动执行路径，回退人工审批路径
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.6 S130 - Welcome 发放核销账务一致性

- `StepID`: S130
- `Objective`: 打通支付、发放、核销、台账、发票、审计一致性。
- `Inputs`: S120 输出
- `Outputs`: 可回放交易闭环
- `Prerequisites`: S120 done
- `Impacted Paths`:
  1. `MealQuestServer/src/services/paymentService.ts`
  2. `MealQuestServer/src/policyos/ledgerService.ts`
  3. `MealQuestServer/src/services/invoiceService.ts`
  4. `meal-quest-customer/src/pages/account`
- `Implementation Checklist`:
  1. 固化核销与入账顺序。
  2. 发票关联交易与权益流水。
  3. 用 `traceId` 串联审计链路。
- `Acceptance Criteria`:
  1. 任意 Welcome 成功订单可完整追溯。
  2. 对账无不一致告警。
- `Verification Commands`:
  1. `cd MealQuestServer && npm test`
  2. `cd MealQuestServer && node --test test/policyOs.ledger.test.ts`
- `Failure Signals`:
  1. 支付成功但未入账或未开票。
- `Triage Entry`: `RB-WELCOME-130`
- `Evidence Required`:
  1. 对账日志
  2. 回放记录
- `Rollback`: 关闭新链路写入，回退旧账本逻辑
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.7 S210 - 商户经营看板最小可用版本

- `StepID`: S210
- `Objective`: 建立商户可用的经营看板最小闭环。
- `Inputs`: S130 输出
- `Outputs`: 看板字段、接口、展示入口
- `Prerequisites`: S130 done
- `Impacted Paths`:
  1. `MealQuestServer/src/services/merchantService.ts`
  2. `MealQuestServer/src/http/routes/merchantRoutes.ts`
  3. `MealQuestMerchant/src/screens`
  4. `MealQuestMerchant/src/domain/merchantEngine.ts`
- `Implementation Checklist`:
  1. 输出最小指标集：命中率、补贴消耗、核销收益、风险告警数。
  2. 打通看板接口与商户端展示。
  3. 建立指标口径说明与刷新频率。
- `Acceptance Criteria`:
  1. `/api/merchant/dashboard` 响应成功率 >= 99.5%（观察窗口 24h）。
  2. 看板四类核心指标字段完整率 >= 99.0%。
  3. 指标口径一致性抽样误差 <= 1.0%。
  4. 硬失败条件：若连续两次回归出现口径误差 > 1.0%，本步必须回拨为 `in_progress`。
- `Verification Commands`:
  1. `cd MealQuestServer && npm test`
  2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
- `Failure Signals`:
  1. 指标缺值、口径不一致、页面崩溃。
  2. 看板接口 5xx 错误率 > 1%。
- `Triage Entry`: `RB-COCKPIT-210`
- `Evidence Required`:
  1. 指标接口响应样例
  2. 商户端展示截图
  3. 指标口径对账记录
- `Rollback`: 隐藏新看板入口并回退老视图
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.8 S220 - 审批中心与执行回放

- `StepID`: S220
- `Objective`: 让商户可完成审批确认、执行查看、历史回放。
- `Inputs`: S210 输出
- `Outputs`: 审批中心页面与回放能力
- `Prerequisites`: S210 done
- `Impacted Paths`:
  1. `MealQuestServer/src/http/routes/policyOsRoutes.ts`
  2. `MealQuestServer/src/services/agentRuntimeService.ts`
  3. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- `Implementation Checklist`:
  1. 建立待审批队列与详情视图。
  2. 打通执行记录与失败原因查看。
  3. 支持按策略/用户/时间回放。
- `Acceptance Criteria`:
  1. 审批状态一致性 >= 99.5%（服务端状态与客户端状态一致）。
  2. 回放查询成功率 >= 99.0%。
  3. `approvalId` 与 `traceId` 缺失率 = 0。
  4. 硬失败条件：发现越权执行或无法追溯记录，本步必须回拨为 `blocked`。
- `Verification Commands`:
  1. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
  2. `cd MealQuestServer && node --test test/agentOs.stream.integration.test.ts`
  3. `cd MealQuestMerchant && npm run typecheck`
- `Failure Signals`:
  1. 审批状态错乱、回放数据断链。
  2. 审批记录缺失 `approvalId` 或 `traceId`。
- `Triage Entry`: `RB-APPROVAL-220`
- `Evidence Required`:
  1. 审批流测试输出
  2. 回放链路日志
  3. 越权检查记录
- `Rollback`: 回退为只读执行日志，停用审批中心写入口
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.9 S310 - 顾客关键路径体验强化

- `StepID`: S310
- `Objective`: 提升顾客关键路径稳定性与转化体验。
- `Inputs`: S220 输出
- `Outputs`: 关键路径优化、弱网降级、埋点数据
- `Prerequisites`: S220 done
- `Impacted Paths`:
  1. `meal-quest-customer/src/pages/index`
  2. `meal-quest-customer/src/pages/startup`
  3. `meal-quest-customer/src/services/apiDataService`
  4. `meal-quest-customer/src/domain/smartCheckout.ts`
- `Implementation Checklist`:
  1. 优化首页活动注入与反馈链路。
  2. 优化支付后反馈一致性。
  3. 补齐弱网降级和恢复策略。
- `Acceptance Criteria`:
  1. 顾客关键路径用例通过率 = 100%（启动、报价、核验、资产回写）。
  2. `test:regression:ui` 全通过。
  3. 弱网恢复后状态一致率 >= 99.5%。
  4. 硬失败条件：存在阻断级 UI 回归缺陷（P1）时，本步不得标记 `done`。
- `Verification Commands`:
  1. `cd meal-quest-customer && npm run typecheck && npm test`
  2. `cd meal-quest-customer && npm run test:regression:ui`
- `Failure Signals`:
  1. 关键路径中断、状态回写错乱、弱网恢复失败。
  2. 回归 UI 测试出现阻断失败。
- `Triage Entry`: `RB-CUSTOMER-310`
- `Evidence Required`:
  1. UI 回归测试结果
  2. 弱网测试记录
  3. 关键路径埋点样例
- `Rollback`: 关闭新交互开关并恢复稳定版本页面
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.10 S410 - 商用发布门与值守门落地

- `StepID`: S410
- `Objective`: 固化可执行的发布、值守、回滚流程。
- `Inputs`: S310 输出
- `Outputs`: 发布批次流程、值守规则、回滚模板
- `Prerequisites`: S310 done
- `Impacted Paths`:
  1. `docs/roadmap.md`
  2. `MealQuestServer/scripts`
  3. `MealQuestServer/src/http/server.ts`
- `Implementation Checklist`:
  1. 固化 canary/limited/general 放量门槛。
  2. 固化事故分级、告警触发、应急流程。
  3. 固化回滚演练与 RCA 模板。
- `Acceptance Criteria`:
  1. canary 观察窗口 24h 内 P0/P1 事故数 = 0。
  2. 回滚演练可在 15 分钟内恢复核心链路。
  3. 告警覆盖支付、策略执行、审批执行三大链路。
  4. 硬失败条件：任意一次回滚演练失败，本步必须回拨为 `in_progress`。
- `Verification Commands`:
  1. `npm run verify`
  2. `cd MealQuestServer && npm run test:smoke`
- `Failure Signals`:
  1. 发布步骤不可执行、回滚无效、告警漏报。
- `Triage Entry`: `RB-OPS-410`
- `Evidence Required`:
  1. 演练记录
  2. 告警与回滚日志
  3. 值守值班记录
- `Rollback`: 立即进入紧急回滚模式并冻结放量
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

### 03.11 S420 - 规模化治理与成本约束

- `StepID`: S420
- `Objective`: 建立多店扩展与成本治理闭环。
- `Inputs`: S410 输出
- `Outputs`: 扩展边界、成本指标、治理规则
- `Prerequisites`: S410 done
- `Impacted Paths`:
  1. `MealQuestServer/src/core/tenantRouter.ts`
  2. `MealQuestServer/src/store`
  3. `docs/roadmap.md`
- `Implementation Checklist`:
  1. 明确多店扩展边界与租户隔离策略。
  2. 建立成本指标：支付通道、AI 推理、云资源。
  3. 建立容量阈值与扩容策略。
- `Acceptance Criteria`:
  1. 多租户隔离回归通过率 = 100%。
  2. 三类成本指标覆盖率 = 100%（支付、AI、云资源）。
  3. 扩容触发与降级流程可在演练中成功执行。
  4. 硬失败条件：发现租户隔离缺陷即回拨为 `blocked`。
- `Verification Commands`:
  1. `npm run verify:ci`
  2. `cd MealQuestServer && npm test`
- `Failure Signals`:
  1. 多店隔离问题、成本异常增长、扩容触发失效。
- `Triage Entry`: `RB-SCALE-420`
- `Evidence Required`:
  1. 成本看板样例
  2. 多店压测或回放记录
  3. 隔离回归测试记录
- `Rollback`: 降级至单店稳定策略并冻结扩展开关
- `Owner / Status / UpdatedAt`: `AI/Agent / not_started / 2026-03-03`

---

## 04. 证据账本（Evidence Ledger）

> 证据账本是指针前移唯一依据。

### 04.1 证据格式规范

1. `Test Evidence`：必须包含命令、通过/失败结果、时间戳。
2. `Runtime Evidence`：必须包含日志路径、截图路径或回放记录路径。
3. `Review Ref`：必须包含 commit hash 或 PR 编号。
4. `Result`：`pending | pass | fail`。
5. `Verified By`：默认 `AI/Agent`，可附具体执行体。

### 04.2 证据账本表

| StepID | Test Evidence | Runtime Evidence | Review Ref | Result | Verified By | Verified At |
| --- | --- | --- | --- | --- | --- | --- |
| S010 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S020 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S110 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S120 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S130 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S210 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S220 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S310 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S410 | 待补 | 待补 | 待补 | pending | AI/Agent | - |
| S420 | 待补 | 待补 | 待补 | pending | AI/Agent | - |

---

## 05. 质量门与发布门

### 05.1 仓库统一质量门

1. `npm run check:encoding`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run verify`

### 05.2 分项目质量门

1. Server：`cd MealQuestServer && npm test`
2. Merchant：`cd MealQuestMerchant && npm run lint && npm run typecheck`
3. Customer：`cd meal-quest-customer && npm run typecheck && npm test`

### 05.3 发布门

1. `canary`：1-2 家门店，观察 24 小时。
2. `limited`：10%-30% 门店，观察 72 小时。
3. `general`：全量发布。

### 05.4 回滚门

1. 30 分钟内连续出现 P1 事故，立即回滚。
2. 支付或核销链路异常率超阈值，立即回滚。
3. 回滚后 24 小时内提交 RCA 并补充回归测试。

### 05.5 步骤-测试矩阵

| StepID | 必须通过命令 | 可选专项测试（命令 + 模板） | 失败阻断级别 |
| --- | --- | --- | --- |
| S010 | `npm run verify` | `cd MealQuestServer && npm test`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s010` | release_blocker |
| S020 | `npm run verify` | `cd MealQuestServer && node --test test/policyOs.schema.test.ts`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s020` | release_blocker |
| S110 | `cd MealQuestServer && npm test` | `cd MealQuestServer && node --test test/policyOs.constraints.test.ts`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s110` | release_blocker |
| S120 | `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts` | `cd MealQuestServer && node --test test/agentOs.stream.integration.test.ts`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s120` | release_blocker |
| S130 | `cd MealQuestServer && node --test test/policyOs.ledger.test.ts` | `cd MealQuestServer && npm test`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s130` | release_blocker |
| S210 | `cd MealQuestMerchant && npm run typecheck` | `cd MealQuestMerchant && npm run lint`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s210` | quality_blocker |
| S220 | `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts` | `cd MealQuestServer && node --test test/agentOs.stream.integration.test.ts`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s220` | quality_blocker |
| S310 | `cd meal-quest-customer && npm test` | `cd meal-quest-customer && npm run test:regression:ui`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s310` | quality_blocker |
| S410 | `npm run verify` | `cd MealQuestServer && npm run test:smoke`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s410` | release_blocker |
| S420 | `npm run verify:ci` | `cd MealQuestServer && npm run test:smoke`; 模板：`docs/qa/templates/step-manual-checklist-template.md#s420` | release_blocker |

---

## 06. 内嵌排障 Runbook（按 StepID 绑定）

### 06.1 RB-CONTRACT-001（S010）

- `Symptom`: 前后端字段不一致，接口返回无法解析。
- `First Checks`:
  1. `cd MealQuestServer && npm test`
  2. 对照第 03.2 契约字段清单检查映射。
- `Key Paths`:
  1. `MealQuestServer/src/http/routes`
  2. `MealQuestServer/src/policyos`
  3. `meal-quest-customer/src/services/apiDataService`
- `Recovery`: 回退新增字段解析，恢复兼容字段映射。
- `Escalation`: 若影响支付/核销链路，升级为 P1。

### 06.2 RB-CONTRACT-002（S020）

- `Symptom`: 契约回归测试不稳定或重复失败。
- `First Checks`:
  1. `npm run verify`
  2. 对比最近契约变更与回归基线。
- `Key Paths`:
  1. `MealQuestServer/test`
  2. `meal-quest-customer/test`
- `Recovery`: 回退最新契约变更并锁定最小复现。
- `Escalation`: 连续失败且不可定位时升级架构级处理。

### 06.3 RB-WELCOME-110（S110）

- `Symptom`: Welcome 未触发、误触发、误拦截。
- `First Checks`:
  1. `cd MealQuestServer && node --test test/policyOs.constraints.test.ts`
  2. 检查 reason code 和预算/库存判定链。
- `Key Paths`:
  1. `MealQuestServer/src/policyos`
  2. `MealQuestServer/src/services/merchantService.ts`
- `Recovery`: 回退到上个稳定规则。
- `Escalation`: 误发放造成资金风险时升级 P1。

### 06.4 RB-WELCOME-120（S120）

- `Symptom`: 无审批执行、TTL 失效、Kill Switch 无效。
- `First Checks`:
  1. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
  2. 检查审批 token 状态和过期时间。
- `Key Paths`:
  1. `MealQuestServer/src/policyos/approvalTokenService.ts`
  2. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- `Recovery`: 关闭自动执行入口，回退人工审批。
- `Escalation`: 越权执行即刻升级 P0/P1。

### 06.5 RB-WELCOME-130（S130）

- `Symptom`: 支付成功但未入账或未开票。
- `First Checks`:
  1. `cd MealQuestServer && node --test test/policyOs.ledger.test.ts`
  2. 使用 `traceId` 串联支付/台账/发票日志。
- `Key Paths`:
  1. `MealQuestServer/src/services/paymentService.ts`
  2. `MealQuestServer/src/policyos/ledgerService.ts`
  3. `MealQuestServer/src/services/invoiceService.ts`
- `Recovery`: 停止新链路写入并启用旧逻辑。
- `Escalation`: 影响资金正确性立即升级 P0。

### 06.6 RB-COCKPIT-210（S210）

- `Symptom`: 看板指标缺失、口径不一致、页面展示异常。
- `Signal Source`:
  1. `/api/merchant/dashboard` 接口日志
  2. Merchant 端看板渲染日志
- `5-minute quick isolate`:
  1. 检查接口是否 2xx 且字段齐全。
  2. 比对后端统计口径与前端渲染字段。
  3. 若口径冲突，先降级到只读视图。
- `First Checks`:
  1. `cd MealQuestMerchant && npm run typecheck`
  2. `cd MealQuestServer && npm test`
- `Key Paths`:
  1. `MealQuestServer/src/services/merchantService.ts`
  2. `MealQuestMerchant/src/screens`
- `Recovery`: 回退看板新字段或切换到只读降级视图。
- `Escalation`: 商户无法做经营决策时升级 P1。
- `Escalation Owner`: `AI/Agent on-call`
- `Timebox`: 15 分钟

### 06.7 RB-APPROVAL-220（S220）

- `Symptom`: 审批队列错乱、回放断链、状态不一致。
- `Signal Source`:
  1. `/api/policyos/*` 审批相关请求日志
  2. Agent 任务流状态日志
- `5-minute quick isolate`:
  1. 抽样核对 `approvalId` 与 `traceId` 是否成对出现。
  2. 验证审批状态在服务端与客户端是否一致。
  3. 异常时立即切换只读模式。
- `First Checks`:
  1. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
  2. `cd MealQuestServer && node --test test/agentOs.stream.integration.test.ts`
- `Key Paths`:
  1. `MealQuestServer/src/http/routes/policyOsRoutes.ts`
  2. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- `Recovery`: 暂停写操作并回退到历史只读回放。
- `Escalation`: 审批结果不可追溯时升级 P1。
- `Escalation Owner`: `AI/Agent on-call`
- `Timebox`: 15 分钟

### 06.8 RB-CUSTOMER-310（S310）

- `Symptom`: 顾客关键路径中断、弱网恢复失败。
- `Signal Source`:
  1. 顾客端关键路径埋点
  2. `apiDataService` 请求错误日志
- `5-minute quick isolate`:
  1. 跑 UI 回归定位是否页面层问题。
  2. 跑数据服务测试定位是否接口映射问题。
  3. 若无法定位，先关闭新交互开关。
- `First Checks`:
  1. `cd meal-quest-customer && npm test`
  2. `cd meal-quest-customer && npm run test:regression:ui`
- `Key Paths`:
  1. `meal-quest-customer/src/pages/index`
  2. `meal-quest-customer/src/services/apiDataService`
- `Recovery`: 关闭新交互特性并回退稳定页面。
- `Escalation`: 支付体验受损时升级 P1。
- `Escalation Owner`: `AI/Agent on-call`
- `Timebox`: 15 分钟

### 06.9 RB-OPS-410（S410）

- `Symptom`: 发布流程不可执行、回滚失败、告警漏报。
- `Signal Source`:
  1. 发布流水日志
  2. smoke 测试结果
  3. 告警系统事件记录
- `5-minute quick isolate`:
  1. 立即冻结放量。
  2. 确认回滚入口可用并执行 smoke。
  3. 若关键链路未恢复，进入紧急事故流程。
- `First Checks`:
  1. `npm run verify`
  2. `cd MealQuestServer && npm run test:smoke`
- `Key Paths`:
  1. `MealQuestServer/src/http/server.ts`
  2. `MealQuestServer/scripts`
- `Recovery`: 立即停止放量，进入回滚流程。
- `Escalation`: 生产不可用直接升级 P0。
- `Escalation Owner`: `AI/Agent on-call`
- `Timebox`: 10 分钟

### 06.10 RB-SCALE-420（S420）

- `Symptom`: 多店隔离异常、容量告警频发、成本突增。
- `Signal Source`:
  1. 租户隔离回归日志
  2. 成本监控看板
  3. 容量阈值触发日志
- `5-minute quick isolate`:
  1. 先确认是否出现租户数据串扰。
  2. 检查容量阈值是否按预期触发。
  3. 异常时降级到单店稳定策略。
- `First Checks`:
  1. `npm run verify:ci`
  2. `cd MealQuestServer && npm test`
- `Key Paths`:
  1. `MealQuestServer/src/core/tenantRouter.ts`
  2. `MealQuestServer/src/store`
- `Recovery`: 降级到单店稳定策略并冻结扩展开关。
- `Escalation`: 影响多租户数据安全时升级 P0。
- `Escalation Owner`: `AI/Agent on-call`
- `Timebox`: 10 分钟

---

## 07. 变更协议（PR 必更）

### 07.1 提交要求

1. 每个 PR 必须标注 `StepID`。
2. 每个 PR 必须补 `EvidenceRef`。
3. 每个 PR 必须说明 `PointerChange`（不变、前移、回拨）。

### 07.2 指针变更流程

1. 完成步骤并通过验收命令。
2. 回填第 `04` 章证据账本。
3. 更新第 `02` 章 `Current StepID` 与 `Next StepID`。
4. 在第 `13` 章记录更新日志。

---

## 08. 交付物清单（每步完成必须具备）

1. 可复现命令输出。
2. 关键日志或截图。
3. 回滚入口或开关说明。
4. 相关接口/字段变更说明。
5. 对应 Runbook 条目可用。

---

## 09. 独立开发就绪检查（Ready-for-Solo）

### 09.1 新接手 30 分钟流程

1. `npm run bootstrap`
2. `npm run verify`
3. 打开第 `02` 章读取 `Current StepID`。
4. 跳到第 `03` 章对应 Step 卡执行 `Implementation Checklist`。
5. 出现异常时按 `Triage Entry` 跳转第 `06` 章。

### 09.2 本轮开始前检查

1. 本地环境可执行仓库统一命令。
2. 当前步骤前置条件均为 `done`。
3. 当前步骤证据账本项存在并可回填。
4. 当前步骤对应 Runbook 条目存在。

### 09.3 本轮完成后检查

1. 验收命令通过。
2. 证据账本完整回填。
3. 指针已按规则前移或回拨。
4. 更新日志已记录。

---

## 10. 环境与依赖矩阵

### 10.1 Server 环境变量（`MealQuestServer/src/config/runtimeEnv.ts`）

| Key | Dev | Prod | Default | 说明 |
| --- | --- | --- | --- | --- |
| `HOST` | Optional | Optional | `0.0.0.0` | 服务监听地址 |
| `PORT` | Optional | Optional | `3030` | 服务监听端口 |
| `MQ_DB_URL` | Required | Required | - | 主数据库连接 |
| `MQ_DB_SCHEMA` | Optional | Optional | `public` | DB schema |
| `MQ_DB_POOL_MAX` | Optional | Optional | `5` | 连接池大小 |
| `MQ_DB_AUTO_CREATE` | Optional | Optional | `true` | 自动建表 |
| `MQ_DB_ENFORCE_RLS` | Optional | Optional | `true` | RLS 开关 |
| `DEEPSEEK_API_KEY` | Required | Required | - | AI API Key |
| `MQ_AI_MODEL` | Optional | Optional | `deepseek-chat` | AI 模型名 |
| `MQ_JWT_SECRET` | Optional | Required | dev fallback | JWT 密钥 |
| `MQ_PAYMENT_CALLBACK_SECRET` | Optional | Required | dev fallback | 支付回调签名密钥 |
| `MQ_AUTH_WECHAT_MINI_APP_ID` | Optional | Optional | - | 微信认证参数 |
| `MQ_AUTH_WECHAT_MINI_APP_SECRET` | Optional | Optional | - | 微信认证参数 |
| `MQ_AUTH_ALIPAY_VERIFY_URL` | Optional | Optional | - | 支付宝认证参数 |
| `MQ_AUTH_ALIPAY_APP_ID` | Optional | Optional | - | 支付宝认证参数 |
| `MQ_AUTH_ALIPAY_APP_SECRET` | Optional | Optional | - | 支付宝认证参数 |
| `LANGSMITH_TRACING` | Optional | Optional | `false` | LangSmith 追踪开关 |
| `LANGSMITH_PROJECT` | Optional | Optional | empty | LangSmith 项目 |
| `LANGSMITH_ENDPOINT` | Optional | Optional | empty | LangSmith 地址 |

### 10.2 Merchant 环境变量

| Key | Required | Default | 说明 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_MQ_SERVER_URL` | Optional | `http://127.0.0.1:3030` | 商户端 API Base URL |

### 10.3 Customer 环境变量

| Key | Required | Default | 说明 |
| --- | --- | --- | --- |
| `TARO_APP_SERVER_URL` | Optional | empty | 顾客端 API Base URL |
| `TARO_APP_DEFAULT_STORE_ID` | Optional | empty | 默认门店 ID |
| `TARO_ENV` | Optional | build injected | 平台环境识别 |

### 10.4 首启最小配置（开发机）

1. Server 至少配置：`MQ_DB_URL`、`DEEPSEEK_API_KEY`。
2. Merchant 推荐配置：`EXPO_PUBLIC_MQ_SERVER_URL`。
3. Customer 推荐配置：`TARO_APP_SERVER_URL`、`TARO_APP_DEFAULT_STORE_ID`。

---

## 11. 手工验收模板索引

1. 通用模板：`docs/qa/templates/step-manual-checklist-template.md`
2. 使用方式：按 `StepID` 找到对应小节，填写“场景、结果、证据路径、结论”。

---

## 12. 接口契约索引（执行级）

> 本章提供开发执行最小契约。业务原则仍以 `spec` 为准。

### 12.1 S210 经营看板链路

| Method | Path | Request Minimum | Response Minimum | Error Codes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/merchant/dashboard` | `merchantId` | `hitRate`, `subsidyCost`, `redeemRevenue`, `riskAlertCount`, `traceId` | `400`, `401`, `404`, `500` |
| `POST` | `/api/merchant/kill-switch` | `merchantId`, `enabled`, `operatorId` | `status`, `updatedAt`, `traceId` | `400`, `401`, `403`, `500` |

### 12.2 S220 审批与回放链路

| Method | Path | Request Minimum | Response Minimum | Error Codes |
| --- | --- | --- | --- | --- |
| `POST` | `/api/policyos/decision/evaluate` | `merchantId`, `policyId`, `context` | `decision`, `reason`, `traceId` | `400`, `401`, `422`, `500` |
| `POST` | `/api/policyos/decision/execute` | `merchantId`, `decisionId`, `approvalId` | `status`, `executedAt`, `traceId` | `400`, `401`, `403`, `409`, `500` |
| `GET` | `/api/agent-os/sessions/:sessionId/tasks/:taskId` | `merchantId`, `sessionId`, `taskId` | `task`, `status`, `traceId` | `400`, `401`, `404`, `500` |

### 12.3 S310 顾客关键路径链路

| Method | Path | Request Minimum | Response Minimum | Error Codes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/state` | `merchantId`, `userId` | `assets`, `activities`, `member`, `traceId` | `400`, `401`, `404`, `500` |
| `POST` | `/api/payment/quote` | `merchantId`, `userId`, `items` | `quoteId`, `amount`, `traceId` | `400`, `401`, `422`, `500` |
| `POST` | `/api/payment/verify` | `merchantId`, `userId`, `quoteId` | `status`, `ledgerRef`, `traceId` | `400`, `401`, `409`, `500` |
| `GET` | `/api/invoice/list` | `merchantId`, `userId` | `items[]`, `traceId` | `400`, `401`, `500` |

### 12.4 契约执行规则

1. 关键执行链必须携带 `traceId`。
2. 审批执行链必须携带 `approvalId`。
3. 新字段仅追加，不得破坏旧字段兼容读取。
4. 变更契约必须同步更新 Step 卡、测试矩阵、Runbook。

---

## 13. 更新日志

1. 2026-03-03：重构为从0路线本体 + 推进指针机制；明确“指针之前=已实现且已验收”；无证据不得前移，失败必须回拨。
2. 2026-03-03：升级为可独立开发版，补齐 S210-S420 Step 卡、RB-210/220/310/410/420、步骤-测试矩阵、交付物清单、Ready-for-Solo 检查。
3. 2026-03-03：第二轮开发者复审后补齐环境矩阵、执行级接口契约、量化验收门与 Runbook 信号源。
