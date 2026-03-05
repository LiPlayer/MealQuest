# MealQuest 商业化落地规范（V14.0）

> 文档定位：本文件是 MealQuest 的产品与商业规范真源（Source of Truth）。  
> 适用范围：`MealQuestServer`、`MealQuestMerchant`、`meal-quest-customer` 三端协同建设。

## 0. 版本与治理

- 版本：V14.0（生命周期五阶段 + 长期价值口径首版）
- 首发区域：中国大陆
- 目标客群：单店与小连锁餐饮商户
- 变更规则：任何功能、策略、风控或合规变更，必须先更新本规范，再进入研发

---

## 1. 北极星目标与不变原则

### 1.1 北极星目标

构建一个面向中小餐饮的“私域经营操作系统”：
- 对商户：降低运营复杂度，在可控风险下稳定提升长期净收益
- 对顾客：在支付与互动中获得“即时价值 + 持续资产感”
- 对平台：建立可复制、可审计、可规模化的长期价值增长体系

### 1.2 不变原则

- 无请求不决策：系统不替商户做未授权决策
- 无确认不执行：营销与资金相关动作必须人工确认后执行
- 利润优先于活跃：所有策略先满足毛利保护，再追求增长
- 支付主链路优先：互动与营销异常不得阻断支付、核销、账务、发票
- 先闭环后扩张：先跑通可回归的最小商用闭环，再扩展算法能力

---

## 2. 全局价值函数（唯一优化目标）

### 2.1 目标定义

营销系统优化目标统一为长期期望利润：

```text
Global Value =
0.5 * CustomerLTV30
+ 0.3 * MerchantNetProfit30
+ 0.2 * PlatformProfit30
- MarketingCost
```

其中：
- `CustomerLTV30`：顾客 30 天生命周期价值
- `MerchantNetProfit30`：商户 30 天净收益
- `PlatformProfit30`：平台 30 天利润
- `MarketingCost`：优惠券/补贴/活动成本

### 2.2 约束关系

- 价值函数用于“建议排序层”
- 预算/风险/毛利红线用于“执行硬门层”
- 建议层与执行层解耦：高分建议不代表可执行

---

## 3. 生命周期策略体系（五阶段）

### 3.1 Customer Lifecycle（SaaS 口径）

- Acquisition（获客）
- Activation（激活）
- Engagement（活跃）
- Expansion（扩展收入）
- Retention（留存）

### 3.2 策略分层

- 五阶段是唯一策略主分类
- 原“六策略族”不再作为执行主分类
- Mini-Game 改为独立互动能力模块，不单列为策略阶段

### 3.3 Mini-Game 模块定位

- 提供触达、互动、奖励、资格判定能力
- 服务于五阶段策略执行，不直接承担阶段分类职责
- 异常时必须可降级且不影响支付主链路

---

## 4. 营销系统四层架构

### 4.1 Data Layer

统一沉淀以下数据并进入可审计仓：
- 用户数据：身份、偏好、会员、历史行为
- 订单数据：金额、时间、门店、支付方式
- 营销数据：曝光、点击、发放、核销、拦截
- 互动数据：浏览、点击、搜索、加购、游戏互动

### 4.2 Model Layer（P1 规则估计）

- 首版采用规则与阈值驱动的可解释估计，不引入 RL 主决策
- 输出决策信号：`intentScore`、`fatigueScore`、`riskScore`、`expectedProfit30dProxy`
- P2 再引入 uplift/A-B 与更强建模能力

### 4.3 Decision Layer

- 输入：策略合同 + 估计信号 + 业务上下文
- 输出：候选排序、预期区间、风险标记、预算占用
- 排序依据：Global Value

### 4.4 Execution Layer

- 统一审批发布流程：Draft -> Submit -> Approve -> Publish
- 统一执行流程：Trigger -> Eligibility -> Hard Gates -> Action -> Audit
- 强制审计：每次建议、确认、执行、回放均可追溯

---

## 5. 策略合同（Policy Contract）

### 5.1 必须字段

