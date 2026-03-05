# MealQuest 开发路线图（执行版）

> 规范真源：`docs/specs/mealquest-spec.md`  
> 执行真源：`docs/roadmap.md`（本文件）

## 01. 文档契约

### 01.1 职责边界

1. `spec` 负责业务目标、生命周期体系、价值函数、治理与 KPI 口径。
2. `roadmap` 负责开发顺序、任务清单、验收门、排障索引与推进状态。
3. 实现细节由研发在任务边界内自主决定。

### 01.2 状态枚举

1. `todo`
2. `doing`
3. `blocked`
4. `done`

### 01.3 推进硬规则

1. 任一时刻仅允许 1 个 Step 处于 `doing`。
2. 指针之前的 Step 不允许出现 `TBD`、`待确认`。
3. 每个 Step 必须提供三端可执行验收门（server/merchant/customer）。
4. 关键产品决策必须回填到 `Decision Notes`。

---

## 02. 主路线（Master Step Sequence）

### 02.0 指针判定（唯一来源）

1. `Status = doing` 的 Step 为当前指针。
2. 当前 Step 完成后，按顺序进入下一个 `todo`。

| StepID | Phase | Outcome（结果定义） | Dependency | Status |
| --- | --- | --- | --- | --- |
| S010 | P0 | 长期价值目标与五阶段合同冻结（spec/roadmap 对齐） | 无 | doing |
| S020 | P0 | 策略合同升级（`stage/objective/decisionSignals/gameSupport`）可回归 | S010 done | todo |
| S030 | P1 | 决策排序升级为 Global Value + 执行硬门解耦可回归 | S020 done | todo |
| S040 | P1 | 五阶段样例策略闭环（Acq/Act/Expansion/Retention + Engagement）可回归 | S030 done | todo |
| S050 | P1 | 长期价值 KPI 与 Go/No-Go 判定可执行 | S040 done | todo |
| S060 | P2 | A/B 与 uplift 预埋能力上线（非 P1 发布硬门） | S050 done | todo |

### 02.1 Spec 需求覆盖矩阵

| Spec Clause | Requirement（摘要） | Mapped Items | Coverage |
| --- | --- | --- | --- |
| 1 | 北极星目标与不变原则 | S010, S030, S050 | covered |
| 2 | Global Value 目标函数与权重 | S010, S030 | covered |
| 3 | 五阶段生命周期 + Mini-Game 底座 | S010, S040 | covered |
| 4 | 四层架构（Data/Model/Decision/Execution） | S010, S020, S030 | covered |
| 5 | 策略合同字段升级 | S020 | covered |
| 6 | 执行硬门与治理边界 | S020, S030, S040 | covered |
| 7 | 产品范围 In/Out | S010, S040, S050 | covered |
| 8 | 长期 KPI 与 Go/No-Go | S050 | covered |
| 9 | 安全隐私与风险 | S020, S030, S050 | covered |
| 10 | 文档先行与双文档同步 | S010 | covered |

---

## 03. Step 任务卡

### S010 - 冻结长期价值目标与生命周期合同

- Objective：完成 `spec + roadmap` 同步重构，冻结 V14.0 基线。
- Dependency：无。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S010-SRV-01 | server | 确认策略合同升级字段与现有引擎兼容边界 | doing | 合同基线记录 |
| S010-MER-01 | merchant | 对齐提案卡解释字段（价值分解/预算/风险）展示口径 | todo | 展示口径草案 |
| S010-CUS-01 | customer | 对齐活动标签与阶段展示口径（五阶段） | todo | 客户端口径草案 |

- Done Definition：
1. 双文档对齐 V14.0 且无冲突条款。
2. 五阶段替代旧分类在合同层生效。
3. 当前指针可进入 S020。

- Acceptance Commands：
1. `npm run check:encoding`
2. `cd MealQuestServer && npm run policyos:validate-templates`
3. `cd MealQuestServer && npm run typecheck`

- Triage Key：`RB-DOC-010`

### S020 - 策略合同升级与兼容回归

- Objective：完成 `stage/objective/decisionSignals/gameSupport` 全链路接入。
- Dependency：S010 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S020-SRV-01 | server | 升级 schema、模板、策略视图与评分上下文注入 | todo | 合同升级代码 |
| S020-MER-01 | merchant | 提案卡与策略配置页支持新字段展示与透传 | todo | 商户端兼容 |
| S020-CUS-01 | customer | 活动标签按 stage 口径渲染并兼容旧数据 | todo | 顾客端兼容 |

- Done Definition：
1. 新字段可校验、可持久化、可回放。
2. 不破坏现有审批与执行链路。
3. 三端回归通过。

- Acceptance Commands：
1. `cd MealQuestServer && npm run typecheck`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/policyOs.schema.test.ts test/policyOs.constraints.test.ts test/policyOs.http.integration.test.ts`
3. `cd MealQuestMerchant && npm run lint && npm run typecheck`
4. `cd meal-quest-customer && npm run typecheck && npm test`

- Triage Key：`RB-CONTRACT-020`

### S030 - Global Value 排序与执行硬门解耦

- Objective：将建议排序改为长期价值评分，同时保持硬门执行独立。
- Dependency：S020 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S030-SRV-01 | server | 在决策层引入价值分解评分并输出 explain 字段 | todo | 推荐评分基线 |
| S030-MER-01 | merchant | 提案卡展示 `globalValueScore` 与价值分解项 | todo | 提案解释视图 |
| S030-CUS-01 | customer | 验证建议排序变化不影响支付与资产一致性 | todo | 一致性回归 |

- Done Definition：
1. 候选建议可按长期价值稳定排序。
2. 超预算/超风险/超毛利策略不可执行。
3. Explain 可读且与后端一致。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run test:regression:ui`

