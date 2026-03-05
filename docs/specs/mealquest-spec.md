# MealQuest 商业化落地规范（V15.4）

> 文档定位：MealQuest 产品与商业规范真源（唯一真源）。
> 适用范围：`MealQuestServer`、`MealQuestMerchant`、`meal-quest-customer` 三端协同建设。

## 0. 版本与治理

- 版本：V15.4（新项目基线：长期价值最大化 + 生命周期五阶段）
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
