# PKG-S060-SRV-01 验收记录（五阶段策略能力基线）

## 任务信息

- PackageID: `PKG-S060-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C05`
- 目标: 建立生命周期五阶段策略库（获客/激活/活跃/扩收/留存）的查询与启用基线能力。

## 交付内容

1. 五阶段模板基线补齐
- 策略模板目录新增活跃阶段模板：`engagement_daily_task_loop`
- 五阶段模板形成完整覆盖：
  - `acquisition_welcome_gift`
  - `activation_checkin_streak_recovery`
  - `engagement_daily_task_loop`
  - `revenue_addon_upsell_slow_item`
  - `retention_dormant_winback_14d`

2. 生命周期策略库查询接口
- `GET /api/merchant/strategy-library`
- 支持角色：`OWNER / MANAGER / CLERK`
- 返回模板目录版本、五阶段模板状态、当前启用分支与发布状态。
- 支持 `ETag` / `If-None-Match` 缓存协商。

3. 生命周期模板启用接口
- `POST /api/merchant/strategy-library/{templateId}/enable`
- 支持角色：`OWNER`
- 支持可选 `branchId`，默认模板默认分支。
- 同模板同分支重复启用幂等（`alreadyEnabled=true`）。
- 新版本启用后自动暂停旧的同模板已发布策略。
- 扩收模板走既有扩收配置链路，保持口径一致。

4. 老板端看板能力补齐
- `GET /api/merchant/dashboard` 新增 `engagementSummary`，用于活跃阶段命中/拦截可见化。

## 关键实现位置

- `MealQuestServer/src/policyos/templates/strategy-templates.v1.json`
- `MealQuestServer/src/services/merchantService.ts`
- `MealQuestServer/src/http/routes/merchantRoutes.ts`
- `MealQuestServer/test/policyOs.s060.lifecycle-library.http.test.ts`

## 回归验证

1. `cd MealQuestServer && node -r ts-node/register/transpile-only test/policyOs.s060.lifecycle-library.http.test.ts`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only test/policyOs.s130.visibility.http.test.ts`
3. `cd MealQuestServer && node -r ts-node/register/transpile-only test/policyOs.s140.visibility.http.test.ts`

覆盖场景：
- 五阶段策略库查询完整覆盖且包含活跃阶段；
- Owner 可启用活跃阶段模板，重复启用幂等；
- Manager/Clerk 可查询但不可启用；跨商户作用域校验生效；
- ETag 协商缓存命中返回 `304`；
- 看板活跃阶段汇总可见且与执行结果一致。
