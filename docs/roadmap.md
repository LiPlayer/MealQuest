# MealQuest 开发路线图（新项目 0-1 · 宏观任务版）

> 规范真源：`docs/specs/mealquest-spec.md`
> 执行真源：`docs/roadmap.md`（本文件）
> 文档定位：只保留可分配给 Agent 的宏观需求任务包；实现细节在后续 plan 模式逐步细化。

## 01. 文档契约

### 01.1 职责边界

1. `spec` 定义目标、边界、治理原则、KPI 口径。
2. `roadmap` 定义宏观任务拆解、跨端依赖、推进状态。
3. 需求变更必须同步更新 `spec + roadmap`。

### 01.2 状态枚举

1. `todo`
2. `doing`
3. `blocked`
4. `done`

### 01.3 推进硬规则

1. 每个 Step 必须同时有 `server`、`merchant`、`customer` 三端任务包。
2. 每个 Step 必须同时定义老板视角与顾客视角完成标准。
3. 每个任务包只描述宏观需求，不写具体实现细节。
4. 每个任务包必须可被单个 Agent 独立领取并推进。

---

## 02. 产品功能完整性矩阵

### 02.1 老板端 App（MealQuestMerchant）

| CapabilityID | 功能域 | 关键界面 | 宏观能力要求 |
| --- | --- | --- | --- |
| MER-C01 | 登录与会话 | 登录页、启动页 | 老板可稳定登录、会话可恢复 |
| MER-C02 | 开店与门店管理 | 开店流程页 | 新店可完成初始化并进入经营态 |
| MER-C11 | 顾客入店码管理 | 入店二维码页 | 可生成、更新、分发入店二维码 |
| MER-C03 | 经营看板 | Dashboard | 可查看经营趋势与商户收益/Uplift 指标 |
| MER-C04 | AI 对话与提案 | Agent 页面 | 可发起 AI 对话并接收策略提案 |
| MER-C05 | 提案决策 | 提案卡、审批入口 | 可同意/驳回策略并留痕 |
| MER-C06 | 审批中心 | Approvals | 可管理审批队列与状态 |
| MER-C07 | 执行回放 | Replay | 可查看策略执行结果与原因 |
| MER-C08 | 风险与紧急停机 | Risk | 可控制预算风险并紧急停机 |
| MER-C09 | 自动化运营 | 自动化配置页 | 可配置触发规则并查看执行日志 |
| MER-C10 | KPI 与发布门 | KPI/发布门面板 | 可基于指标做 Go/No-Go 判断 |
| MER-C12 | 消息与提醒中心 | 顶栏/消息页 | 可接收审批待办、异常告警与系统提醒 |

### 02.2 顾客端小程序（meal-quest-customer）

| CapabilityID | 功能域 | 关键界面 | 宏观能力要求 |
| --- | --- | --- | --- |
| CUS-C01 | 扫码入店 | startup | 顾客可扫码入店并建立会话 |
| CUS-C02 | 资产首页 | index | 资产、权益、活动状态可见 |
| CUS-C03 | 互动触达反馈 | index 活动区 | 触达命中/未命中结果可理解 |
| CUS-C04 | 支付与核销 | 支付链路 | 支付核销稳定，营销异常不阻断主链路 |
| CUS-C05 | 账票查询 | account | 可查看账单与发票信息 |
| CUS-C06 | 生命周期连续体验 | 跨页面链路 | 获客到留存触达体验连续一致 |
| CUS-C07 | 异常降级 | 全局状态提示 | 异常时可降级且有清晰说明 |
| CUS-C08 | 小游戏互动 | 活动入口 | 可参与互动并看到奖励反馈 |
| CUS-C09 | 隐私与账号管理 | account 设置区 | 隐私、授权、注销流程可达 |
| CUS-C10 | 消息订阅与提醒 | account/消息入口 | 可查看消息、管理订阅与提醒偏好 |
| CUS-C11 | 客服与问题反馈 | account/反馈入口 | 可提交问题并跟踪处理状态 |

### 02.3 服务端（MealQuestServer）