- Triage Key：`RB-GLOBAL-VALUE-030`

### S040 - 五阶段策略闭环

- Objective：交付五阶段策略在通用引擎上的可执行闭环。
- Dependency：S030 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S040-SRV-01 | server | 交付五阶段样例策略模板与执行校验（含 Game 底座能力） | todo | 五阶段样例集 |
| S040-MER-01 | merchant | 看板展示阶段命中/拦截与原因摘要 | todo | 阶段运营视图 |
| S040-CUS-01 | customer | 顾客端展示阶段化活动与互动入口 | todo | 顾客阶段体验 |

- Done Definition：
1. 五阶段样例形成触发->判定->执行->可见->审计闭环。
2. 游戏能力异常可降级且不阻断支付。
3. 三端证据完备。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Triage Key：`RB-LIFECYCLE-040`

### S050 - 长期 KPI 与 Go/No-Go 固化

- Objective：把长期价值指标和发布门固化为可执行流程。
- Dependency：S040 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S050-SRV-01 | server | 固化 `CustomerLTV30/MerchantNetProfit30/PlatformProfit30/GlobalValueIndex` 查询链路 | todo | KPI 数据基线 |
| S050-MER-01 | merchant | 看板展示长期 KPI 趋势、告警和策略贡献解释 | todo | KPI 运营视图 |
| S050-CUS-01 | customer | 顾客端埋点支持长期价值归因口径 | todo | 埋点兼容记录 |

- Done Definition：
1. 长期 KPI 可查询、可解释、可追溯。
2. Go/No-Go 判定可重复执行。
3. 指标异常有定位路径。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run test:regression:ui`

- Triage Key：`RB-KPI-050`

### S060 - P2 实验与增量评估预埋

- Objective：引入 A/B 与 uplift 预埋能力（非 P1 强制门）。
- Dependency：S050 done。

| task_id | lane | task | status | output |
| --- | --- | --- | --- | --- |
| S060-SRV-01 | server | 建立实验分流、对照组、增量计算最小能力 | todo | 实验基座 |
| S060-MER-01 | merchant | 提供实验配置与结果摘要可见性 | todo | 实验视图 |
| S060-CUS-01 | customer | 实验埋点与分组透传兼容 | todo | 顾客端兼容 |

- Done Definition：
1. 实验分流与结果统计可回放。
2. 不影响既有执行硬门与支付主链路。

- Acceptance Commands：
1. `cd MealQuestServer && npm test`
2. `cd MealQuestMerchant && npm run lint && npm run typecheck`
3. `cd meal-quest-customer && npm run typecheck && npm test`

- Triage Key：`RB-EXP-060`

---

## 04. 证据账本（按 Step 回填）

| StepID | Test Ref | Runtime Ref | Review Ref | Result | Verified By | Verified At |
| --- | --- | --- | --- | --- | --- | --- |
| S010 | `npm run check:encoding`; `cd MealQuestServer && npm run policyos:validate-templates` | `docs/specs/mealquest-spec.md`; `docs/roadmap.md` | 文档一致性审查 | pending | AI/Agent | 2026-03-05 |
| S020 | `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/policyOs.schema.test.ts test/policyOs.constraints.test.ts test/policyOs.http.integration.test.ts` | `MealQuestServer/src/policyos/*` | 策略合同升级评审 | pending | AI/Agent | 2026-03-05 |
| S030 | 待回填 | 待回填 | 待回填 | pending | AI/Agent | - |
| S040 | 待回填 | 待回填 | 待回填 | pending | AI/Agent | - |
| S050 | 待回填 | 待回填 | 待回填 | pending | AI/Agent | - |
| S060 | 待回填 | 待回填 | 待回填 | pending | AI/Agent | - |

---

## 05. 排障索引（Triage Key）

| Triage Key | Symptom | First Command | Owner |
| --- | --- | --- | --- |
| RB-DOC-010 | spec/roadmap 口径不一致 | `rg -n "Global Value|stage|objective|KPI" docs/specs/mealquest-spec.md docs/roadmap.md` | product + server |
| RB-CONTRACT-020 | 策略合同校验失败 | `cd MealQuestServer && npm run policyos:validate-templates` | server |
| RB-GLOBAL-VALUE-030 | 候选排序异常或抖动 | `cd MealQuestServer && node -r ts-node/register/transpile-only --test test/policyOs.http.integration.test.ts` | server |
| RB-LIFECYCLE-040 | 五阶段展示/执行不一致 | `cd MealQuestServer && npm test` | server + merchant + customer |
| RB-KPI-050 | 长期 KPI 缺失或口径漂移 | `cd MealQuestServer && npm test` | server + merchant |
| RB-EXP-060 | 实验分流或增量计算异常 | `cd MealQuestServer && npm test` | server |

---

## 06. Decision Notes（已确认）

1. 优化目标采用长期生态价值函数，权重默认 `0.5/0.3/0.2`。
2. 生命周期主分类采用五阶段，Mini-Game 为独立互动能力模块。
3. P1 采用规则与阈值优先，不将 A/B 与 uplift 设为发布硬门。
4. 治理边界保持不变：无确认不执行 + 预算/风险/毛利硬门。
5. 当前项目为新项目，不存在已发布策略迁移问题。
