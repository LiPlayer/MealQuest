# MealQuest 商业化落地规范（V16.0）

> 文档定位：MealQuest 产品与商业规范真源（唯一真源）。
> 适用范围：`MealQuestServer`、`MealQuestMerchant`、`meal-quest-customer` 三端协同建设。

## 0. 版本与治理

- 版本：V16.0（新项目基线：长期价值最大化 + 生命周期五阶段）
- 首发区域：中国大陆
- 目标客群：单店与小连锁餐饮商户
- 商业主轴：支付抽佣为主，订阅与增值服务为辅
- 变更规则：任何功能、策略、风控或合规变更，必须先更新本规范，再进入研发

### 0.1 当前生效口径

- 营销系统目标：长期价值最大化（Long-term Value Maximization）
- 问题类型：长期收益优化问题（Long-term Optimization Problem）
- 核心矛盾：短期营销动作（发券、补贴、活动）服务长期价值（LTV）
- 核心原则：以长期价值为北极星，用商户收益与 Uplift 作为执行代理指标

### 0.2 三端交付完整性原则

- 路线图每个 Step 必须同时定义 server、merchant、customer 三端任务
- 路线图每个 Step 必须同时定义老板视角与顾客视角验收点
- 路线图任务以宏观需求包表达，具体实现细化在后续 plan 模式推进
- 任何一端任务缺失，视为该 Step 未完成

---

## 1. 北极星目标与核心原则

### 1.1 北极星目标

构建面向中小餐饮商户的“私域经营操作系统”：
- 对商户：降低运营复杂度，稳定提升长期净收益
- 对顾客：在支付与互动中获得即时价值与资产沉淀
- 对平台：建立可复制、可审计、可规模化的长期增长体系

### 1.2 不变原则

- 无请求不决策：系统不替商户做未授权决策
- 无确认不执行：营销与资金相关动作必须人工确认后执行
- 利润优先于活跃：先保护毛利与风险边界，再追求增长
- 支付主链路优先：营销异常不得阻断支付、核销、账务、发票
- 先闭环后扩张：先交付可回归闭环，再扩展算法复杂度

---

## 2. 生命周期策略体系（客户生命周期）

### 2.1 五阶段定义（当前主分类）

1. 获客（Acquisition）
2. 激活（Activation）
3. 活跃（Engagement）
4. 扩展收入（Expansion）
5. 留存（Retention）

### 2.2 五阶段策略示例（当前生效）

- 获客阶段：让新餐厅知道产品
  - 常见方式：地推、广告、内容营销、渠道合作
- 激活阶段：让客户真正开始使用系统
  - 常见动作：创建菜单、设置会员、使用收银
- 活跃阶段：让客户持续使用
  - 常见动作：查看数据、使用营销工具
- 扩展收入阶段：扩展商户收入
  - 常见动作：升级套餐、购买更多功能
- 留存阶段：减少客户流失
  - 常见动作：沉默召回、分层关怀、留存激励

### 2.3 小游戏 模块定位

- 小游戏 是互动能力底座，不是独立生命周期阶段
- 通过触达、互动、奖励、资格判定能力服务五阶段策略
- 异常时必须降级且不影响支付主链路

---

## 3. 长期价值目标函数（北极星）与执行代理指标

### 3.1 北极星目标函数（长期价值最大化）

```text
长期价值（Long-term Value） = Σ(客户生命周期长期价值贡献 - 营销成本)
```

解释：
- 长期价值：商户长期净收益、留存质量与可持续增长能力的综合结果
- 营销成本：优惠券、补贴、活动资源与触达成本

目标：

```text
最大化长期价值
```

即最大化长期收益，而非单次转化。

### 3.2 执行代理指标（当前决策主输入）

当前策略排序与执行用以下代理指标落地：
- 商户净收益提升（Merchant Net Profit Uplift）
- 商户收入提升（Merchant Revenue Uplift）
- Uplift 命中率（Uplift Hit Rate）

说明：
- 代理指标服务北极星目标，不替代长期价值目标
- 平台侧保留成本观测（服务器、LLM Token），当前不作为决策硬门
- 服务端 objective 合同固定：`targetMetric = MERCHANT_LONG_TERM_VALUE_30D`，`windowDays = 30`

---

## 4. 营销系统四层架构（当前生效）

```text
数据层
↓
模型层
↓
决策层
↓
执行层
```

### 4.1 数据层（Data Layer）

基础数据域：
- 用户数据：用户ID、消费历史、访问频率、偏好、会员等级
- 订单数据：订单金额、商品、时间、门店、支付方式
- 营销数据：优惠券、活动、曝光、点击、使用
- 行为数据：浏览、点击、搜索、加购

数据仓储：
- 数据进入可审计的数据仓体系（如 BigQuery、Snowflake、ClickHouse）
- 口径要求：可追溯、可回放、可对账

#### 4.1.1 数据口径基线接口（S040-SRV-01）

- 接口：`GET /api/state/contract`
- 角色：`OWNER / MANAGER / CLERK`
- 作用域：默认返回全局口径；可选 `merchantId` 返回该商户覆盖摘要
- 鉴权规则：
  - 若携带 `merchantId` 且与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
  - `merchantId` 不存在时返回 `404 merchant not found`
- 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