| CapabilityID | 功能域 | 宏观能力要求 |
| --- | --- | --- |
| SRV-C01 | 认证与租户隔离 | 商户与顾客身份、租户上下文正确隔离 |
| SRV-C02 | 状态快照与查询 | 三端读取同一业务事实 |
| SRV-C03 | 支付核销 | 支付主链路稳定 |
| SRV-C04 | 账本与发票 | 账务与发票可追溯 |
| SRV-C05 | 策略决策与执行 | 策略可计算、可执行、可约束 |
| SRV-C06 | 审批与审计 | 建议、审批、执行、回放闭环 |
| SRV-C07 | 实验与增量评估 | 支持 A/B 与 Uplift |
| SRV-C08 | 自动化编排 | 支持规则触发与调度 |
| SRV-C09 | KPI 与发布门 | 支持长期指标与发版判定 |
| SRV-C10 | 灰度与回滚 | 支持动态策略灰度和回滚 |
| SRV-C11 | 消息触达中心 | 支持审批提醒、策略结果通知、频控与订阅偏好 |
| SRV-C12 | 反馈与服务治理 | 支持问题反馈、流转处理与服务质量追踪 |

---

## 03. Agent 任务包标准（宏观）

### 03.1 命名规则

1. 任务包命名：`PKG-S{StepID}-{SRV|MER|CUS}-{NN}`。
2. 一个任务包只对应一个主要能力域。
3. 一个任务包由一个 Agent 主责推进。

### 03.2 任务包字段

| 字段 | 说明 |
| --- | --- |
| PackageID | 任务包唯一标识 |
| Lane | 责任端（server/merchant/customer） |
| CapabilityID | 对应能力矩阵 ID |
| Macro Requirement | 宏观需求描述 |
| Deliverable | 宏观交付物（页面/能力/流程/规则） |
| DependsOn | 依赖任务包 |
| Status | 当前状态 |

---

## 04. 主路线（S010-S110）

| StepID | Outcome（宏观结果） | Dependency | Status |
| --- | --- | --- | --- |
| S010 | 长期价值最大化目标口径冻结 | 无 | done |
| S020 | 老板端基础闭环（登录、开店、看板） | S010 done | done |
| S030 | 顾客端基础闭环（扫码、资产、支付、账票） | S020 done | done |
| S040 | 数据与模型基础口径建立 | S030 done | done |
| S050 | 决策与执行治理闭环建立 | S040 done | done |
| S060 | 生命周期五阶段策略闭环建立 | S050 done | done |
| S070 | 老板端 AI 提案与决策闭环 | S060 done | done |
| S080 | 顾客端体验完整性强化 | S070 done | done |
| S090 | 长期 KPI 与发布门建立 | S080 done | done |
| S100 | 营销自动化能力建立 | S090 done | done |
| S110 | 实验与动态优化能力建立 | S100 done | done |

---

## 05. S010-S110 宏观任务包

### S010 - 目标与口径冻结

- 老板视角完成标准：老板端所有策略目标统一为长期价值最大化（执行代理为商户收益与 Uplift）。
- 顾客视角完成标准：顾客侧触达与权益口径一致。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S010-SRV-01 | server | SRV-C05 | 冻结长期价值北极星与商户收益/Uplift 代理口径 | 统一目标口径文档 | none | done |
| PKG-S010-MER-01 | merchant | MER-C04 | 冻结老板端策略文案口径 | 老板端口径映射清单 | PKG-S010-SRV-01 | done |
| PKG-S010-CUS-01 | customer | CUS-C03 | 冻结顾客触达与权益口径 | 顾客端口径映射清单 | PKG-S010-SRV-01 | done |

### S020 - 老板端基础闭环

- 老板视角完成标准：可完成登录、开店、查看经营看板。
- 顾客视角完成标准：老板端基础能力变更不破坏顾客主链路。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S020-SRV-01 | server | SRV-C01 | 建立商户认证与门店上下文能力基线 | 商户认证与门店上下文能力 | none | done |
| PKG-S020-SRV-02 | server | SRV-C02 | 建立入店码状态校验与门店绑定能力 | 入店码校验规则 | PKG-S020-SRV-01 | done |
| PKG-S020-MER-01 | merchant | MER-C01, MER-C02, MER-C03 | 完成老板端登录、开店、看板宏观闭环 | 老板端基础闭环流程 | PKG-S020-SRV-01 | done |
| PKG-S020-MER-02 | merchant | MER-C11 | 完成入店二维码生成与管理能力 | 入店码管理流程 | PKG-S020-SRV-02 | done |
| PKG-S020-CUS-01 | customer | CUS-C01 | 对老板端基础与入店码能力做顾客侧兼容验证 | 顾客兼容性结论 | PKG-S020-MER-02 | done |

