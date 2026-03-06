# PKG-S090-SRV-02 验收记录（顾客稳定性摘要接口）

## 任务信息

- PackageID: `PKG-S090-SRV-02`
- Lane: `server`
- CapabilityID: `SRV-C09`
- 目标: 基于发布门结果提供顾客可读稳定性摘要接口，支撑顾客端稳定性提示与降级策略。

## 交付内容

1. 顾客稳定性接口
- 新增接口：`GET /api/state/customer-stability`
- 仅 `CUSTOMER` 角色可访问，输出顾客友好稳定性等级与原因说明。
- 支持 `merchantId` 同租户查询与 `windowDays` 窗口参数。

2. 稳定性口径映射
- 稳定性仅由 `technicalGate + complianceGate` 驱动。
- 映射规则：
  - 任一门 `FAIL` -> `UNSTABLE`
  - 任一门 `REVIEW`（且无 `FAIL`）-> `WATCH`
  - 双门 `PASS` -> `STABLE`

3. 可用性与缓存
- 支持 `ETag`/`If-None-Match` 命中返回 `304`。
- 沿用 `KPI_RELEASE_GATE_QUERY` 租户策略操作进行限流与策略校验。

## 关键实现位置

- `MealQuestServer/src/services/releaseGateService.ts`
- `MealQuestServer/src/http/routes/systemRoutes.ts`
- `MealQuestServer/test/release-gate.s090.http.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && node --test test/release-gate.s090.http.test.ts`
2. `cd MealQuestServer && node --test test/http.integration.test.ts`
3. `npm run verify`

手工检查：
- 顾客可读取稳定性等级、摘要说明、驱动门状态与可读原因；
- 技术门失败时返回 `UNSTABLE`；
- 技术/合规门样本不足时返回 `WATCH`；
- 双门通过时返回 `STABLE`；
- `OWNER/MANAGER/CLERK` 访问被拒绝；
- 跨商户查询拒绝，带 `If-None-Match` 可返回 `304`。
