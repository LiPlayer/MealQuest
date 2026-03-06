# PKG-S080-SRV-01 验收记录（顾客关键路径体验质量守卫）

## 任务信息

- PackageID: `PKG-S080-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C02, SRV-C03, SRV-C04`
- 目标: 建立顾客关键路径体验质量守卫能力，让老板端可读取主路径健康快照并发现风险。

## 交付内容

1. 守卫接口能力
- 新增接口：`GET /api/state/experience-guard`
- 输出总状态、健康分、路径级状态与告警清单。
- 支持 `windowHours` 观测窗口参数（默认 24 小时，最大 168 小时）。

2. 四条关键路径守卫
- 入店会话路径：统计顾客会话活跃与新增入店。
- 支付结算路径：统计支付成功/失败/挂起与成功率。
- 账务链路路径：校验支付-账本-发票-审计闭环完整性。
- 隐私流程路径：统计隐私导出/删除/注销流程成功率。

3. 权限、作用域与可用性
- 仅 `OWNER / MANAGER` 可访问，`CLERK / CUSTOMER` 拒绝访问。
- 跨商户访问返回 `403 merchant scope denied`。
- 支持 `ETag`/`If-None-Match` 命中返回 `304`。
- 接入租户策略操作标识：`CUSTOMER_EXPERIENCE_GUARD_QUERY`。

4. 审计与限流接入
- 新增审计动作映射：`CUSTOMER_EXPERIENCE_GUARD_QUERY`（用于异常/拒绝归因）。
- 新增可配置租户限流操作：`CUSTOMER_EXPERIENCE_GUARD_QUERY`。

## 关键实现位置

- `MealQuestServer/src/services/customerExperienceGuardService.ts`
- `MealQuestServer/src/http/routes/systemRoutes.ts`
- `MealQuestServer/src/http/server.ts`
- `MealQuestServer/src/http/serverHelpers.ts`
- `MealQuestServer/test/customer-experience.s080.guard.http.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && npm test -- --runInBand test/customer-experience.s080.guard.http.test.ts`
2. `cd MealQuestServer && npm test -- --runInBand test/http.integration.test.ts`
3. `npm run verify`

手工检查：
- OWNER/MANAGER 可以读取守卫快照，看到总状态与路径状态。
- CLERK 无权限访问，跨商户访问被拒绝。
- 同请求带 `If-None-Match` 可返回 `304`。
- 配置租户限流后，超限返回 `429 TENANT_RATE_LIMITED`。