### S030 - 顾客端基础闭环

- 老板视角完成标准：老板可观测顾客入店与支付状态。
- 顾客视角完成标准：可完成扫码入店、资产查看、支付核销、账票查询。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S030-SRV-01 | server | SRV-C02, SRV-C03, SRV-C04 | 建立顾客状态、支付、账票基础能力 | 顾客基础能力服务 | none | done |
| PKG-S030-CUS-01 | customer | CUS-C01, CUS-C02, CUS-C04, CUS-C05 | 完成顾客端基础功能闭环 | 小程序基础闭环流程 | PKG-S030-SRV-01 | done |
| PKG-S030-MER-01 | merchant | MER-C11, MER-C03 | 建立老板端入店码运营与顾客状态可见性 | 入店运营可见规则 | PKG-S030-CUS-01 | done |

### S040 - 数据与模型基础

- 老板视角完成标准：老板端指标与策略依据有统一口径。
- 顾客视角完成标准：顾客关键行为进入统一数据口径。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S040-SRV-01 | server | SRV-C02, SRV-C05 | 建立用户/订单/营销/行为数据口径 | 数据口径基线 | none | done |
| PKG-S040-SRV-02 | server | SRV-C05 | 建立 Uplift/流失/响应模型口径 | 模型口径基线 | PKG-S040-SRV-01 | done |
| PKG-S040-MER-01 | merchant | MER-C03, MER-C04 | 建立老板端数据与模型可见口径 | 老板端口径清单 | PKG-S040-SRV-02 | done |
| PKG-S040-CUS-01 | customer | CUS-C03 | 建立顾客端行为与触达口径 | 顾客端口径清单 | PKG-S040-SRV-01 | done |

### S050 - 决策与执行治理

- 老板视角完成标准：可完成提案审批、执行回放、风险停机，并接收关键提醒。
- 顾客视角完成标准：策略执行异常不阻断支付主链路，且触达状态可通知。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S050-SRV-01 | server | SRV-C05, SRV-C06 | 建立策略决策、审批、执行、审计治理能力 | 治理闭环能力 | none | done |
| PKG-S050-SRV-02 | server | SRV-C11 | 建立审批待办与执行结果消息触达能力 | 消息触达规则 | PKG-S050-SRV-01 | done |
| PKG-S050-MER-01 | merchant | MER-C05, MER-C06, MER-C07, MER-C08 | 完成老板端审批、回放、风险控制闭环 | 老板端治理闭环流程 | PKG-S050-SRV-01 | done |
| PKG-S050-MER-02 | merchant | MER-C12 | 建立老板端提醒中心（待办/告警） | 老板端提醒流程 | PKG-S050-SRV-02 | done |
| PKG-S050-CUS-01 | customer | CUS-C04, CUS-C07, CUS-C10 | 建立顾客端执行反馈、降级与消息接收规则 | 顾客端反馈与提醒规则 | PKG-S050-SRV-02 | done |

### S060 - 生命周期五阶段策略闭环

- 老板视角完成标准：五阶段策略可配置、可观察、可调整。
- 顾客视角完成标准：五阶段触达体验连续一致。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S060-SRV-01 | server | SRV-C05 | 建立五阶段策略库（获客/激活/活跃/扩收/留存） | 五阶段策略能力基线 | none | done |
| PKG-S060-MER-01 | merchant | MER-C07 | 建立老板端生命周期策略运营能力 | 生命周期运营流程 | PKG-S060-SRV-01 | done |
| PKG-S060-CUS-01 | customer | CUS-C06, CUS-C08 | 建立顾客端五阶段触达与小游戏联动体验 | 顾客触达连续体验 | PKG-S060-SRV-01 | done |

### S070 - 老板端 AI 提案与决策

- 老板视角完成标准：可进行 AI 对话并完成提案决策。
- 顾客视角完成标准：提案执行后顾客权益变化可理解。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S070-SRV-01 | server | SRV-C05, SRV-C06 | 建立提案可解释与决策支持能力 | 提案解释能力 | none | done |
| PKG-S070-MER-01 | merchant | MER-C04, MER-C05 | 完成老板端 AI 对话、提案同意/驳回闭环 | AI 提案决策流程 | PKG-S070-SRV-01 | done |
| PKG-S070-CUS-01 | customer | CUS-C03 | 建立顾客权益与提案执行一致性规则 | 一致性规则清单 | PKG-S070-SRV-01 | done |

