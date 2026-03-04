# MealQuest 开发路线图（执行版）

> 规范真源：`docs/specs/mealquest-spec.md`
> 执行真源：`docs/roadmap.md`（本文件）
> 定位：本文件只回答“做什么、做到什么算完成、当前做到哪一步”。

## 01. 文档契约

### 01.1 职责边界

1. `spec` 负责业务目标、范围边界、核心体验形态、KPI 与治理原则。
2. `roadmap` 负责开发方向、任务清单、推进指针、验收入口、排障索引与执行级合同索引。
3. 代码实现方式由开发者在任务边界内自主决定，不在本文件展开实现细节。

### 01.2 状态枚举

1. `todo`
2. `doing`
3. `blocked`
4. `done`

### 01.3 任务卡字段（统一）

1. `task_id`
2. `lane`（`server` / `merchant` / `customer`，其中 `customer` 固定指小程序端）
3. `task`
4. `status`
5. `output`

### 01.4 推进硬规则

1. 指针之前的 Step 视为已实现，不允许出现 `TBD`、`待确认`。
2. 每个 Step 至少绑定 1 个 `Triage Key`。
3. 从 S110 起，所有 Step 必须提供三端可执行验收门。
4. 商户端在自动化完善前，验收基线为 `lint + typecheck + 手工冒烟记录`。
5. 口头确认的关键产品决策必须回填到对应 Step 的 `Decision Notes`。
6. 顾客端实施形态固定为小程序端；未更新 `docs/specs/mealquest-spec.md` 前不得引入其他顾客端技术路线。

### 01.5 完整性规则（Spec Coverage）

1. `docs/roadmap.md` 的任务集合与治理规则必须覆盖 `docs/specs/mealquest-spec.md` 的全部必需条款（含 In Scope、Out of Scope、治理与发布约束）。
2. 任一需求若在覆盖矩阵中标记为 `gap`，不得执行指针前移。
3. `Out of Scope` 需求必须在覆盖矩阵中显式标注为 `guarded-out`，防止误开发。

---

## 02. 主路线（Master Step Sequence）

> 说明：本表按“开发实现顺序”排序，不按 StepID 数字大小排序。

### 02.0 指针判定规则（唯一来源）

1. `Status = doing` 的 Step 即当前指针。
2. 下一指针为当前 Step 完成后，按主路线顺序进入的首个 `todo` Step。
3. 任一时刻仅允许 1 个 Step 处于 `doing`。

| StepID | Phase | Outcome（结果定义） | Dependency | Status |
| --- | --- | --- | --- | --- |
| S010 | P0 | Acquisition（Welcome 子场景）事件/API/审计字段冻结且三端对齐 | 无 | done |
| S020 | P0 | 契约回归基线可重复执行且可定位 | S010 done | done |
| S030 | P0 | 商户入口闭环（登录/开店/会话恢复）可回归 | S020 done | done |
| S040 | P0 | 顾客入口闭环（扫码入店/资产首屏）可回归 | S030 done | done |
| S110 | P1 | Acquisition（Welcome + 候餐小游戏）触发与资格判定闭环可回归 | S040 done | doing |
| S120 | P1 | Acquisition 执行治理闭环（审批/TTL/Kill Switch） | S110 done | todo |
| S130 | P1 | Acquisition 发放核销账务一致性闭环 | S120 done | todo |
| S210 | P2 | 商户经营看板最小可用 | S130 done | todo |
| S220 | P2 | 老板端 Agent 查询协作基线（账务/发票）可回归 | S210 done | todo |
| S230 | P2 | 策略提案卡闭环（同意/驳回）可回归 | S220 done | todo |
| S240 | P2 | 商户审批中心与执行回放可用 | S230 done | todo |
| S250 | P2 | 全局最优建议与执行硬门协同可回归 | S240 done | todo |
| S260 | P2 | 会话三态与关键提醒机制可回归 | S250 done | todo |
| S310 | P3 | 顾客关键路径与小游戏体验稳定 | S260 done | todo |
| S320 | P3 | KPI 可观测与 Go/No-Go 判定可执行 | S310 done | todo |
| S410 | P4 | 商用发布、值守、回滚流程可执行 | S320 done | todo |
| S420 | P4 | 多租户规模化治理与成本闭环 | S410 done | todo |

### 02.1 Spec 需求覆盖矩阵（完整性基线）