响应口径（核心字段）：
- `version`：当前口径版本（`S040-SRV-01.v1`）
- `objective`：`LONG_TERM_VALUE_MAXIMIZATION`
- `proxyMetrics`：`MerchantProfitUplift30`、`MerchantRevenueUplift30`、`UpliftHitRate30`
- `dataDomains`：用户/订单/营销/行为四域的数据源、主键、必需字段
- `events`：当前系统可观测事件与来源映射
- `merchantCoverage`（可选）：四域记录数、最近更新时间、缺失域列表、事件覆盖

#### 4.1.2 顾客端行为与触达口径可见（S040-CUS-01）

- 入口位置：
  - 首页活动区：展示触达命中/未命中解释
  - 账户页摘要：展示行为信号与最近触达结果
- 展示原则：
  - 优先展示用户可理解文案（例如“当前条件未满足”“今日触达次数已达上限”）
  - 可选展示原因码（`reasonCode`）用于客服与排障定位
- 降级策略：
  - 口径数据异常时，提示“口径暂不可用”，但不得阻断支付、账票、资产主链路

### 4.2 模型层（Model Layer）

模型目标：预测长期价值趋势与可执行增量收益。

核心模型：
- 商户收益 Uplift 预测：输出 `预测商户收益提升`
- 流失预测：输出 `流失概率`
- 响应预测：输出 `转化概率`

算法族（示例）：
- 梯度提升模型（Gradient Boosting）
- 随机森林（Random Forest）
- 深度学习（Deep Learning）

#### 4.2.1 模型口径基线接口（S040-SRV-02）

- 接口：`GET /api/state/model-contract`
- 角色：`OWNER / MANAGER / CLERK`
- 作用域：默认返回全局模型口径；可选 `merchantId` 返回该商户模型覆盖摘要
- 鉴权规则：
  - 若携带 `merchantId` 且与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
  - `merchantId` 不存在时返回 `404 merchant not found`
- 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

响应口径（核心字段）：
- `version`：当前模型口径版本（`S040-SRV-02.v1`）
- `objectiveContract`：`targetMetric = MERCHANT_LONG_TERM_VALUE_30D`，`windowDays = 30`
- `modelSignals`：`upliftProbability`、`churnProbability`、`responseProbability`、`expectedMerchantProfitLift30d` 等字段合同
- `decisionFormula`：
  - `effectiveProbability = upliftProbability * responseProbability * (1 - churnProbability)`
  - `expectedValueProxy = effectiveProbability * expectedMerchantProfitLift30d - marketingCost - riskPenalty - fatiguePenalty`
- `merchantCoverage`（可选）：已发布策略数量、模型信号就绪数量、缺失模型信号的策略列表

#### 4.2.2 老板端口径可见（S040-MER-01）

- 展示入口：
  - 经营看板（Dashboard）：展示数据口径与模型口径摘要
  - AI 协作页（Agent）：展示口径快照，确保提案解释口径一致
- 展示要点：
  - 数据口径版本、模型口径版本
  - 目标指标（`MERCHANT_LONG_TERM_VALUE_30D`）与窗口（30 天）
  - 核心公式：`uplift × response × (1 - churn)`
  - 关键覆盖摘要（数据域、事件、模型信号）
- 降级要求：
  - 口径接口异常时显示“口径数据暂不可用”并支持重试
  - 异常不得阻断老板端看板与 Agent 主流程

### 4.3 决策层（Decision Layer）

决策问题：
- 什么时候做营销
- 给谁营销
- 发什么优惠

基础决策公式：

```text
有效概率（Effective Probability） = Uplift 概率 × 响应概率 × (1 - 流失概率)
期望长期收益代理值（Expected Long-term Proxy） = 有效概率 × 期望商户净收益提升
```

当前治理要求：
- 决策层负责建议排序
- 执行层硬门（预算/风险/毛利）负责最终可执行性

#### 4.3.1 决策与执行治理接口（S050-SRV-01）

为支持老板端审批中心、执行回放与风险治理视图，服务端提供以下治理查询接口：

- 接口：`GET /api/policyos/governance/overview`
  - 角色：`OWNER / MANAGER`
  - 作用：返回治理闭环总览（待审批、待发布、活跃策略、暂停策略、24h 决策结果、24h 审计状态、熔断状态）
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

- 接口：`GET /api/policyos/governance/approvals`
  - 角色：`OWNER / MANAGER`
  - 作用：返回审批队列，支持 `status=ALL|SUBMITTED|APPROVED|PUBLISHED`
  - 输出：`draftId`、`policyKey`、`status`、`submittedAt`、`approvalId`、`publishedPolicyId` 等治理字段
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

- 接口：`GET /api/policyos/governance/replays`
  - 角色：`OWNER / MANAGER`
  - 作用：返回执行回放列表，支持 `event`、`mode`、`outcome` 过滤
  - 输出：`decisionId`、`traceId`、`outcome`、`executed`、`rejected`、`reasonCodes`、`createdAt`
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

作用域与安全要求：
- 若携带 `merchantId` 且与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
- `merchantId` 不存在时返回 `404 merchant not found`
- 顾客角色不可访问治理接口

### 4.4 执行层（Execution Layer）

- 规则引擎驱动触发与路由（规则引擎）
- 审批链路：草稿 -> 提交 -> 审批 -> 发布
- 审计链路：建议 -> 确认 -> 执行 -> 回放 全程留痕
- 熔断与降级：策略异常可一键停机与自动过期

#### 4.4.1 消息触达中心接口（S050-SRV-02）

为支撑老板端提醒中心与顾客消息接收，服务端提供收件箱查询 + 实时推送能力：

