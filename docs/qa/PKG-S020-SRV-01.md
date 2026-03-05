# PKG-S020-SRV-01 验收记录（服务端认证与门店上下文基线）

## 任务信息

- PackageID: `PKG-S020-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C01`
- 目标: 建立商户认证与门店上下文能力基线，保证登录后请求严格受 `merchantId` 作用域约束。

## 能力覆盖

1. 商户手机号登录与绑定分流
- 路径: `POST /api/auth/merchant/request-code`
- 路径: `POST /api/auth/merchant/phone-login`
- 行为: 已绑定商户返回 `BOUND` 和带 `merchantId` 的 Owner 会话；未绑定返回 `ONBOARD_REQUIRED`。

2. 开店完成与会话发放
- 路径: `POST /api/auth/merchant/complete-onboard`
- 行为: 完成开店后返回 Owner Token、`merchantId`、门店基础信息。

3. 门店上下文与作用域隔离
- 路径: `GET /api/merchant/dashboard?merchantId=...`
- 行为: Token 中 `merchantId` 与查询参数不一致时返回 `403 merchant scope denied`。

4. 门店存在性探测
- 路径: `GET /api/merchant/exists?merchantId=...`
- 行为: 返回精确存在性结果，支撑开店与登录前置校验。

## 关键实现位置

- `MealQuestServer/src/http/routes/preAuthRoutes.ts`
- `MealQuestServer/src/http/routes/merchantRoutes.ts`
- `MealQuestServer/src/http/serverHelpers.ts`

## 回归验证

1. `merchant dashboard exposes read-only customer entry visibility after customer login`
2. `merchant phone login returns bound status and enforces merchant scope`
3. `merchant onboarding completion creates store and returns owner session`
4. `merchant exists endpoint returns precise availability`

以上场景均由 `MealQuestServer/test/http.integration.test.ts` 覆盖并通过。
