# PKG-S050-SRV-02 验收记录（消息触达规则）

## 任务信息

- PackageID: `PKG-S050-SRV-02`
- Lane: `server`
- CapabilityID: `SRV-C11`
- 目标: 建立审批待办与执行结果消息触达能力，支持老板端与顾客端后续接入。

## 交付内容

1. 消息收件箱接口
- `GET /api/notifications/inbox`
- 支持 `status`、`category`、`limit`、`cursor` 过滤与分页。
- 仅返回当前登录主体（老板/顾客）可见消息。

2. 未读汇总与已读回执
- `GET /api/notifications/unread-summary`
- `POST /api/notifications/read`
- 支持单条/批量已读、`markAll` 批量回执。

3. 触发与投递规则
- `POLICY_DRAFT_SUBMIT` 触发 `APPROVAL_TODO`（老板侧）
- `POLICY_EXECUTE` 触发 `EXECUTION_RESULT`（老板侧 + 顾客侧）
- WebSocket 定向事件：
  - `NOTIFICATION_CREATED`
  - `NOTIFICATION_READ`

4. 权限与作用域治理
- 角色：`OWNER / MANAGER / CLERK / CUSTOMER`
- 跨商户访问返回 `403 merchant scope denied`
- 顾客缺少 `userId` 身份时返回 `400 recipient identity is required`

## 关键实现位置

- `MealQuestServer/src/services/notificationService.js`
- `MealQuestServer/src/http/routes/notificationRoutes.ts`
- `MealQuestServer/src/policyos/policyOsService.ts`
- `MealQuestServer/src/core/websocketHub.ts`
- `MealQuestServer/src/http/serverHelpers.ts`

## 回归验证

1. `cd MealQuestServer && node -r ts-node/register/transpile-only test/notification.s050.delivery.http.test.ts`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only test/notificationService.test.ts`
3. `cd MealQuestServer && node -r ts-node/register/transpile-only test/policyOs.s050.governance.http.test.ts`
4. `cd MealQuestServer && npm run typecheck`

覆盖场景：
- 审批提交后老板端收件箱可见待审批消息；
- 策略执行后老板端与顾客端均可见执行结果消息；
- 已读回执生效且不越权；
- 作用域与身份校验生效。