| Spec Clause | Requirement（摘要） | Mapped Items（StepID / Roadmap Section） | Coverage |
| --- | --- | --- | --- |
| 0 | 版本治理、首发区域、变更先文档后研发 | `01.1`, `01.4`, `07`, `10` | covered |
| 1.1 | 北极星目标（商户价值、顾客价值、平台可复制） | S030, S040, S210, S320, S410 | covered |
| 1.2 | 无请求不决策、无确认不执行、利润优先、先闭环后扩张 | S110, S120, S250 | covered |
| 2.1 | ICP（单店/小连锁、低 IT 成本、结果导向） | S030, S210, S410 | covered |
| 2.2-2.3 | 商户/顾客核心场景与平台价值（支付+营销闭环） | S030, S040, S110, S130, S210 | covered |
| 3.1-3.3 | 商业约束（预算/风险/毛利红线）与单元经济可控 | S120, S320, S250, S420 | covered |
| 4.1 商户端 | 登录、开店、经营视图、老板端 Agent、紧急停机 | S030, S210, S220, S230, S240, S120 | covered |
| 4.1 Merchant QR | Merchant can generate and distribute customer entry QR code (preview/save/share) | S040 | covered |
| 4.1 顾客端 | 扫码入店、Acquisition 子域小游戏、资产展示、支付核销、账本发票查询 | S040, S110, S130, S310 | covered |
| 4.1 服务端 | 认证、支付、发票、隐私、策略治理、审计、多租户隔离 | S030, S040, S120, S130, S240, S420 | covered |
| 4.1 策略范围 | 首版仅开放 Acquisition 子域（Welcome + 候餐小游戏）闭环商用 | S110, S120, S130 | covered |
| 4.2 | 点餐/后厨/进销存、除 Acquisition 子域外其余策略族商用、顾客/店长 Agent 不做 | S320（发布门范围审计）, S410（上线清单） | guarded-out |
| 5.1-5.5 | 三类资产系统与顾客/老板核心形态、体验红线 | S040, S110, S130, S210, S220, S310 | covered |
| 6.1-6.5 | MVP 闭环与顾客/老板旅程对齐 | S030, S040, S110, S120, S130, S310 | covered |
| 7.1-7.8 | Agent 核心定位、查询协作、提案协作、治理耦合、提醒与降级 | S220, S230, S240, S250, S260 | covered |
| 8.1-8.2 | KPI 指标与 Go/No-Go 发布门 | S320, S410 | covered |
| 9.1-9.3 | 资金安全、隐私合规、发票与审计合规 | S120, S130, S410, S420 | covered |
| 10 | 风险清单与应对（套利/刷分/通胀/毛利/失控/可用性） | S110, S120, S250, S310, S410, S420 | covered |
| 11.1-11.3 | 五类策略族扩展框架与扩展硬约束 | S250, S260, S420 | covered |
| 12 | 执行文档边界（spec/roadmap 职责边界） | `01.1`, `01.5`, `06`, `07` | covered |

- Coverage Summary：
1. `covered`: 18
2. `guarded-out`: 1
3. `gap`: 0

---

## 03. Step 任务卡（主Step + 三端任务）

### S010 - 冻结 Acquisition（Welcome 子场景）最小契约

- Objective：冻结 Acquisition（Welcome 子场景）最小合同，消除三端字段漂移。
- Dependency：无。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S010-SRV-01 | server | 固化 Acquisition/Welcome 事件、API、审计字段清单并绑定路由入口 | done | 合同基线清单 |
| S010-MER-01 | merchant | 核对商户端关键接口字段映射（Agent/看板/审批相关） | done | 字段映射清单 |
| S010-CUS-01 | customer | 核对小程序关键接口字段映射（state/payment/invoice） | done | 字段映射清单 |

- Deliverables：
1. 合同字段清单（事件/API/审计）。
2. 三端字段映射检查记录。
3. 可重复执行的最小链路证据。

- Done Definition：
1. 同一字段跨端语义一致。
2. 至少一条 Acquisition（Welcome 子场景）主链路回归通过。
3. 证据账本 S010 行完整回填。

- Acceptance Commands：
1. `npm run verify`
2. `cd MealQuestServer && npm test`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 前端解析失败或字段缺失。
2. 同字段语义冲突。

- Triage Key：`RB-CONTRACT-001`

### S020 - 契约回归基线建立

- Objective：建立三端契约回归基线和失败定位入口。
- Dependency：S010 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S020-SRV-01 | server | 固化后端契约回归命令与失败定位映射 | done | `MealQuestServer/package.json` |
| S020-MER-01 | merchant | 固化商户端契约回归入口（lint/typecheck + 关键流程） | done | `MealQuestMerchant/package.json` |
| S020-CUS-01 | customer | 固化小程序契约回归入口（apiDataService + 页面关键流） | done | `meal-quest-customer/package.json` |

- Deliverables：
1. 三端回归清单。
2. 回归失败定位索引。

- Done Definition：
1. 回归可重复执行。
2. 失败可定位到责任域（server/merchant/customer）。

- Acceptance Commands：
1. `npm run test:contract:baseline`
2. `cd MealQuestServer && npm run test:contract:baseline`
3. `cd MealQuestMerchant && npm run test:contract:baseline`
4. `cd meal-quest-customer && npm run test:contract:baseline`

- Failure Signals：
1. 回归结果不稳定或不可复现。

- Triage Key：`RB-CONTRACT-002`

### S030 - 商户入口闭环（登录/开店/会话恢复）

- Objective：打通老板首日可用链路，保证手机号登录、开店、会话恢复可回归。
- Dependency：S020 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S030-SRV-01 | server | 固化商户认证与开店接口合同（登录/开店/门店信息） | done | `MealQuestServer/test/http.integration.test.ts`（merchant phone login / complete-onboard 用例） |
| S030-MER-01 | merchant | 打通 login -> quick-onboard -> agent 首页与会话恢复链路 | done | `MealQuestMerchant/src/context/MerchantContext.tsx`; `MealQuestMerchant/src/services/apiClient.ts`; `MealQuestMerchant/src/services/authSessionStorage.ts`; 手工冒烟记录 |
| S030-CUS-01 | customer | 验证商户入口链路变更不影响顾客主路径 | done | `meal-quest-customer/test/pages/startup.test.tsx`; `meal-quest-customer/test/pages/account.test.tsx`; `docs/qa/s040-customer-entry-closure.md` |

