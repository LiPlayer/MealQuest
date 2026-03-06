# PKG-S100-SRV-01 验收记录（营销自动化服务基线）

## 任务信息

- PackageID: `PKG-S100-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C08, SRV-C11`
- 目标: 建立自动化触发、编排、触达频控与订阅偏好服务基线，为老板端自动化配置与顾客端降打扰提供统一接口。

## 交付内容

1. 自动化配置与熔断
- 新增接口：`GET /api/policyos/automation/config`
- 新增接口：`PUT /api/policyos/automation/config`
- 支持按事件（`USER_ENTER_SHOP`、`PAYMENT_VERIFY`）启停规则，支持全局 `enabled` 熔断。

2. 自动化执行日志
- 新增接口：`GET /api/policyos/automation/executions`
- 支持 `event / outcome / limit` 过滤。
- 输出自动化执行结果与原因码，用于老板端运营追踪。

3. 通知订阅偏好与频控
- 新增接口：`GET /api/notifications/preferences`
- 新增接口：`PUT /api/notifications/preferences`
- 支持按通知分类开关与频控配置（默认 `EXECUTION_RESULT` 24 小时最多 3 条）。
- 订阅关闭/超频控时通知被抑制并记录审计项。

4. 触发链路接入
- 入店链路（`USER_ENTER_SHOP`）与支付链路（`PAYMENT_VERIFY`）在自动化关闭时跳过自动化执行。
- 跳过自动化不得影响登录与支付主链路成功。

## 关键实现位置

- `MealQuestServer/src/services/automationService.ts`
- `MealQuestServer/src/http/routes/policyOsRoutes.ts`
- `MealQuestServer/src/http/routes/notificationRoutes.ts`
- `MealQuestServer/src/services/notificationService.js`
- `MealQuestServer/src/http/routes/preAuthRoutes.ts`
- `MealQuestServer/src/services/paymentService.ts`
- `docs/specs/mealquest-spec.md`
- `docs/roadmap.md`

## 回归验证

1. `cd MealQuestServer && npm run typecheck`
2. `cd MealQuestServer && node -r ts-node/register/transpile-only --test --test-reporter=tap --test-concurrency=1 test/automation.s100.http.test.ts`
3. `cd MealQuestServer && node -r ts-node/register/transpile-only --test --test-reporter=tap --test-concurrency=1 test/notificationService.test.ts`

手工检查：
- 老板端账号可查看并更新自动化配置；经理可读不可写；
- 自动化关闭后，顾客登录与支付仍成功但不新增自动化执行日志；
- 顾客关闭 `EXECUTION_RESULT` 订阅后，不再收到执行结果通知；
- 配置频控上限后，超限通知被抑制，历史通知数量符合预期；
- 跨商户访问与越权操作被拒绝。
