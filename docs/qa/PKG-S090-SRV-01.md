# PKG-S090-SRV-01 验收记录（长期 KPI 与发布门）

## 任务信息

- PackageID: `PKG-S090-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C09`
- 目标: 建立长期 KPI 与发布门判定能力，为老板端 Go/No-Go 面板提供统一服务合同。

## 交付内容

1. 发布门接口能力
- 新增接口：`GET /api/state/release-gate`
- 输出长期 KPI、四门判定（业务/技术/风控/合规）、数据充分性与最终发布建议（`GO/NO_GO/NEEDS_REVIEW`）。
- 支持 `windowDays` 参数（默认 30 天，范围 7-90 天）。

2. 判定规则与数据不足策略
- 默认硬门：`LongTermValueIndex`、支付成功率、风险损失代理、补贴浪费代理、隐私/发票合规指标。
- 趋势门：近 7 天与前 7 天利润趋势对比。
- 样本不足时返回 `NEEDS_REVIEW`，不强行给出 `GO/NO_GO`。

3. 权限、作用域与可用性
- 仅 `OWNER / MANAGER` 可访问，`CLERK / CUSTOMER` 拒绝访问。
- 跨商户访问返回 `403 merchant scope denied`。
- 支持 `ETag`/`If-None-Match` 命中返回 `304`。
- 接入租户策略操作标识：`KPI_RELEASE_GATE_QUERY`。

4. 审计与限流接入
- 新增审计动作映射：`KPI_RELEASE_GATE_QUERY`。
- 新增可配置租户限流操作：`KPI_RELEASE_GATE_QUERY`。

## 关键实现位置

- `MealQuestServer/src/services/releaseGateService.ts`
- `MealQuestServer/src/http/routes/systemRoutes.ts`
- `MealQuestServer/src/http/server.ts`
- `MealQuestServer/src/http/serverHelpers.ts`
- `MealQuestServer/test/releaseGate.s090.http.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && node --test test/releaseGate.s090.http.test.ts`
2. `cd MealQuestServer && node --test test/http.integration.test.ts`
3. `npm run verify`

手工检查：
- OWNER/MANAGER 可以读取发布门快照并看到四门状态与最终建议；
- 样本不足时返回 `NEEDS_REVIEW` 且包含原因码；
- 技术门不达标时返回 `NO_GO`；
- `CLERK/CUSTOMER` 无权限访问，跨商户访问被拒绝；
- 同请求带 `If-None-Match` 可返回 `304`；
- 配置租户限流后，超限返回 `429 TENANT_RATE_LIMITED`。