- Deliverables：
1. 商户入口接口合同与错误码映射。
2. 商户端入口流程验收记录。
3. 手工冒烟记录（登录、开店、重启恢复）。

- Done Definition：
1. 未绑定手机号可进入开店流程，完成后可进入商户工作台。
2. 已绑定商户可直接登录并恢复有效会话。
3. 证据账本 S030 行完整回填。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 登录成功但无法进入业务页。
2. 开店成功后 merchantId/会话不一致。
3. 应用重启后会话丢失。

- Triage Key：`RB-MERCHANT-030`

- Decision Notes（已确认）：
1. 商户端自动化回归完善前，`S030-MER-01` 继续采用 `lint + typecheck + 手工冒烟记录` 作为验收基线。
2. 2026-03-04 已有手工冒烟确认“手机登录测试正常，可继续下一步”，用于覆盖登录/开店/重启恢复链路的首轮验收。

### S040 - 顾客入口闭环（扫码入店/资产首屏）

- Objective：打通顾客扫码入店、会话建立、资产首屏展示的稳定闭环。
- Dependency：S030 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S040-SRV-01 | server | 固化顾客登录与入店能力合同（扫码入店/会话建立/资产状态） | done | `MealQuestServer/test/http.integration.test.ts`（customer login + state + merchant exists + merchant dashboard customerEntry 可见性） |
| S040-MER-01 | merchant | 承接顾客入店状态变化的只读可见性校验 | done | `MealQuestMerchant/src/context/MerchantContext.tsx`; `MealQuestMerchant/src/screens/AgentScreen.tsx`; `MealQuestMerchant/src/services/apiClient.ts` |
| S040-MER-02 | merchant | Deliver fixed customer-entry QR generation and distribution in merchant app (preview/save/share) | done | `MealQuestMerchant/src/screens/EntryQrScreen.tsx`; `MealQuestMerchant/src/services/entryQrService.ts`; `MealQuestMerchant/app/entry-qrcode.tsx`; 手工冒烟记录 |
| S040-MER-03 | merchant | Freeze merchant IA shell (stack + tabs + future placeholder routes) and fix QR back-navigation stability | done | `MealQuestMerchant/app/_layout.tsx`; `MealQuestMerchant/app/(tabs)/_layout.tsx`; `MealQuestMerchant/app/(tabs)/dashboard.tsx`; `MealQuestMerchant/app/(tabs)/approvals.tsx`; `MealQuestMerchant/app/(tabs)/replay.tsx`; `MealQuestMerchant/app/(tabs)/risk.tsx` |
| S040-CUS-01 | customer | 完成 startup 扫码入店、会话建立与首页资产展示闭环 | done | `meal-quest-customer/src/pages/startup/index.tsx`; `meal-quest-customer/src/pages/index/index.tsx`; `meal-quest-customer/src/pages/account/index.tsx` |

- Deliverables：
1. 扫码入店链路回归记录。
2. 资产首屏字段映射与降级策略。
3. 首发平台兼容记录。
4. 跨端布局骨架冻结记录（商户端 IA 预置占位 + 顾客端三页统一风格基线）。

- Done Definition：
1. 新用户扫码可完成入店并看到资产首屏。
2. 已登录用户可复用会话进入首页。
3. 异常 merchantId 可被阻断并提示。
4. Merchant app can generate and distribute store entry QR code (preview/save/share) as a valid scan source.

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd meal-quest-customer && npm run typecheck && npm test`
3. `cd meal-quest-customer && npm run test:e2e:core`
4. `cd MealQuestMerchant && npm run lint && npm run typecheck`

- Failure Signals：
1. 扫码后无法建立顾客会话。
2. 首页资产字段缺失或映射错误。
3. 首发平台流程通过但兼容平台崩溃。
4. Merchant QR 页面返回主入口时出现导航栈崩溃（例如 `stale` 相关错误）。

- Triage Key: `RB-CUSTOMER-040`, `RB-MERCHANT-QR-040`, `RB-MERCHANT-NAV-040`

- Decision Notes（已确认）：
1. `S040-CUS-01` 允许在 `S030` 总体验收完成前先行落地代码与测试，Step 收口仍以三端任务全部完成为准。
2. 顾客端首版仅以小程序实现，不引入非小程序技术路线。
3. `S040-MER-01` 采用“服务端 dashboard 字段 + 商户端只读展示”的方案，不在此 Step 引入写操作。
4. Windows 环境下顾客端 e2e 自动拉起采用 `cli auto --auto-port + automator.connect`，不再依赖 `automator.launch` 直接拉起 `cli.bat`。
5. 顾客端 e2e 废弃 `WECHAT_WS_ENDPOINT` / `WECHAT_SERVICE_PORT` connect 模式，仅保留官方 CLI 自动拉起模式。
6. 顾客端 e2e 自动拉起默认启用，不再要求 `WECHAT_E2E_AUTO_LAUNCH` 环境开关。
7. S040 is reopened because merchant-side QR production was missing from the customer scan chain.
8. S110 is blocked until S040 is re-closed with merchant QR source capability.
9. S040-MER-02 uses merchant local QR generation with plain-text `merchantId` payload.
10. S040-MER-02 scope is dedicated page + image save + image share; no server-side QR generation API in this step.
11. Merchant app root navigation uses stack shell + tabs IA freeze to avoid repeated route rewrites in S110+.
12. Entry QR screen back action must support safe fallback to `/(tabs)/dashboard` when no history stack is available.
13. 顾客端 weapp e2e 仅在 Windows 执行；非 Windows 环境默认跳过 `test:e2e:core`，不作为失败判定。
14. 2026-03-04 已确认商户端二维码保存/分享手工冒烟通过，`S040-MER-02` 收口为 `done`，S040 解锁至下一指针。

### S110 - Acquisition（Welcome + 候餐小游戏）触发与资格判定闭环

- Objective：打通 Acquisition 子域触发、预算、库存、反套利与小游戏奖励资格判定。
- Dependency: S040 done.

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S110-SRV-01 | server | 完成 Acquisition 判定链和小游戏奖励风控（频控/同人/异常分） | todo | 判定闭环可回归 |
| S110-MER-01 | merchant | 提供商户可读的命中/拦截结果与原因展示 | todo | 商户可见结果 |
| S110-CUS-01 | customer | 打通顾客端命中反馈与奖励到账可见性 | todo | 顾客可见结果 |

- Deliverables：
1. 四场景判定回归结果。
2. 奖励风控拦截证据。
3. 三端状态一致性证据。

- Done Definition：
1. 触发成功、预算耗尽、库存不足、套利拦截四场景通过。
2. 奖励重复结算与异常分数请求被拦截。
3. 顾客端与商户端可查看一致的判定结果。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestServer && node --test test/policyOs.constraints.test.ts`
3. `cd MealQuestServer && node --test test/http.integration.test.ts`
4. `cd MealQuestMerchant && npm run lint && npm run typecheck`
5. `cd meal-quest-customer && npm run test:regression:ui`