- 接口：`GET /api/notifications/inbox`
  - 角色：`OWNER / MANAGER / CLERK / CUSTOMER`
  - 作用：查询当前登录主体的消息收件箱
  - 过滤：`status=ALL|UNREAD|READ`、`category=ALL|APPROVAL_TODO|EXECUTION_RESULT|FEEDBACK_TICKET`
  - 分页：`limit` + `cursor`
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

- 接口：`GET /api/notifications/unread-summary`
  - 角色：`OWNER / MANAGER / CLERK / CUSTOMER`
  - 作用：返回当前登录主体未读总数与分类统计
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

- 接口：`POST /api/notifications/read`
  - 角色：`OWNER / MANAGER / CLERK / CUSTOMER`
  - 作用：单条或批量已读回执（`notificationIds` 或 `markAll`）
  - 边界：仅允许标记当前登录主体自己的消息

触发规则（当前生效）：
- `POLICY_DRAFT_SUBMIT` 成功后，向老板侧发送 `APPROVAL_TODO`
- `POLICY_EXECUTE` 成功后，向老板侧与命中顾客发送 `EXECUTION_RESULT`

实时推送：
- WebSocket 事件：`NOTIFICATION_CREATED`、`NOTIFICATION_READ`
- 推送范围：按 `merchantId + recipient` 定向推送，不做跨主体广播

作用域与安全要求：
- 若携带 `merchantId` 且与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
- `merchantId` 不存在时返回 `404 merchant not found`
- 顾客角色必须具备自身 `userId` 身份才能查询或回执消息

#### 4.4.2 老板端治理闭环（S050-MER-01）

老板端 App 在 S050 阶段必须落地“审批中心 + 执行回放 + 风险控制”闭环，不再使用占位页。

- 审批中心（Approvals）
  - 接入 `GET /api/policyos/governance/overview` 与 `GET /api/policyos/governance/approvals`
  - 支持 `status=ALL|SUBMITTED|APPROVED|PUBLISHED` 过滤
  - `OWNER` 可执行：
    - 草稿审批：`POST /api/policyos/drafts/{draftId}/approve`
    - 策略发布：`POST /api/policyos/drafts/{draftId}/publish`
  - `MANAGER` 仅可查看，不可执行审批/发布动作

- 执行回放（Replay）
  - 接入 `GET /api/policyos/governance/replays`
  - 支持 `mode`、`outcome`、`event` 过滤
  - 回放卡片需展示：`decisionId`、`traceId`、`outcome`、`reasonCodes`、`createdAt`
  - 用于老板侧解释“为何命中/为何拦截/为何无策略”

- 风险控制（Risk）
  - 风险页接入治理总览，展示待审批、活跃/暂停策略、24h 命中/拦截与停机状态
  - `OWNER` 可执行紧急停机：
    - `POST /api/merchant/kill-switch`
  - `OWNER` 可执行策略启停：
    - 暂停：`POST /api/policyos/policies/{policyId}/pause`
    - 恢复：`POST /api/policyos/policies/{policyId}/resume`
  - 非 OWNER 角色仅可查看风险状态，不可执行启停动作

降级要求：
- 审批/回放/风险任一接口异常时，页面显示错误并允许刷新重试
- 异常不得影响老板端登录、看板、支付链路相关可见能力

#### 4.4.3 老板端提醒中心（S050-MER-02）

老板端 App 在 S050 阶段需落地独立提醒中心入口，用于承接审批待办与执行结果触达。

- 入口与信息架构
  - 在老板端底部导航增加“提醒”Tab，不与审批页合并
  - 提醒页展示未读摘要、筛选器、提醒列表和已读操作

- 接口接入（当前生效）
  - 收件箱：`GET /api/notifications/inbox`
  - 未读汇总：`GET /api/notifications/unread-summary`
  - 已读回执：`POST /api/notifications/read`
  - 默认刷新策略：进入页面拉取 + 手动刷新（不强制实时推送）

- 交互与行为要求
  - 支持按 `status=ALL|UNREAD|READ` 和 `category=ALL|APPROVAL_TODO|EXECUTION_RESULT|FEEDBACK_TICKET` 过滤
  - 支持单条“标记已读”和“全部已读”
  - 支持基于 `cursor` 的分页加载（Load More）
  - 已读成功后列表状态与未读统计需同步更新

- 降级要求
  - 任一提醒接口异常时，页面显示错误并提供刷新重试
  - 异常不得阻断老板端其他治理页面（审批/回放/风控）使用

#### 4.4.4 顾客端执行反馈与消息接收（S050-CUS-01）

顾客端在 S050 阶段需建立“执行反馈 + 异常降级 + 消息接收”闭环，覆盖支付主链路保护与触达结果可见。

- 执行反馈（触达可解释）
  - 首页活动区与账户页继续展示命中/未命中反馈
  - 对未命中场景展示可理解解释文案与可选原因码，支持客服排障

- 消息接收入口（当前生效）
  - 入口形态：账户页内消息区，不新增独立消息页面
  - 接口接入：
    - 收件箱：`GET /api/notifications/inbox`
    - 未读汇总：`GET /api/notifications/unread-summary`
    - 已读回执：`POST /api/notifications/read`

- 已读策略（当前生效）
  - 顾客进入账户页后自动执行已读回执（`markAll=true`）
  - 自动已读后需刷新未读统计与列表状态，保持展示一致

- 降级要求
- 消息接口异常时，仅消息区降级并提示“提醒暂不可用，可稍后刷新”
- 降级不得阻断支付核销、账票查询、账户注销等主链路功能

