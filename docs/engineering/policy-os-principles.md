# Policy OS Basic Principles (Memory Guide) / Policy OS 基本原则 (速查指南)

## 1. What Policy OS Is / 什么是 Policy OS

Policy OS is a generalized strategy runtime / Policy OS 是一个通用的策略运行时：

1. Policy logic is declarative (`PolicySpec DSL`) / 策略逻辑是声明式的 (`PolicySpec DSL`)
2. Runtime behavior is plugin-based (`Trigger/Segment/Constraint/Scorer/Action`) / 运行时行为基于插件 (`Trigger/Segment/Constraint/Scorer/Action`)
3. Engine main flow is fixed and not business-specific / 引擎主流程是固定的，不涉及具体业务逻辑

## 2. Why We Replaced Priority-Only Rules / 为什么我们要替换仅依赖优先级的规则系统

Single `priority` sorting cannot solve commercial constraints / 单一的 `priority`（优先级）排序无法解决商业约束：

1. Budget pacing / 预算平滑 (Budget pacing)
2. Inventory hard lock / 库存硬锁 (Inventory hard lock)
3. Frequency/fatigue caps / 频次/疲劳度上限 (Frequency/fatigue caps)
4. Risk and anti-fraud hooks / 风险与反欺诈挂钩
5. Explainable governance / 可解释的治理

Policy OS uses / Policy OS 使用：

1. `lane` for coarse precedence / 使用 `lane`（泳道）进行粗粒度的优先级控制
2. scorer utility for value ranking / 使用 scorer 工具进行价值排名
3. allocator for global resource-constrained selection / 使用 allocator 进行全局资源约束下的选择
4. overlap policy for conflict handling / 使用 overlap policy 处理冲突

## 3. Core Decision Flow / 核心决策流

`load active policies -> instantiate candidates -> hard constraints -> score -> allocate -> reserve -> execute -> ledger/audit`
`加载激活策略 -> 实例化候选集 -> 硬约束过滤 -> 评分 -> 分配 -> 预留 -> 执行 -> 台账/审计`

Hard constraints always run before score acceptance / 硬约束始终在评分采纳之前运行。

## 4. Governance Hard Constraints / 治理硬约束

Backend-enforced constraints / 后端强制约束：

1. No request, no decision / 无请求，无决策
2. No approval token, no publish / 无审批令牌，不发布
3. No approval token, no execute / 无审批令牌，不执行

Policy lifecycle / 策略生命周期：

`draft -> submitted -> approved -> published -> expired`
`草稿 -> 已提交 -> 已审批 -> 已发布 -> 已过期`

## 5. Runtime Executor / 运行时执行器

Policy execution is handled by `PolicyRuntimeExecutor`, not by business-specific hardcoding / 策略执行由 `PolicyRuntimeExecutor` 负责，不再依赖业务硬编码执行器。

## 6. Explainability Contract / 可解释性契约

Every decision should provide / 每个决策都应提供：

1. `reason_codes` / 原因代码
2. `risk_flags` / 风险标记
3. `expected_range` / 预期范围
4. `trace_id` / 追踪 ID

## 7. Money & Resource Rules / 资金与资源规则

1. Double-account wallet (`principal`, `bonus`) / 双账户钱包（本金、奖金）
2. Clawback on refund (bonus first, principal fallback) / 退款扣回（先扣奖金，本金兜底）
3. Resource plugins support `check/reserve/release` / 资源插件支持“检查/预留/释放”
4. TTL is a first-class operation / 生存时间 (TTL) 是头等操作

## 8. How to Add New Strategy / 如何添加新策略

1. Add new PolicySpec draft JSON / 添加新的 PolicySpec 草稿 JSON
2. Submit -> approve -> publish / 提交 -> 审批 -> 发布
3. No engine core change required / 无需更改引擎核心

Only add plugin when introducing new action/trigger/constraint/scorer/segment types / 仅在引入新的动作/触发器/约束/评分器/分段类型时才添加插件。