- Failure Signals：
1. 误发放、误拦截、reason 缺失。
2. 奖励异常放量或重复到账。
3. 商户端与顾客端显示结果冲突。

- Triage Key：`RB-ACQ-110`, `RB-GAME-110`

### S120 - Acquisition 执行治理闭环（审批/TTL/Kill Switch）

- Objective：打通 Acquisition 子域审批令牌、TTL、Kill Switch 的执行治理链。
- Dependency：S110 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S120-SRV-01 | server | 完成审批令牌校验、TTL 过期、Kill Switch 执行约束 | todo | 治理链可回归 |
| S120-MER-01 | merchant | 完成审批确认、执行反馈、失败原因展示 | todo | 商户审批可用 |
| S120-CUS-01 | customer | 顾客端承接治理结果（只读反馈与状态一致性） | todo | 状态一致性 |

- Deliverables：
1. 审批执行链路回归结果。
2. 过期与熔断行为证据。
3. 三端状态一致性证据。

- Done Definition：
1. 无审批条件的高风险动作不可执行。
2. TTL 到期后自动失效且可追溯。
3. Kill Switch 生效且可观测。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run test:regression:ui`

- Failure Signals：
1. 越权执行。
2. TTL 失效。
3. 状态不同步。

- Triage Key：`RB-ACQ-120`

### S130 - Acquisition 发放核销账务一致性

- Objective：确保 Acquisition 子域支付、奖励到账、台账、发票、审计一致。
- Dependency：S120 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S130-SRV-01 | server | 固化 payment->ledger->invoice->audit 一致性与 trace 串联 | todo | 一致性链路 |
| S130-MER-01 | merchant | 提供商户侧交易/执行结果可追溯视图 | todo | 商户追溯能力 |
| S130-CUS-01 | customer | 提供顾客账本与发票查询一致性展示 | todo | 顾客可追溯能力 |

- Deliverables：
1. 对账证据。
2. 审计回放证据。
3. 三端追溯视图一致性记录。

- Done Definition：
1. 支付成功订单可完整追溯到账务与发票。
2. 小游戏奖励到账与账本一致，无悬挂流水。
3. 商户端与顾客端可见追溯链完整。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestServer && node --test test/policyOs.ledger.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm test -- --runInBand test/pages/account.test.tsx`

- Failure Signals：
1. 支付成功但未入账或未开票。
2. 奖励到账成功但审计缺失。
3. 前端账本展示与后端台账不一致。

- Triage Key：`RB-ACQ-130`

### S210 - 商户经营看板最小可用

- Objective：交付老板可用的经营看板与 Agent 建议协同最小版本。
- Dependency：S130 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S210-SRV-01 | server | 提供看板指标接口与口径稳定性保障 | todo | 指标接口 |
| S210-MER-01 | merchant | 完成看板展示、Agent 建议入口、缺失字段降级与刷新机制 | todo | 商户看板页面 |
| S210-CUS-01 | customer | 验证看板相关变更不影响顾客主路径兼容 | todo | 兼容验证记录 |

- Deliverables：
1. 看板字段说明。
2. 商户端看板验收记录。
3. 看板到 Agent 建议入口可用性记录。

- Done Definition：
1. 看板关键字段完整。
2. 商户端页面稳定可用。
3. 老板可从看板进入 Agent 建议并完成一次建议确认。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 指标缺值或口径冲突。
2. 页面崩溃。
3. 看板与 Agent 建议上下文不一致。

- Triage Key：`RB-COCKPIT-210`