#### 4.4.5 五阶段策略库基线接口（S060-SRV-01）

为支撑老板端生命周期运营与顾客端连续触达，服务端在 S060 阶段新增“五阶段策略库”读写基线能力。

- 接口：`GET /api/merchant/strategy-library`
  - 角色：`OWNER / MANAGER / CLERK`
  - 作用：查询商户五阶段策略库状态（获客/激活/活跃/扩收/留存）
  - 输出核心字段：
    - `catalogVersion`、`catalogUpdatedAt`
    - `items[]`：`stage`、`templateId`、`templateName`、`triggerEvent`、`policyKey`、`branchId`、`status`、`hasPublishedPolicy`、`lastPolicyId`、`updatedAt`
  - 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

- 接口：`POST /api/merchant/strategy-library/{templateId}/enable`
  - 角色：`OWNER`
  - 作用：启用指定生命周期模板（可选 `branchId`，默认模板默认分支）
  - 响应核心字段：
    - `stage`、`templateId`、`branchId`、`policyKey`
    - `status`、`hasPublishedPolicy`、`policyId`、`alreadyEnabled`、`updatedAt`
  - 约束：
    - 同模板同分支重复启用应幂等返回（`alreadyEnabled=true`）
    - 启用新版本后，旧的同模板已发布策略自动暂停
    - `revenue_addon_upsell_slow_item` 通过既有扩收配置链路启用，保持与扩收配置口径一致

当前五阶段模板基线：
- 获客：`acquisition_welcome_gift`
- 激活：`activation_checkin_streak_recovery`
- 活跃：`engagement_daily_task_loop`（S060 新增）
- 扩收：`revenue_addon_upsell_slow_item`
- 留存：`retention_dormant_winback_14d`

老板端看板补充：
- `GET /api/merchant/dashboard` 新增 `engagementSummary` 汇总字段，用于活跃阶段命中/拦截可见化。

#### 4.4.6 老板端生命周期策略运营（S060-MER-01）

老板端在 S060 阶段需建立“生命周期策略运营 + 回放联动”能力，形成可观察、可启用、可追踪闭环。

- 入口与信息架构（当前生效）
  - 复用老板端 `Replay` 页面承载生命周期运营区域，不新增独立 Tab
  - `Dashboard` 提供生命周期运营入口，支持跳转到回放页
  - 生命周期运营区与执行回放区并存，互不阻断

- 接口接入（当前生效）
  - 策略库查询：`GET /api/merchant/strategy-library`
  - 阶段启用：`POST /api/merchant/strategy-library/{templateId}/enable`
  - 回放查询：`GET /api/policyos/governance/replays`
  - 看板摘要：`GET /api/merchant/dashboard`（含 `engagementSummary`）

- 角色与权限（当前生效）
  - `OWNER`：可逐阶段启用策略模板
  - `MANAGER / CLERK`：只读查看策略状态与回放，不可执行启用
  - 非 OWNER 在页面需看到明确权限提示（不可静默失败）

- 生命周期运营展示要求（当前生效）
  - 五阶段必须完整可见：获客/激活/活跃/扩收/留存
  - 每阶段至少展示：`stage`、`templateName/templateId`、`status`、`triggerEvent`、`lastPolicyId`、`updatedAt`
  - 支持手动刷新策略库与状态回读，便于老板校验启用结果

- 降级要求
  - 生命周期策略接口异常时，仅生命周期区域降级并可重试
  - 回放筛选与列表能力不得被生命周期区域异常阻断
  - 异常不得影响老板端审批、风控、提醒等既有治理流程

#### 4.4.7 顾客端五阶段触达连续体验（S060-CUS-01）

顾客端在 S060 阶段需建立“五阶段触达连续体验 + 小游戏联动反馈”能力，确保从入店到账户中心的体验口径一致。

- 生命周期连续体验（当前生效）
  - 覆盖五阶段：获客 / 激活 / 活跃 / 扩收 / 留存。
  - 首页需展示五阶段触达状态（已命中/未命中/进行中）与可理解解释文案。
  - 账户页需展示五阶段阶段记录，与首页触达口径保持一致。
  - 兼容历史标签映射：`WELCOME/NEW/ACQUISITION` -> 获客，`ACTIVATION/HOT` -> 激活，`ENGAGEMENT/PLAY` -> 活跃，`REVENUE/EXPANSION/PAY` -> 扩收，`RETENTION/CARE` -> 留存。

- 小游戏联动反馈（当前生效）
  - 首页与账户页需可见小游戏联动摘要：可收集奖励数、已解锁互动数、最近互动数。
  - 顾客可查看最近互动反馈项（标题、说明、奖励信息），用于理解互动与权益到账关系。
  - 小游戏模块是生命周期策略的互动反馈通道，不独立成新阶段。

- 入口一致性与文案要求（当前生效）
  - 启动页明确提示顾客可查看生命周期触达进度与小游戏联动反馈。
  - 首页、账户页、启动页三处文案需保持同一业务语义，不得出现互相冲突口径。

- 降级要求
  - 触达或小游戏数据异常时，仅对应模块降级并提示“暂不可用/稍后刷新”。
  - 支付核销、账票查询、账户注销等主链路不得受影响。

#### 4.4.8 AI 提案可解释与决策支持（S070-SRV-01）

服务端在 S070 阶段需建立“提案生成 + 可解释评估 + 同意/驳回决策”能力，作为老板端 AI 提案闭环的后端基线。

