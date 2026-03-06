# PKG-S110-SRV-01 验收记录（实验与动态优化服务基线）

## 任务信息

- PackageID: `PKG-S110-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C07, SRV-C10`
- 目标: 建立实验配置、灰度评估、风险护栏与回滚能力，为老板端实验监控与顾客端灰度守护提供统一后端合同。

## 交付内容

1. 实验配置与老板轻量控制
- 新增接口：`GET /api/policyos/experiments/config`
- 新增接口：`PUT /api/policyos/experiments/config`
- 支持老板控制实验开关、流量比例、目标事件与护栏阈值。

2. 实验指标快照
- 新增接口：`GET /api/policyos/experiments/metrics`
- 输出 control/treatment 双组快照、uplift 指标与风险护栏状态。
- 复用发布门 KPI 作为风险护栏输入。

3. 回滚能力
- 新增接口：`POST /api/policyos/experiments/rollback`
- 回滚后实验自动关闭并写入回滚历史。

4. 治理与安全
- 新增租户策略操作：`EXPERIMENT_CONFIG_QUERY`、`EXPERIMENT_CONFIG_SET`、`EXPERIMENT_METRICS_QUERY`、`EXPERIMENT_ROLLBACK`
- 新增审计动作：`EXPERIMENT_CONFIG_SET`、`EXPERIMENT_ROLLBACK`
- GET 接口支持 `ETag/If-None-Match` 协商缓存。

## 关键实现位置

- `MealQuestServer/src/services/experimentService.ts`
- `MealQuestServer/src/http/routes/policyOsRoutes.ts`
- `MealQuestServer/src/http/server.ts`
- `MealQuestServer/src/http/serverHelpers.ts`
- `MealQuestServer/src/core/tenantPolicy.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && npm run typecheck`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only --test --test-reporter=tap --test-concurrency=1 test/policyOs.s110.acquisition.test.ts test/policyOs.s110.visibility.http.test.ts`
3. `cd MealQuestServer && node -r ts-node/register/transpile-only --test --test-reporter=tap --test-concurrency=1 test/releaseGate.s090.http.test.ts test/automation.s100.http.test.ts`

手工检查：
- `OWNER` 可配置实验并执行回滚，`MANAGER` 仅可查询；
- 指标快照可见 control/treatment 与 uplift，且风险护栏状态可解释；
- 跨商户访问、越权访问、租户限流均按约束返回错误码；
- 回滚后实验状态变为 `ROLLED_BACK`，并保留最近回滚记录。