### S220 - 老板端 Agent 查询协作基线

- Objective：打通老板端 Agent 对账务与发票查询的最小闭环，确保查询协作可回归。
- Dependency：S210 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S220-SRV-01 | server | 固化 Agent 查询能力路由（账单/发票）及权限/租户守卫 | todo | 查询能力基线 |
| S220-MER-01 | merchant | 完成老板端 Agent 查询模式体验（汇总优先、空结果提示） | todo | 查询体验闭环 |
| S220-CUS-01 | customer | 验证顾客端不接入 Agent 且现有账票入口兼容 | todo | 兼容验证记录 |

- Deliverables：
1. 查询能力清单（账单/发票）。
2. 查询守卫生效证据（角色、门店隔离）。
3. 老板端查询问答手工冒烟记录。

- Done Definition：
1. 老板可通过 Agent 查询账单与发票经营事实。
2. 非老板角色不得访问老板端 Agent 查询能力。
3. 跨门店越权查询被阻断并可审计。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. Agent 返回不可验证数据。
2. 越权查询未被阻断。
3. 查询能力影响支付/发票主链路。

- Triage Key：`RB-AGENT-220`

- Decision Notes（已确认）：
1. 首版仅老板端开放 Agent，店长与顾客侧不开放。
2. 查询数据必须可验证，不做黑盒估算回答。
3. 查询遵循单店授权边界。

### S230 - 策略提案卡同意/驳回闭环

- Objective：完成“策略意图 -> 提案卡 -> 同意/驳回 -> 回执”闭环，确保老板端可回归。
- Dependency：S220 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S230-SRV-01 | server | 提供提案生命周期与同意/驳回决策接口 | todo | 提案生命周期基线 |
| S230-MER-01 | merchant | 完成提案卡固定五要素展示与同意/驳回交互 | todo | 提案卡闭环 |
| S230-CUS-01 | customer | 验证提案机制不影响顾客主路径与支付路径 | todo | 兼容验证记录 |

- Deliverables：
1. 提案卡交互流程记录。
2. 同意/驳回结果回执记录。
3. 提案协作不影响主链路证据。

- Done Definition：
1. 策略意图命中后可生成提案卡。
2. 老板可在 UI 完成同意或驳回。
3. 同意后立即生效，驳回后返回普通对话。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 提案卡字段缺失或顺序混乱。
2. 同意/驳回状态错乱或重复执行。
3. 提案阻塞状态无法恢复。

- Triage Key：`RB-AGENT-230`

- Decision Notes（已确认）：
1. 单店单会话；同一时刻仅允许 1 个待处理提案。
2. 提案卡仅提供“同意/驳回”动作，不提供撤销。
3. 驳回后可追问原因，但仅用于当次会话优化，不做长期留存。

### S240 - 审批中心与执行回放

- Objective：让商户完成 Agent 建议确认、审批执行、历史回放。
- Dependency：S230 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S240-SRV-01 | server | 提供审批队列、执行结果、回放查询接口 | todo | 审批回放接口 |
| S240-MER-01 | merchant | 完成 Agent 建议确认、审批中心与回放页面主流程 | todo | 审批中心页面 |
| S240-CUS-01 | customer | 顾客端承接审批执行结果的可见状态变化 | todo | 状态一致性 |

- Deliverables：
1. 审批流程回归证据。
2. 回放链路证据。
3. Agent 建议到审批执行的一体化证据。

- Done Definition：
1. 审批状态在服务端与商户端一致。
2. 回放链路具备 `approvalId` 与 `traceId`。
3. 至少一条“Agent 建议 -> 人工确认 -> 执行 -> 回放”链路可追溯。

