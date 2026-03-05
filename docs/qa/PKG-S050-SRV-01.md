# PKG-S050-SRV-01 验收记录（决策与执行治理闭环）

## 任务信息

- PackageID: `PKG-S050-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C05, SRV-C06`
- 目标: 建立策略决策、审批、执行、审计的治理查询闭环，支撑老板端审批中心与执行回放页面消费。

## 交付内容

1. 新增治理总览接口 `GET /api/policyos/governance/overview`
- 返回待审批、待发布、活跃/暂停策略数量、24h 决策结果统计、24h 审计统计、熔断状态。
- 支持 `ETag / If-None-Match`，命中返回 `304`。

2. 新增审批队列接口 `GET /api/policyos/governance/approvals`
- 支持 `status=ALL|SUBMITTED|APPROVED|PUBLISHED` 与 `limit`。
- 输出审批中心所需字段：`draftId`、`policyKey`、`policyName`、`status`、`submittedAt`、`approvalId`、`publishedPolicyId` 等。

3. 新增执行回放接口 `GET /api/policyos/governance/replays`
- 支持 `event`、`mode`、`outcome`、`limit` 过滤。
- 输出回放所需字段：`decisionId`、`traceId`、`outcome`、`executed`、`rejected`、`reasonCodes`、`createdAt`。

4. 作用域与权限治理
- 仅 `OWNER / MANAGER` 可访问治理接口。
- `merchantId` 跨租户访问返回 `403 merchant scope denied`。
- 商户不存在返回 `404 merchant not found`。

## 关键实现位置

- `MealQuestServer/src/services/policyGovernanceService.js`
- `MealQuestServer/src/http/routes/policyOsRoutes.ts`
- `MealQuestServer/src/policyos/policyRegistry.ts`
- `MealQuestServer/src/policyos/policyOsService.ts`
- `MealQuestServer/src/http/server.ts`

## 回归验证

1. `cd MealQuestServer && node -r ts-node/register/transpile-only test/policyOs.s050.governance.http.test.ts`
2. `cd MealQuestServer && npm run typecheck`

覆盖场景：
- 治理总览统计正确且支持 ETag 条件请求；
- 审批队列支持状态过滤并校验角色/作用域；
- 执行回放支持 outcome/event 过滤与非法参数校验。