- 提案生命周期（当前生效）
  - `PENDING`：提案已生成，待老板决策
  - `APPROVED`：提案已审批，待发布
  - `PUBLISHED`：提案已发布为策略
  - `REJECTED`：提案已驳回

- 提案接口（当前生效）
  - 生成提案：`POST /api/agent-os/proposals/generate`
  - 提案列表：`GET /api/agent-os/proposals`
  - 提案详情：`GET /api/agent-os/proposals/{proposalId}`
  - 提案评估：`POST /api/agent-os/proposals/{proposalId}/evaluate`
  - 提案决策：`POST /api/agent-os/proposals/{proposalId}/decide`

- 决策语义（当前生效）
  - `decision=APPROVE`：默认执行“同意即发布”（审批+发布）
  - `decision=REJECT`：提案进入驳回状态并记录原因
  - 同意前自动执行评估，写入可解释结果（命中、拦截、原因码、风险标记、预算相关信息）

- 权限与作用域（当前生效）
  - `OWNER / MANAGER`：可读提案、可发起评估
  - `OWNER`：可执行最终决策（同意/驳回）
  - 若 `merchantId` 与登录态不一致，返回 `403 merchant scope denied`

- 审计要求（当前生效）
  - 提案生成、评估、决策需写入审计日志并可回放追踪
  - 审计动作包含：`AGENT_PROPOSAL_GENERATE`、`AGENT_PROPOSAL_EVALUATE`、`AGENT_PROPOSAL_DECIDE`

#### 4.4.9 老板端 AI 提案决策闭环（S070-MER-01）

老板端 App 在 S070 阶段需建立“AI 对话 + 提案决策”一体化流程，确保提案从意图输入到最终同意/驳回可闭环。

- 入口与流程（当前生效）
  - 入口：`Agent` 页新增“提案决策区”。
  - 老板可基于当前输入意图或最近一次对话内容生成提案。
  - 提案区需支持列表、筛选、详情查看与手动刷新。

- 决策动作（当前生效）
  - 提案列表状态：`ALL`、`PENDING`、`APPROVED`、`PUBLISHED`、`REJECTED`。
  - 评估动作：接入 `POST /api/agent-os/proposals/{proposalId}/evaluate`，回填可解释结果（原因码、风险标记、评估时间等）。
  - 同意动作：接入 `POST /api/agent-os/proposals/{proposalId}/decide` 且 `decision=APPROVE`，语义为“同意即发布”。
  - 驳回动作：接入 `POST /api/agent-os/proposals/{proposalId}/decide` 且 `decision=REJECT`，驳回原因需可填写并回显。

- 角色与权限（当前生效）
  - `OWNER`：可生成、评估、同意、驳回。
  - `MANAGER`：可生成、评估、查看，不可同意/驳回。
  - 角色权限不足时需明确文案提示，不可静默失败。

- 降级与可用性（当前生效）
  - 提案接口异常时，仅提案区降级并提示重试。
  - AI 对话流式能力与提案区相互隔离，单侧异常不得阻断另一侧主流程。

#### 4.4.10 顾客权益与提案执行一致性规则（S070-CUS-01）

顾客端在 S070 阶段需建立“提案执行结果 -> 顾客权益变化”的一致性解释规则，确保顾客能理解为何命中/未命中。

- 一致性真源（当前生效）
  - 顾客侧“最新权益变更说明”以 `EXECUTION_RESULT` 通知为优先真源。
  - 当通知不可用时，回退使用 `touchpointContract` 触达摘要说明。
  - 当通知与触达摘要出现冲突，页面需明确提示“以最新执行结果为准”。

- 展示要求（当前生效）
  - 首页新增“最新权益变更说明”区，展示最近执行结果的用户可理解文案。
  - 账户页新增“提案执行一致性记录”区，展示最近执行结果（阶段、结果、解释、时间）。
  - 展示可读结果标签：`已命中 / 未执行 / 未命中 / 进行中`。
  - 可展示原因码对应的友好解释文案，不展示 `decisionId`、`event` 等技术字段。

- 规则要求（当前生效）
  - 复用原因码友好映射规则，未知原因码统一降级为“暂未命中当前活动条件”。
  - 执行结果分类与文案生成需可复用，避免首页与账户页口径不一致。

- 降级要求（当前生效）
  - 通知接口异常时，仅一致性区降级并提示“暂不可用，可稍后刷新”。
  - 降级不得阻断资产、支付、账票、注销等主链路。

#### 4.4.11 顾客关键路径体验质量守卫（S080-SRV-01）

服务端在 S080 阶段需建立“顾客关键路径体验质量守卫”能力，面向老板端提供可观测、可追踪的主路径健康快照。

- 守卫接口（当前生效）
  - 查询接口：`GET /api/state/experience-guard`
  - 查询参数：
    - `merchantId`：商户标识（可显式传入，或由登录态商户上下文推导）
    - `windowHours`：观测窗口小时数（可选，默认 24，最大 168）
  - 返回结构需包含：总健康状态、健康分、路径级结果、告警列表。

- 权限与作用域（当前生效）
  - `OWNER / MANAGER`：可查询守卫快照。
  - `CLERK / CUSTOMER`：不可查询。
  - 跨商户访问返回 `403 merchant scope denied`。