- Acceptance Commands：
1. `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts`
2. `cd MealQuestServer && node --test test/agentOs.stream.integration.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 审批状态错乱。
2. 回放断链。
3. Agent 建议与审批执行无法关联。

- Triage Key：`RB-APPROVAL-240`

### S250 - 全局最优建议与执行硬门

- Objective：将 Agent 建议排序与策略执行治理解耦，形成“全局最优建议 + 执行硬门”闭环。
- Dependency：S240 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S250-SRV-01 | server | 固化全局最优候选排序、动作风险先验、执行硬门校验 | todo | 推荐与执行治理基线 |
| S250-MER-01 | merchant | 提案卡展示预算占用、风险等级、预期区间 | todo | 可解释提案展示 |
| S250-CUS-01 | customer | 验证策略建议增强不影响顾客账务与资产一致性 | todo | 一致性验证记录 |

- Deliverables：
1. 建议排序规则说明（业务层）。
2. 红线硬门拦截证据。
3. 提案解释信息展示证据。

- Done Definition：
1. 建议排序可基于全局最优思想输出主推荐。
2. 超预算/超风险/超毛利红线策略不可执行。
3. 提案信息具备预算、风险、预期区间可读性。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestServer && node --test test/policyOs.constraints.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 超线策略被执行。
2. 同分候选裁决不稳定。
3. 风险/预算信息与后端判定不一致。

- Triage Key：`RB-AGENT-250`

- Decision Notes（已确认）：
1. 建议层采用全局最优思想，执行层保留红线硬门。
2. 动作风险先验默认：wallet 高、voucher 中、fragment 低、story 极低。
3. 综合分权重采用平台基线 + 模型微调（幅度受控）。

### S260 - 会话三态与关键提醒机制

- Objective：完成老板端 Agent 会话三态流转与关键事件提醒机制，保障协作体验可回归。
- Dependency：S250 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S260-SRV-01 | server | 固化会话三态状态流转与关键提醒事件分发 | todo | 会话与提醒基线 |
| S260-MER-01 | merchant | 完成三态 UI 行为（普通/提案待决/回执）与提醒展示 | todo | 三态体验闭环 |
| S260-CUS-01 | customer | 验证提醒能力接入不影响顾客链路稳定性 | todo | 兼容验证记录 |

- Deliverables：
1. 会话三态流转记录。
2. 关键提醒推送与展示记录。
3. 提案待决状态下提醒展示兼容证据。

- Done Definition：
1. 会话三态可稳定流转并可回归。
2. 关键提醒支持 App 内与系统推送。
3. 非营业时段可抑制非紧急提醒。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 会话状态错乱或卡死。
2. 提案待决时出现越权操作入口。
3. 提醒机制导致主链路可用性下降。

- Triage Key：`RB-AGENT-260`

- Decision Notes（已确认）：
1. 会话采用三态：普通对话、提案待决、决策回执。
2. 关键提醒通道：App 内 + 系统推送。
3. 提案待决时仅展示提醒条，不解除提案决策阻塞。

### S310 - 顾客关键路径体验强化

- Objective：稳定顾客关键链路并完成小游戏体验闭环。
- Dependency：S260 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S310-SRV-01 | server | 提供顾客主链路与小游戏接口稳定性保障（start/settle/synthesize） | todo | 接口稳定性 |
| S310-MER-01 | merchant | 商户端承接顾客链路变化的运营提示与兼容验证 | todo | 兼容验证记录 |
| S310-CUS-01 | customer | 完成 startup/index/account 关键链路与小游戏降级体验 | todo | 顾客主路径稳定 |

- Deliverables：
1. 顾客关键路径回归结果。
2. 弱网恢复与小游戏降级证据。

- Done Definition：
1. 启动、报价、核验、资产回写链路通过。
2. 小游戏异常不阻断支付主链路。
3. 小游戏结算链路支持幂等与 trace 追踪。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`
4. `cd meal-quest-customer && npm run test:regression:ui`

- Failure Signals：
1. 关键路径中断。
2. 奖励回写失败或重复回写。
3. 小游戏异常导致支付链路失败。

- Triage Key：`RB-CUSTOMER-310`, `RB-GAME-310`

### S320 - KPI 可观测与 Go/No-Go 判定

- Objective：把商用 KPI、Agent 经营成效与上线门固化为可执行判定流程。
- Dependency：S310 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S320-SRV-01 | server | 在 dashboard 与审计域固化 KPI 所需指标与 trace 链路 | todo | KPI 数据基线 |
| S320-MER-01 | merchant | 看板提供 KPI 达标状态、趋势、告警与 Agent 建议成效可见性 | todo | KPI 运营视图 |
| S320-CUS-01 | customer | 保证顾客链路埋点可支持 KPI 计算口径 | todo | 埋点兼容记录 |

- Deliverables：
1. KPI 指标口径说明。
2. Go/No-Go 判定清单。
3. 看板与审计对账证据。
4. 老板端 Agent 闭环验收记录。

- Done Definition：
1. Spec 8.1 KPI 字段可查询、可解释、可追溯。
2. Go/No-Go 判定流程可重复执行。
3. 指标异常可触发告警与定位路径。
4. 老板可通过 Agent 完成一次策略执行并查看回放解释。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run test:regression:ui`

- Failure Signals：
1. KPI 指标缺失或口径漂移。
2. Go/No-Go 无法按证据执行判定。

- Triage Key：`RB-KPI-320`

### S410 - 商用发布门与值守门落地

- Objective：发布、值守、回滚机制可执行。
- Dependency：S320 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S410-SRV-01 | server | 固化分阶段发布与回滚演练流程 | todo | 发布与回滚流程 |
| S410-MER-01 | merchant | 固化商户端客户端发布检查与回退方案 | todo | 商户端发布清单 |
| S410-CUS-01 | customer | 固化顾客端发布检查与回退方案（首发平台硬门） | todo | 顾客端发布清单 |

- Deliverables：
1. 三端发布清单。
2. 三端回滚清单。
3. 值守与告警清单。

- Done Definition：
1. 发布流程与回滚流程均可演练通过。
2. P0/P1 告警升级路径可执行。
3. 首发平台发布门通过，兼容平台有验证记录。

- Acceptance Commands：
1. `npm run verify`
2. `cd MealQuestServer && npm run test:smoke`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run build:weapp`

- Failure Signals：
1. 发布步骤不可执行。
2. 回滚失败。

- Triage Key：`RB-OPS-410`

### S420 - 规模化治理与成本约束

- Objective：多租户扩展与成本治理闭环。
- Dependency：S410 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S420-SRV-01 | server | 完成多租户隔离、容量阈值、成本指标治理 | todo | 规模化治理能力 |
| S420-MER-01 | merchant | 提供多店运营可用性与异常告警可见性 | todo | 多店运营支持 |
| S420-CUS-01 | customer | 验证多店场景顾客侧状态一致与切换稳定 | todo | 多店顾客体验稳定 |