- `strategyId`
- `stage`（`ACQUISITION | ACTIVATION | ENGAGEMENT | EXPANSION | RETENTION`）
- `triggerEvent`
- `eligibility`
- `action`
- `governanceGates`
- `objective`
- `decisionSignals`
- `customerVisibility`
- `merchantVisibility`
- `auditTrace`

### 5.2 objective 字段

- `objective.valueFunction`：默认 `GLOBAL_ECOSYSTEM_VALUE_V1`
- `objective.weights.customerLtv`：默认 `0.5`
- `objective.weights.merchantNetProfit`：默认 `0.3`
- `objective.weights.platformProfit`：默认 `0.2`
- `objective.windowDays`：默认 `30`

### 5.3 decisionSignals 字段

- `intentScore`（0-1）
- `fatigueScore`（>=0）
- `riskScore`（>=0）
- `expectedProfit30dProxy`
- 可选：`customerValue`、`merchantValue`、`platformValue`

### 5.4 游戏能力字段

- `gameSupport.enabled`
- `gameSupport.touchpoint`

---

## 6. 执行治理与安全边界

- 执行硬门不变：预算、风险、毛利、审批、可追溯、熔断
- 任一参数缺失或超线：可建议，不可执行
- 资金相关动作必须走审计链路
- 非营业时段默认抑制非紧急提醒
- Agent 异常时降级到看板 + 人工流程

---

## 7. 产品范围（In/Out）

### 7.1 In Scope（当前版本必须实现）

- 商户端：登录、开店、经营看板、Agent 提案、审批中心、执行回放、紧急停机
- 顾客端：扫码入店、资产展示、支付核销、账票查询、互动触达
- 服务端：认证、支付、发票、隐私、策略治理、执行审计、多租户隔离
- 营销系统：五阶段策略闭环 + Mini-Game 能力底座

### 7.2 Out of Scope（当前版本明确不做）

- 点餐流程、后厨 KDS、桌台管理
- 采购、库存进销存、供应链系统
- 顾客侧与店长侧 Agent 商用开放
- P1 阶段将 A/B 与 uplift 作为发布硬门

---

## 8. KPI 与发布门（长期价值口径）

### 8.1 核心 KPI（替换旧短期指标口径）

- `CustomerLTV30`
- `MerchantNetProfit30`
- `PlatformProfit30`
- `Retention30`
- `GlobalValueIndex`
- `SubsidyWasteProxy`

> 注：P1 允许使用可解释代理指标估计上述值；P2 强化实验与增量评估精度。

### 8.2 Go/No-Go

- 业务门：`GlobalValueIndex` 可验证改善
- 技术门：核心链路稳定，无主路径阻断
- 风控门：预算/风险/毛利硬门全生效
- 合规门：隐私、日志、发票流程满足首发区域要求

---

## 9. 安全、隐私与风险

### 9.1 资金与账务

- 本金与赠送金严格分账
- 退款执行回溯扣减
- 营销补贴、资产发放、核销全量可审计

### 9.2 隐私与留存

- 最小化采集，仅采业务必要数据
- 行为与交易分级留存
- 支持账户注销与非交易数据删除

### 9.3 风险清单

- 补贴浪费：通过决策信号与红线门控降低无效补贴
- 套利欺诈：同人识别 + 风险评分 + 频控 + 审计追责
- 资产通胀：发放上限 + 去重幂等 + 降级保护
- 策略失控：熔断开关 + 自动过期 + 人工审批

---

## 10. 执行文档边界

- 本规范定义“做什么、做到什么程度、为什么做”
- 执行任务、验收命令、推进指针、排障索引统一维护在 `docs/roadmap.md`
- 任何行为变更必须同轮同步更新 `spec + roadmap`

---

## 附录 A：术语最小集

- Global Value：长期生态价值总目标
- Lifecycle Stage：Acquisition / Activation / Engagement / Expansion / Retention
- Mini-Game Module：服务五阶段策略的互动能力底座
- Hard Gates：预算/风险/毛利/审批等执行硬门