- 关键路径覆盖（当前生效）
  - 入店会话路径：观测顾客入店会话活跃度与新增入店规模。
  - 支付结算路径：观测支付成功、失败、挂起情况与成功率。
  - 账务链路路径：观测支付、账本、发票、审计的闭环完整性。
  - 隐私流程路径：观测隐私导出/删除/注销请求成功率。

- 风险分级（当前生效）
  - 路径状态统一分级为：`HEALTHY / WARNING / RISK / NO_DATA`。
  - 总状态按“风险优先”聚合：任一路径 `RISK` 时总状态为 `RISK`。
  - 守卫输出必须包含可读告警文案，供老板端直接消费。

- 可用性与缓存（当前生效）
  - 守卫接口支持 `ETag` 与 `If-None-Match`，命中返回 `304`。
  - 接口受租户策略限制能力约束，操作标识：`CUSTOMER_EXPERIENCE_GUARD_QUERY`。

#### 4.4.12 顾客问题反馈与处理流转（S080-SRV-02）

服务端在 S080 阶段需建立“顾客反馈工单 + 老板处理流转 + 顾客进展可见”能力，作为顾客端反馈入口与老板端反馈汇总的统一后端基线。

- 反馈接口（当前生效）
  - 顾客提单：`POST /api/feedback/tickets`
  - 工单列表：`GET /api/feedback/tickets`
  - 工单详情：`GET /api/feedback/tickets/{ticketId}`
  - 状态流转：`POST /api/feedback/tickets/{ticketId}/transition`
  - 汇总看板：`GET /api/feedback/summary`

- 状态机与流转规则（当前生效）
  - 工单状态：`OPEN`、`IN_PROGRESS`、`RESOLVED`、`CLOSED`。
  - 合法流转：
    - `OPEN -> IN_PROGRESS`
    - `IN_PROGRESS -> RESOLVED`
    - `RESOLVED -> IN_PROGRESS | CLOSED`
    - `CLOSED -> IN_PROGRESS`（重开）
  - 非法状态跳转返回冲突错误（`409`）。

- 权限与作用域（当前生效）
  - `CUSTOMER`：可提交反馈、查询本人反馈列表与详情。
  - `OWNER / MANAGER`：可查询商户反馈列表/详情、处理状态流转、查看汇总。
  - `CLERK`：不可访问反馈治理接口。
  - 跨商户访问返回 `403 merchant scope denied`。

- 通知联动（当前生效）
  - 顾客提单后，向商户 `OWNER / MANAGER` 发送反馈提醒通知。
  - 老板端更新工单状态后，向对应顾客发送进展通知。
  - 反馈通知分类使用 `FEEDBACK_TICKET`，支持后续三端统一筛选。

- 审计与租户治理（当前生效）
  - 审计动作：`FEEDBACK_CREATE`、`FEEDBACK_QUERY`、`FEEDBACK_TRANSITION`、`FEEDBACK_SUMMARY_QUERY`。
  - 租户策略操作标识：
    - `FEEDBACK_CREATE`
    - `FEEDBACK_QUERY`
    - `FEEDBACK_TRANSITION`
    - `FEEDBACK_SUMMARY_QUERY`
- 反馈查询类接口支持 `ETag` 与 `If-None-Match` 缓存协商。

#### 4.4.13 顾客端体验完整性增强（S080-CUS-01）

顾客端在 S080 阶段需完成“账户页内反馈闭环 + 隐私流程可达 + 消息分类一致性”能力，确保问题可提交、可追踪，且主链路不被阻断。

- 反馈入口与提交（当前生效）
  - 入口形态：账户页内嵌“问题反馈”区，不新增独立页面。
  - 仅支持文本反馈（标题、描述、联系方式），不支持附件上传。
  - 提交接口：`POST /api/feedback/tickets`。
  - 提交成功后需给出即时反馈，并刷新反馈记录列表。

- 反馈进展可见（当前生效）
  - 列表接口：`GET /api/feedback/tickets`，展示工单状态与更新时间。
  - 详情接口：`GET /api/feedback/tickets/{ticketId}`，展示状态流转时间线。
  - 状态展示口径与服务端状态机一致：`OPEN`、`IN_PROGRESS`、`RESOLVED`、`CLOSED`。

- 消息分类一致性（当前生效）
  - 顾客端消息分类需支持 `FEEDBACK_TICKET`，与服务端通知分类保持一致。
  - 账户页消息摘要需可见反馈进展未读计数。

- 隐私与注销流程（当前生效）
  - 账户页需明确展示注销影响说明（非交易数据删除、交易账票按法规保留）。
  - 注销采用二次确认，失败时返回用户可理解提示。
  - 隐私/反馈模块异常仅局部降级，不得阻断支付、账票、资产等主链路。

#### 4.4.14 老板端顾客体验与反馈可见（S080-MER-01）

老板端在 S080 阶段需建立“看板体验健康度 + 提醒中心反馈汇总”可见能力，保证老板可感知顾客主路径风险与反馈处理压力。

- 看板体验健康度（当前生效）
  - 看板新增“顾客体验健康度”模块。
  - 接口接入：`GET /api/state/experience-guard`。
  - 展示要素：总体状态、健康分、路径分布、路径级摘要与风险告警。

- 提醒中心反馈汇总（当前生效）
  - 提醒中心未读摘要增加 `FEEDBACK_TICKET` 分类统计。
  - 提醒筛选增加 `FEEDBACK_TICKET` 分类。
  - 新增反馈汇总只读区，接口接入：`GET /api/feedback/summary`。
  - 汇总区展示：工单总数、未解决数、已解决数、状态分布、最近工单。