- Deliverables：
1. 隔离回归报告。
2. 成本监控报告。
3. 容量阈值演练记录。

- Done Definition：
1. 多租户隔离回归通过。
2. 支付/AI/云资源成本指标可观测可告警。

- Acceptance Commands：
1. `npm run verify:ci`
2. `cd MealQuestServer && npm test`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run typecheck && npm test`

- Failure Signals：
1. 租户数据串扰。
2. 成本异常增长。

- Triage Key：`RB-SCALE-420`

---

## 04. 证据账本（按 Step 回填）

| StepID | Test Ref | Runtime Ref | Review Ref | Result | Verified By | Verified At |
| --- | --- | --- | --- | --- | --- | --- |
| S010 | `npm run verify`; `cd MealQuestServer && npm test`; `cd MealQuestMerchant && npm run lint && npm run typecheck`; `cd meal-quest-customer && npm run typecheck && npm test` | `docs/qa/s010-welcome-contract-baseline.md` | `MealQuestServer/test/http.integration.test.ts`（Welcome 主链路）；`meal-quest-customer/test/services/api-data-service.test.ts`（state 映射） | pass | AI/Agent | 2026-03-04 |
| S020 | `npm run test:contract:baseline`; `cd MealQuestServer && npm run test:contract:baseline`; `cd MealQuestMerchant && npm run test:contract:baseline`; `cd meal-quest-customer && npm run test:contract:baseline` | `docs/qa/s020-contract-regression-baseline.md` | `MealQuestMerchant/src/context/MerchantContext.tsx`（lint warning 修复） | pass | AI/Agent | 2026-03-04 |
| S030 | `cd MealQuestServer && npm test`（非沙箱重跑通过，65/65）；`cd MealQuestMerchant && npm run lint && npm run typecheck`；`cd meal-quest-customer && npm run typecheck && npm test -- --runInBand` | `docs/qa/s030-merchant-entry-closure.md` | `MealQuestServer/test/http.integration.test.ts`；`MealQuestMerchant/src/context/MerchantContext.tsx`；`MealQuestMerchant/src/services/apiClient.ts`；`MealQuestMerchant/src/services/authSessionStorage.ts`；`meal-quest-customer/test/pages/startup.test.tsx` | pass | AI/Agent | 2026-03-04 |
| S040 | historical baseline: `cd MealQuestServer && npm test`（66/66）；latest reopen checks: `cd MealQuestMerchant && npm run lint && npm run typecheck`（pass）；`cd meal-quest-customer && npm run typecheck`（pass）；`cd meal-quest-customer && npm test -- --runInBand test/pages/startup.test.tsx test/pages/account.test.tsx`（8/8）；`npm run check:encoding`（pass）；`cd meal-quest-customer && npm run test:e2e:core`（skipped on Ubuntu: windows-only policy）；merchant QR save/share manual smoke（pass） | `docs/qa/s040-customer-entry-closure.md` | `MealQuestServer/test/http.integration.test.ts`；`MealQuestMerchant/app/_layout.tsx`；`MealQuestMerchant/app/(tabs)/_layout.tsx`；`MealQuestMerchant/app/(tabs)/dashboard.tsx`；`MealQuestMerchant/app/(tabs)/approvals.tsx`；`MealQuestMerchant/app/(tabs)/replay.tsx`；`MealQuestMerchant/app/(tabs)/risk.tsx`；`MealQuestMerchant/src/screens/AgentScreen.tsx`；`MealQuestMerchant/src/screens/EntryQrScreen.tsx`；`MealQuestMerchant/src/services/entryQrService.ts`；`meal-quest-customer/src/pages/startup/index.tsx`；`meal-quest-customer/src/pages/index/index.tsx`；`meal-quest-customer/src/pages/account/index.tsx`；`meal-quest-customer/test/pages/startup.test.tsx`；`meal-quest-customer/test/pages/account.test.tsx`；`meal-quest-customer/test/e2e/customer-core-flow.spec.js`；`meal-quest-customer/test/e2e/utils/mini-program-session.js` | pass | AI/Agent | 2026-03-04 |
| S110 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S120 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S130 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S210 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S220 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S230 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S240 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S250 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S260 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S310 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S320 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S410 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |
| S420 | 未提交（按命令回填） | 未提交（按日志回填） | 未提交（commit/PR） | pending | AI/Agent | - |

---

## 05. Runbook 快速索引

| Triage Key | Symptom | First Checks | Responsibility Domain |
| --- | --- | --- | --- |
| RB-CONTRACT-001 | 字段不一致/接口解析失败 | `cd MealQuestServer && npm test` | server + customer |
| RB-CONTRACT-002 | 契约回归不稳定 | `npm run test:contract:baseline` | server + merchant + customer |
| RB-MERCHANT-030 | 商户登录/开店链路中断 | `cd MealQuestMerchant && npm run lint && npm run typecheck` | merchant + server |
| RB-CUSTOMER-040 | 扫码入店/会话建立失败 | `cd meal-quest-customer && Remove-Item Env:WECHAT_WS_ENDPOINT -ErrorAction SilentlyContinue; Remove-Item Env:WECHAT_SERVICE_PORT -ErrorAction SilentlyContinue; $env:WECHAT_CLI_PATH='D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'; npm run test:e2e:core` | customer + server |
| RB-MERCHANT-QR-040 | Merchant app cannot generate/save/share entry QR | `cd MealQuestMerchant && npm run lint && npm run typecheck` | merchant |
| RB-MERCHANT-NAV-040 | Merchant app crashes when returning from entry QR page | `cd MealQuestMerchant && npm run lint && npm run typecheck` | merchant |
| RB-ACQ-110 | Acquisition 子域误发放/误拦截 | `cd MealQuestServer && node --test test/policyOs.constraints.test.ts` | server |
| RB-ACQ-120 | Acquisition 子域审批或 TTL 治理异常 | `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts` | server + merchant |
| RB-ACQ-130 | Acquisition 子域支付到账务链路不一致 | `cd MealQuestServer && node --test test/policyOs.ledger.test.ts` | server |
| RB-COCKPIT-210 | 看板字段缺失/口径冲突 | `cd MealQuestMerchant && npm run typecheck` | merchant + server |
| RB-AGENT-220 | Agent 查询越权或数据口径异常 | `cd MealQuestServer && npm test` | server + merchant |
| RB-AGENT-230 | 提案卡状态错乱或同意/驳回异常 | `cd MealQuestMerchant && npm run typecheck` | merchant + server |
| RB-APPROVAL-240 | 审批中心状态错乱 | `cd MealQuestServer && node --test test/policyOs.http.integration.test.ts` | merchant + server |
| RB-AGENT-250 | 全局最优建议或红线执行门异常 | `cd MealQuestServer && node --test test/policyOs.constraints.test.ts` | server |
| RB-AGENT-260 | 会话三态或关键提醒机制异常 | `cd MealQuestMerchant && npm run lint && npm run typecheck` | merchant + server |
| RB-KPI-320 | KPI 口径漂移/发布门无法判定 | `cd MealQuestServer && npm test` | merchant + server + customer |
| RB-CUSTOMER-310 | 顾客关键路径中断 | `cd meal-quest-customer && npm test` | customer |
| RB-GAME-110 | 奖励异常放量/重复到账 | `cd MealQuestServer && node --test test/http.integration.test.ts` | server |
| RB-GAME-310 | 小游戏开局/结算/回写异常 | `cd meal-quest-customer && npm run test:regression:ui` | customer + server |
| RB-OPS-410 | 发布/回滚流程异常 | `cd MealQuestServer && npm run test:smoke` | server + release |
| RB-SCALE-420 | 多租户隔离或成本异常 | `npm run verify:ci` | server |

---

## 06. 能力合同索引（Spec 对齐）

> 本节仅保留 `docs/specs/mealquest-spec.md` 已定义的能力域，不新增 spec 外功能需求。

| Domain | Capability Contract | Owner Lane |
| --- | --- | --- |
| Auth & Entry | Customer/merchant identity, merchant entry-QR generation/distribution, and in-store entry chain | server + merchant + customer |
| Customer Core | 资产展示、支付核销、账本与发票查询 | server + customer |
| Merchant Ops | 开店、经营看板、紧急停机 | server + merchant |
| Acquisition Strategy | Welcome + 候餐小游戏子域触发、判定、治理、发放一致性 | server + merchant + customer |
| Agent Collaboration | 查询协作、提案协作、审批回放、会话提醒 | server + merchant |
| Compliance & Audit | 隐私、审计、发票合规 | server + merchant + customer |
| Multi-tenant Governance | 多租户隔离、规模化与成本治理 | server + merchant + customer |

---

## 07. 变更协议（PR 必填）

1. 标注 `StepID`。
2. 标注涉及的 `task_id` 列表。
3. 标注 `PointerChange`（no_change / forward / rollback）。
4. 标注 `EvidenceRef`（测试、运行、审阅）。

### 07.1 指针变更流程

1. 当前 Step 所有必需任务达到 `done` 或有明确豁免记录。
2. 必过命令通过。
3. 回填证据账本。
4. 更新第 02 章主路线状态（当前 Step 由 `doing` -> `done`，下一 Step 由 `todo` -> `doing`）。

---

## 08. 新接手流程（30分钟）

1. `npm run bootstrap`
2. `npm run verify`
3. 打开第 02 章，定位 `Status = doing` 的当前 Step，并读取下一条 `todo` Step。
4. 跳转第 03 章找到当前 Step 的三端任务表
5. 执行本端 `todo` 任务并回填证据账本

---

## 09. 角色验收附录

### 09.1 顾客视角验收清单（小程序端）

1. 首次扫码入店可成功进入首页并显示资产卡片。
2. 老用户入店可复用会话，异常 merchantId 可被阻断。
3. 支付核销后账本与发票可查询且一致。
4. 小游戏奖励结算支持幂等，重复请求不重复入账。
5. 小游戏异常时自动降级，不阻断支付主链路。

### 09.2 老板视角验收清单（商户端）

1. 手机号登录链路可用，未绑定时可进入开店流程。
2. 完成开店后可进入工作台，重启应用可恢复会话。
3. 看板可见核心 KPI、趋势与异常告警。
4. 可通过 Agent 发起经营建议并完成一次策略确认。
5. 审批中心可执行确认、查看结果、回放历史。
6. Agent 建议、审批执行与回放结果可关联追溯。
7. Kill Switch 可生效且影响可观测。

---

## 10. 更新日志

1. 2026-03-04：Init version（roadmap baseline established）。