### S080 - 顾客端体验完整性

- 老板视角完成标准：老板可看到顾客体验健康度与反馈汇总。
- 顾客视角完成标准：主路径稳定、反馈明确、隐私流程可达，问题可提交可追踪。
- 老板端界面口径：安卓端底部区域完成安全区适配，Tab 页面隐藏系统顶部栏并以全屏内容区展示。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S080-SRV-01 | server | SRV-C02, SRV-C03, SRV-C04 | 建立顾客关键路径体验质量守卫 | 顾客体验守卫规则 | none | done |
| PKG-S080-SRV-02 | server | SRV-C12 | 建立顾客问题反馈与处理流转能力 | 反馈治理规则 | PKG-S080-SRV-01 | done |
| PKG-S080-CUS-01 | customer | CUS-C02, CUS-C07, CUS-C09, CUS-C11 | 完成小程序关键页面体验、隐私与反馈能力完善 | 顾客端体验完整性清单 | PKG-S080-SRV-02 | done |
| PKG-S080-MER-01 | merchant | MER-C03, MER-C12 | 建立老板端顾客体验健康度与反馈汇总可见能力 | 顾客体验与反馈可见规则 | PKG-S080-CUS-01 | done |

### S090 - 长期 KPI 与发布门

- 老板视角完成标准：可基于 KPI 判定是否发布。
- 顾客视角完成标准：顾客稳定性指标进入发布决策。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S090-SRV-01 | server | SRV-C09 | 建立长期 KPI 与发布门判定能力 | KPI 与发布门基线 | none | done |
| PKG-S090-SRV-02 | server | SRV-C09 | 建立顾客稳定性摘要接口与口径映射能力 | 顾客稳定性摘要服务合同 | PKG-S090-SRV-01 | done |
| PKG-S090-MER-01 | merchant | MER-C10 | 建立老板端 KPI 与 Go/No-Go 面板 | 发布决策面板能力 | PKG-S090-SRV-01 | done |
| PKG-S090-CUS-01 | customer | CUS-C07 | 建立顾客稳定性摘要展示与异常降级规则 | 账户页稳定性模块与降级规则 | PKG-S090-SRV-02 | done |

### S100 - 营销自动化

- 老板视角完成标准：可配置自动化规则并追踪执行结果。
- 顾客视角完成标准：自动触达频率可控、体验可解释、订阅偏好可管理。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S100-SRV-01 | server | SRV-C08, SRV-C11 | 建立自动化触发、编排与触达频控能力 | 自动化能力基线（配置、执行日志、订阅偏好） | none | done |
| PKG-S100-MER-01 | merchant | MER-C09 | 建立老板端自动化配置与日志能力 | 自动化运营流程 | PKG-S100-SRV-01 | done |
| PKG-S100-CUS-01 | customer | CUS-C03, CUS-C07, CUS-C10 | 建立顾客自动触达反馈、降打扰与订阅管理规则 | 自动触达体验规则 | PKG-S100-SRV-01 | done |

### S110 - 实验与动态优化

- 老板视角完成标准：可看到灰度收益、风险与回滚状态。
- 顾客视角完成标准：灰度影响受控，异常可快速回退。

| PackageID | Lane | CapabilityID | Macro Requirement | Deliverable | DependsOn | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-S110-SRV-01 | server | SRV-C07, SRV-C10 | 建立 A/B、Uplift、动态优化灰度能力 | 优化能力基线 | none | done |
| PKG-S110-MER-01 | merchant | MER-C10 | 建立老板端实验与灰度监控能力 | 灰度监控流程 | PKG-S110-SRV-01 | done |
| PKG-S110-CUS-01 | customer | CUS-C07 | 建立顾客端灰度体验守护规则 | 灰度体验守护清单 | PKG-S110-SRV-01 | done |

---

## 06. 并行推进规则

1. 同一步内无依赖任务包可并行推进。
2. `merchant` 与 `customer` 任务包通常依赖对应 `server` 能力包。
3. 跨 Step 仅允许需求澄清，不允许先实现后补文档。
4. 当前推荐推进顺序：`S010 -> S020 -> S030 -> S040 -> ... -> S110`。