- 角色与权限（当前生效）
  - `OWNER / MANAGER`：可查询并展示体验健康度与反馈汇总。
  - `CLERK`：模块可见但仅展示权限受限提示，不发起受限接口请求。

- 降级要求（当前生效）
  - 体验守卫或反馈汇总接口异常时，仅对应模块降级并支持刷新重试。
  - 异常不得阻断提醒列表、筛选、已读回执等既有功能。

---

## 5. 补贴效率与长期最优

### 5.1 错误补贴问题（补贴浪费）

- 反模式：给所有人发券
- 风险：对“本来就会消费”的人补贴，造成资源浪费

### 5.2 增量建模（Uplift，P2）

目标：估计营销动作带来的增量收益：

```text
增量效果（Uplift） = 干预组结果 - 对照组结果
```

原则：只补贴被优惠真正影响的人群。

### 5.3 动态优化（P3）

- 单次最优不等于长期最优
- 今日补贴影响未来消费、留存与价格敏感度
- P3 引入强化学习（RL）进行长期奖励优化（受控灰度）

---

## 6. 实验系统与营销自动化

### 6.1 A/B 实验（P2）

- 实验组 / 对照组
- 核心指标：收入提升、留存提升
- 定位：当前版本规划能力，不作为 P1 发布硬门

### 6.2 营销自动化（自动化）

规则触发示例：
- 用户 7 天未消费 -> 召回券
- 用户生日 -> 生日券
- 用户消费达阈值 -> 会员升级

要求：
- 自动化触发必须可配置、可审计、可熔断
- 自动化不绕过预算/风险/毛利/审批边界

---

## 7. 产品范围（范围内/范围外）

### 7.1 范围内（当前版本必须实现）

- 商户端：登录、开店、入店二维码管理、经营看板、智能助手（Agent） 提案、审批中心、执行回放、紧急停机、消息提醒
- 顾客端：扫码入店、资产展示、互动触达、支付核销、账票查询、消息订阅、问题反馈
- 服务端：认证、支付、发票、隐私、策略治理、执行审计、多租户隔离、消息触达、反馈流转
- 策略系统：五阶段策略闭环 + 小游戏 互动能力底座

### 7.2 范围外（当前版本明确不做）

- 点餐流程、后厨 KDS、桌台管理
- 采购、库存进销存、供应链系统
- 顾客侧与店长侧 智能助手（Agent） 商用开放
- 将 A/B 与 Uplift 作为 P1 发布硬门

---

## 8. 商业 KPI 与发布门

### 8.1 核心 KPI（长期口径）

- `MerchantNetProfit30`
- `LongTermValueIndex`
- `MerchantProfitUplift30`
- `MerchantRevenueUplift30`
- `UpliftHitRate30`
- `Retention30`
- `SubsidyWasteProxy`
- `PlatformCost30`（观测项）
- 支付成功率 >= 99.5%
- 风险损失（套利/欺诈）占 GMV <= 0.3%

### 8.2 Go/No-Go 门

- 业务门：`LongTermValueIndex` 达标，且 `MerchantProfitUplift30` 具备可验证改善趋势
- 技术门：核心链路稳定，无主路径阻断
- 风控门：预算/风险/毛利硬门生效
- 合规门：隐私、日志、发票流程满足首发区域要求

### 8.3 KPI 与发布门服务接口（S090-SRV-01）

- 接口：`GET /api/state/release-gate`
- 角色：`OWNER / MANAGER`
- 作用域：默认读取登录态商户；可选 `merchantId` 指定同商户查询
- 鉴权规则：
  - 若 `merchantId` 与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
  - `merchantId` 不存在时返回 `404 merchant not found`
- 租户策略操作：`KPI_RELEASE_GATE_QUERY`
- 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

响应合同（核心字段）：
- `version`：当前版本 `S090-SRV-01.v1`
- `windowDays`：默认 30 天（可配置）
- `trendWindowDays`：默认 7 天（用于趋势判定）
- `kpis`：输出长期 KPI 快照
  - `MerchantNetProfit30`
  - `LongTermValueIndex`
  - `MerchantProfitUplift30`
  - `MerchantRevenueUplift30`
  - `UpliftHitRate30`
  - `Retention30`
  - `SubsidyWasteProxy`
  - `PlatformCost30`（观测项）
  - `paymentSuccessRate30`
  - `riskLossProxy30`
- `gates`：四门判定（`businessGate` / `technicalGate` / `riskGate` / `complianceGate`），每门包含 `status` 与 `reasons`
  - 门状态枚举：`PASS | FAIL | REVIEW`
- `dataSufficiency`：样本充分性判定（`ready`、`requirements`、`observed`、`reasons`）
- `finalDecision`：最终发布建议（`GO | NO_GO | NEEDS_REVIEW`）

默认发布门规则（当前生效）：
- 业务门：
  - `LongTermValueIndex >= 1.00`
  - `近7天利润趋势 - 前7天利润趋势 >= 0`
- 技术门：
  - `paymentSuccessRate30 >= 99.5%`
- 风控门：
  - `riskLossProxy30 <= 0.3%`
  - `SubsidyWasteProxy <= 0.6`
- 合规门：
  - 发票覆盖率 `>= 98%`
  - 隐私流程成功率 `>= 98%`
- 数据不足策略：
  - 当样本不足时，最终判定为 `NEEDS_REVIEW`，不强制给出 `GO/NO_GO`

