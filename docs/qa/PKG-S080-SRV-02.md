# PKG-S080-SRV-02 验收记录（顾客问题反馈与处理流转）

## 任务信息

- PackageID: `PKG-S080-SRV-02`
- Lane: `server`
- CapabilityID: `SRV-C12`
- 目标: 建立顾客问题反馈工单与老板端处理流转能力，形成“可提交、可处理、可追踪”的闭环。

## 交付内容

1. 反馈工单 API 基线
- 新增顾客提单接口：`POST /api/feedback/tickets`
- 新增工单列表接口：`GET /api/feedback/tickets`
- 新增工单详情接口：`GET /api/feedback/tickets/{ticketId}`
- 新增状态流转接口：`POST /api/feedback/tickets/{ticketId}/transition`
- 新增反馈汇总接口：`GET /api/feedback/summary`

2. 状态机与权限
- 状态流转：`OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED`
- 支持返工与重开：`RESOLVED -> IN_PROGRESS`、`CLOSED -> IN_PROGRESS`
- 非法状态跳转返回 `409`
- 权限：
  - `CUSTOMER`：提交与查询本人工单
  - `OWNER / MANAGER`：处理流转与汇总查询
  - `CLERK`：无反馈治理权限

3. 通知、审计与租户策略
- 顾客提单后通知老板（`OWNER / MANAGER`）
- 老板流转后通知顾客
- 新增通知分类：`FEEDBACK_TICKET`
- 新增审计动作：
  - `FEEDBACK_CREATE`
  - `FEEDBACK_QUERY`
  - `FEEDBACK_TRANSITION`
  - `FEEDBACK_SUMMARY_QUERY`
- 新增租户策略操作标识：
  - `FEEDBACK_CREATE`
  - `FEEDBACK_QUERY`
  - `FEEDBACK_TRANSITION`
  - `FEEDBACK_SUMMARY_QUERY`

4. 可用性
- 反馈查询接口支持 `ETag / If-None-Match`，命中返回 `304`。

## 关键实现位置

- `MealQuestServer/src/services/feedbackService.ts`
- `MealQuestServer/src/http/routes/feedbackRoutes.ts`
- `MealQuestServer/src/http/createHttpRequestHandler.ts`
- `MealQuestServer/src/http/serverHelpers.ts`
- `MealQuestServer/src/core/tenantPolicy.ts`
- `MealQuestServer/src/policyos/state.ts`
- `MealQuestServer/src/services/notificationService.js`
- `MealQuestServer/test/feedback.s080.governance.http.test.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && npm run typecheck`
2. `cd MealQuestServer && npm test -- --runInBand test/feedback.s080.governance.http.test.ts`
3. `cd MealQuestServer && npm test -- --runInBand test/http.integration.test.ts`

手工检查：
- 顾客提交工单后，老板端可收到反馈提醒。
- 老板更新工单状态后，顾客可收到进展提醒。
- 顾客仅可见本人工单，跨商户访问被拒绝。
- 状态跳转非法时返回冲突错误。
- 同查询请求携带 `If-None-Match` 时可返回 `304`。