### 06.1 测试治理口径（当前生效）

1. 测试命名采用双轨：
  - 阶段验收测试：`<domain>.s{step}.{topic}[.<scope>].test.(ts|tsx|js)`
  - 通用回归测试：`<domain>.<topic>[.<scope>].test.(ts|tsx|js)`
2. `meal-quest-customer/test/e2e` 保持 `*.spec.js` 作为 E2E 命名，不纳入阶段前缀。
3. 服务端测试脚本口径：
  - `test:baseline`：仅执行通用回归集
  - `test:step:s050`：`baseline + S050`
  - `test:step:s060`：`baseline + S050 + S060`
  - `test:step:s110`：`baseline + S050 + S060 + S070 + S080 + S090 + S100 + S110`
4. 当前真源只到 `S110`，`S120+` 测试与脚本不保留在主分支。
5. `docs/qa/traceability-map.json` 为任务包与自动化测试映射清单（仅映射 `docs/roadmap.md` 已定义任务包）。
6. 根校验门 `npm run roadmap:sync` 必须同时满足：
  - `roadmap`、`docs/qa`、`traceability-map` 三方任务包集合一致（不能多、不能少）。
  - `Status=done` 的任务包必须绑定自动化测试文件（`*.test.*` 或 `*.spec.*`）。
  - 测试文件必须按责任端归属映射，且不存在未映射的孤儿测试文件。
7. `S120+` 任务包与阶段测试文件不得进入主分支。
8. `meal-quest-customer` 依赖安全执行“可修尽修 + 风险封账”双轨治理：
  - `npm run audit:customer`：输出当前漏洞摘要（统计与可修复性分类）。
  - `npm run audit:customer:gate`：校验 `docs/security/customer-vulnerability-ledger.json` 与当前漏洞集完全一致（不能多、不能少），并校验每条记录的决策完整性。
  - `npm run audit:customer:gate` 同时要求 `npm audit fix --dry-run` 结果 `added/removed/changed = 0`，若存在非强制可修复变更，必须先修复再记账。
  - 对上游审计源偶发抖动（同一漏洞在 `no_fix` 与 `non_breaking_candidate` 间切换）按“当前不可直接修复”同类风险处理，决策记录仍需完整。
  - 根校验门 `npm run verify` 与 `npm run verify:ci` 必须包含 `audit:customer:gate`。
9. 顾客端环境配置统一为 `.env` 单文件：
  - 构建前必须加载 `meal-quest-customer/.env`，并校验 `TARO_APP_SERVER_URL` 非空且格式合法。
  - 命令行环境变量优先于 `.env`（便于联调与 CI 覆盖）。
  - `TARO_APP_DEFAULT_STORE_ID` 不再支持，禁止通过环境变量默认入店。
  - 入店仅允许扫码参数或 `lastStore` 回访；两者缺失时必须跳转 `startup`。
  - `.env.development/.env.production/.env.test` 不再支持，检测到即构建失败并提示迁移。

---

## 07. 排障索引（宏观）

| Triage Key | 问题类型 | Owner |
| --- | --- | --- |
| RB-DOC-010 | 目标口径不一致 | product + server |
| RB-FOUND-020 | 老板端基础闭环缺口 | merchant + server |
| RB-ENTRY-025 | 入店码生成或扫码链路缺口 | merchant + customer + server |
| RB-FOUND-030 | 顾客端基础闭环缺口 | customer + server |
| RB-GOV-050 | 决策执行治理缺口 | server + merchant |
| RB-NOTIFY-055 | 提醒中心或触达频控缺口 | server + merchant + customer |
| RB-LIFE-060 | 生命周期策略闭环缺口 | server + merchant + customer |
| RB-FEEDBACK-080 | 顾客反馈流转缺口 | customer + merchant + server |
| RB-KPI-090 | KPI 与发布门缺口 | server + merchant + customer |
| RB-OPT-110 | 实验与动态优化缺口 | server + ds |

---

## 08. 变更协议（PR 必填）

1. 变更摘要（宏观需求范围）
2. 影响范围（server/merchant/customer/docs）
3. 更新了哪些任务包状态
4. 风险与回滚方案
5. 是否同步更新 `spec + roadmap`

---

## 09. 更新日志（仅修改 roadmap 核心内容时记录）

1. 2026-03-05：改为“宏观任务版”路线图，移除实现级拆解。
