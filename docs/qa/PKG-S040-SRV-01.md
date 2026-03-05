# PKG-S040-SRV-01 验收记录（数据口径基线）

## 任务信息

- PackageID: `PKG-S040-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C02, SRV-C05`
- 目标: 建立用户/订单/营销/行为四域数据口径基线，并提供只读口径接口。

## 交付内容

1. 新增接口 `GET /api/state/contract`
- 默认返回全局口径基线（版本、北极星目标、代理指标、数据域定义、事件映射）。
- 可选 `merchantId` 返回商户覆盖摘要（四域记录数、最近更新时间、缺失域、事件覆盖）。

2. 权限与作用域治理
- 仅支持 `OWNER / MANAGER / CLERK`。
- `merchantId` 与登录态作用域不一致时返回 `403 merchant scope denied`。
- 商户不存在时返回 `404 merchant not found`。

3. 缓存行为
- 支持 `ETag` 与 `If-None-Match`，命中返回 `304`。

## 关键实现位置

- `MealQuestServer/src/http/routes/stateContract.ts`
- `MealQuestServer/src/http/routes/systemRoutes.ts`

## 回归验证

1. `state contract endpoint returns baseline and merchant coverage with scope control`
2. `state and audit endpoints support ETag conditional requests`（确认缓存机制保持一致）

以上场景由 `MealQuestServer/test/http.integration.test.ts` 覆盖并通过。
