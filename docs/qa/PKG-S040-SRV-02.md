# PKG-S040-SRV-02 验收记录（模型口径基线）

## 任务信息

- PackageID: `PKG-S040-SRV-02`
- Lane: `server`
- CapabilityID: `SRV-C05`
- 目标: 建立 Uplift/流失/响应模型口径基线，并统一决策有效概率计算口径。

## 交付内容

1. 新增接口 `GET /api/state/model-contract`
- 默认返回全局模型口径基线（版本、目标合同、模型信号字段、决策公式）。
- 可选 `merchantId` 返回商户模型覆盖摘要（已发布策略数量、模型信号就绪数量、缺失模型信号策略）。

2. 权限与作用域治理
- 仅支持 `OWNER / MANAGER / CLERK`。
- `merchantId` 与登录态作用域不一致时返回 `403 merchant scope denied`。
- 商户不存在时返回 `404 merchant not found`。

3. 缓存行为
- 支持 `ETag` 与 `If-None-Match`，命中返回 `304`。

4. 决策概率口径统一
- 合同字段扩展为 `upliftProbability`、`churnProbability`、`responseProbability`。
- 决策排序使用 `effectiveProbability = upliftProbability * responseProbability * (1 - churnProbability)`。

## 关键实现位置

- `MealQuestServer/src/http/routes/stateModelContract.ts`
- `MealQuestServer/src/http/routes/systemRoutes.ts`
- `MealQuestServer/src/policyos/schemaRegistry.ts`
- `MealQuestServer/src/policyos/decisionService.ts`
- `MealQuestServer/src/policyos/plugins/defaultPlugins.ts`
- `MealQuestServer/src/policyos/templates/strategy-templates.v1.json`

## 回归验证

1. `state contract and model contract endpoints return baseline with scope control`
2. `policy schema validation normalizes legacy objective and decision signals`
3. `expected_profit_v1 scorer uses effective probability and exposes model probabilities`

以上场景由 `MealQuestServer/test/http.integration.test.ts`、`MealQuestServer/test/policyOs.schema.test.ts`、`MealQuestServer/test/policyOs.scorer.test.ts` 覆盖。