`LongTermValueIndex` 默认计算原则：
- 北极星不变：长期价值最大化
- 代理指标加权：`MerchantProfitUplift30`、`MerchantRevenueUplift30`、`UpliftHitRate30`、`Retention30`
- 惩罚项：`SubsidyWasteProxy`
- 权重支持按租户配置覆盖，默认权重偏向商户收益与 Uplift

### 8.4 老板端发布门面板（S090-MER-01）

老板端在 S090 阶段需在看板内落地“长期 KPI 与发布门”可视化模块，支撑 Go/No-Go 决策。

- 接入接口：`GET /api/state/release-gate`
- 入口位置：老板端 `Dashboard`（不新增独立 Tab）
- 展示最小集（当前生效）：
  - 最终发布建议：`GO | NO_GO | NEEDS_REVIEW`
  - 核心 KPI：`LongTermValueIndex`、`MerchantNetProfit30`、`MerchantProfitUplift30`、`UpliftHitRate30`、`paymentSuccessRate30`、`riskLossProxy30`
  - 四门状态：业务门、技术门、风控门、合规门（含原因码）
  - 数据充分性：`ready` 与不足原因码

角色策略（当前生效）：
- `OWNER / MANAGER`：可查看完整发布门明细并手动刷新
- `CLERK`：模块可见但仅显示权限提示，不请求受限接口

降级要求（当前生效）：
- 发布门接口异常时，仅发布门模块降级并提示“发布门数据暂不可用”
- 降级不得阻断看板内其他模块（体验健康度、口径可见、经营摘要等）

### 8.5 顾客稳定性摘要接口（S090-SRV-02 / S090-CUS-01）

顾客端在 S090 阶段需将“发布门中的顾客稳定性信号”落地为可理解提示，目标是让顾客知道当前服务是否稳定且不暴露经营敏感信息。

- 接口：`GET /api/state/customer-stability`
- 角色：`CUSTOMER`
- 作用域：默认读取登录态商户；可选 `merchantId` 指定同商户查询
- 鉴权规则：
  - 若 `merchantId` 与登录态 `auth.merchantId` 不一致，返回 `403 merchant scope denied`
  - `merchantId` 不存在时返回 `404 merchant not found`
  - 登录态 `userId` 不存在时返回 `403 user scope denied`
- 租户策略操作：`KPI_RELEASE_GATE_QUERY`
- 缓存：支持 `ETag` 与 `If-None-Match`，命中返回 `304`

响应合同（核心字段）：
- `version`：当前版本 `S090-SRV-02.v1`
- `merchantId`
- `evaluatedAt`
- `windowDays`
- `objective`：`LONG_TERM_VALUE_MAXIMIZATION`
- `stabilityLevel`：`STABLE | WATCH | UNSTABLE`
- `stabilityLabel`：顾客友好中文文案（`稳定` / `需留意` / `服务波动`）
- `summary`：顾客可读的一句话状态说明
- `drivers`：顾客稳定性驱动项（仅包含 `TECHNICAL_GATE`、`COMPLIANCE_GATE`）
- `reasons`：顾客可读原因列表（包含 `code` 与 `message`）

顾客稳定性映射规则（当前生效）：
- 仅使用 `technicalGate` 与 `complianceGate` 两门，不将业务门直接映射为顾客稳定性
- 任一门 `FAIL` -> `UNSTABLE`
- 任一门 `REVIEW`（且无 `FAIL`）-> `WATCH`
- 两门均 `PASS` -> `STABLE`

顾客端降级要求（当前生效）：
- 顾客稳定性接口异常时，仅稳定性模块降级并提示“稳定性暂不可用，可稍后刷新”
- 降级不得阻断账户页其他模块（账票、提醒、反馈、隐私管理）

---

## 9. 安全、隐私与合规

### 9.1 资金安全

- 本金与赠送金严格分账
- 退款执行回溯扣减
- 营销发放与核销全量可审计

### 9.2 隐私合规

- 最小化采集，仅采业务必要信息
- 行为与交易数据分级留存
- 支持注销与非交易数据删除

### 9.3 合规运营

- 发票支持手动与托管双轨
- 高风险动作必须审计可追溯

---

## 10. 风险清单与应对

- 套利风险：同人识别 + 风险评分 + 频控 + 审计追责
- 补贴浪费风险：增量评估 + 人群分层 + 成本约束
- 资产通胀风险：发放上限 + 幂等去重 + 超限降级
- 策略失控风险：熔断开关 + 自动过期 + 审批机制
- 可用性风险：限流、重试、降级、值守机制

---

## 11. 执行文档边界

- 本规范定义“做什么、做到什么程度、为什么做”
- 接口字段、错误码、测试命令、排障入口在 `docs/roadmap.md`
- 当前执行指针、验收门、证据账本统一以 `docs/roadmap.md` 为准
- `docs/roadmap.md` 必须保持三端任务完整性与老板/顾客双视角验收点

---

## 附录 A：术语最小集

- 长期价值（Long-term Value）：平台以长期收益为导向的北极星目标
- 商户收益 Uplift：营销干预带来的商户净收益增量（执行代理指标）
- Uplift 概率：策略触发后产生增量收益的概率
- Uplift：营销动作增量效果
- 生命周期（Lifecycle）：获客/激活/活跃/扩展收入/留存
- 规则引擎：规则触发与执行编排引擎
- 策略治理（Strategy Governance）：建议、确认、执行、回放的一体化治理链路
