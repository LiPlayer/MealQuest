# MealQuestServer

基于 `MealQuest_Spec.md` 的服务端最小可运行实现，覆盖以下核心链路：

- 智能抵扣（临期券优先 -> 余额 -> 碎银 -> 外部支付）
- 支付核销与幂等保护
- 退款 Clawback（优先回收赠送金，不足时回收本金）
- TCA 规则触发执行（Trigger/Condition/Action）
- 商户策略提案确认、模板策略库、活动启停与熔断开关
- 紧急急售（`Priority:999 + TTL`）人工接管
- 异业联盟供应商订单核验接口
- 连锁联盟配置（门店集群/共享钱包/跨店用户同步）
- 社交裂变账务（转赠/拼手气红包，总量守恒）
- JWT 鉴权与角色权限（`CUSTOMER/CLERK/MANAGER/OWNER`）
- WebSocket 实时推送（支付、退款、策略、熔断、TCA）
- 持久化存储（默认 `data/db.json`）
- 共享库强隔离（`merchantUsers` 与 `paymentsByMerchant` 按商户分桶）
- 高风险审计日志（支付/退款/提案/熔断/TCA）

## 运行

```powershell
# 推荐：先复制示例环境文件并修改需要的键
Copy-Item .env.example .env
npm start
```

也可使用仓库根目录脚本按环境启动：

```powershell
.\scripts\start-server.ps1 -Profile dev
.\scripts\start-server.ps1 -Profile staging
.\scripts\start-server.ps1 -Profile prod
```

环境模板：

1. `.env.dev.example`
2. `.env.staging.example`
3. `.env.prod.example`

## 开店（自定义商户，不依赖 `m_demo`）

你可以直接创建自己的商户 ID：

```powershell
cd .\MealQuestServer
npm run onboard:merchant -- --merchant-id m_my_first_store --name "我的第一家店"
```

也可直接调接口：

```text
POST /api/merchant/onboard
GET  /api/merchant/catalog
```

示例请求体：

```json
{
  "merchantId": "m_my_first_store",
  "name": "我的第一家店",
  "budgetCap": 500,
  "seedDemoUsers": true
}
```

返回 `201` 后，可立即用该 `merchantId` 执行 `/api/auth/mock-login`（OWNER/CUSTOMER）并联调商户端与顾客端。

可选安全项：设置 `MQ_ONBOARD_SECRET` 后，请求需携带 `x-onboard-secret` 头。

## 租户路由（开发）

`createAppServer` 支持传入 `tenantDbMap`，按 `merchantId` 将热点商户路由到独立数据源（当前用于测试与演练）。
建议演进路径：先“共享库强隔离”，再“热点商户物理分库”。

## 租户策略（配额治理）

`createAppServer` 还支持传入 `tenantPolicyMap`，用于按商户控制：

1. `writeEnabled=false`：迁移窗口写冻结（read-only）。
2. `wsEnabled=false`：临时关闭实时通道接入。
3. `limits`：按操作限流（例如 `PAYMENT_VERIFY` 每分钟配额）。
4. 策略写入后会随 `data/db.json` 持久化，服务重启后自动恢复。

示例：

```js
createAppServer({
  tenantPolicyMap: {
    m_demo: {
      writeEnabled: false,
      limits: {
        PAYMENT_VERIFY: { limit: 30, windowMs: 60000 }
      }
    }
  }
});
```

在线策略管理（仅 Owner）：

```text
GET /api/merchant/tenant-policy?merchantId=m_demo
POST /api/merchant/tenant-policy
```

迁移编排接口（仅 Owner）：

```text
GET /api/merchant/migration/status?merchantId=m_demo
POST /api/merchant/migration/step
POST /api/merchant/migration/cutover
POST /api/merchant/migration/rollback
```

其中 `migration/cutover` 会自动执行“冻结写入 -> 切专库 -> 恢复写入”，并将专库路由持久化到主库快照，确保重启后不回流共享库。

## 标准营销策略库

```text
GET  /api/merchant/strategy-library?merchantId=<id>
GET  /api/merchant/strategy-configs?merchantId=<id>
POST /api/merchant/strategy-proposals
POST /api/merchant/campaigns/:id/status
POST /api/merchant/fire-sale
```

支持从模板库按分支生成提案（PENDING），由 Owner 确认后生效；支持运行中策略启停与人工急售接管。

## 供应商核验接口

```text
POST /api/supplier/verify-order
```

用于异业联盟交易核验（`partnerId + orderId + minSpend`），返回 `verified=true/false` 并写审计日志。

## 连锁联盟与社交裂变接口

```text
GET  /api/merchant/alliance-config?merchantId=<id>
POST /api/merchant/alliance-config
GET  /api/merchant/stores?merchantId=<id>
POST /api/merchant/alliance/sync-user
POST /api/social/transfer
POST /api/social/red-packets
POST /api/social/red-packets/:packetId/claim
GET  /api/social/red-packets/:packetId?merchantId=<id>
POST /api/social/treat/sessions
POST /api/social/treat/sessions/:sessionId/join
POST /api/social/treat/sessions/:sessionId/close
GET  /api/social/treat/sessions/:sessionId?merchantId=<id>
```

## 审计日志查询

```text
GET /api/audit/logs?merchantId=m_demo&limit=20&cursor=<cursor>&startTime=<iso>&endTime=<iso>&action=<ACTION>&status=<STATUS>
```

仅 `CLERK/MANAGER/OWNER` 可访问，且受商户 scope 限制。

在线状态查询：

```text
GET /api/ws/status?merchantId=m_demo
```

同样受商户 scope 限制，跨商户请求返回 `merchant scope denied`。

## 调试登录

```powershell
curl -X POST http://127.0.0.1:3030/api/auth/mock-login `
  -H "Content-Type: application/json" `
  -d "{\"role\":\"OWNER\",\"merchantId\":\"m_demo\"}"
```

老板手机号登录流程（用于商户端引导页）：

```text
POST /api/auth/merchant/request-code
POST /api/auth/merchant/phone-login
```

特约商户入驻：

```text
POST /api/merchant/contract/apply
GET  /api/merchant/contract/status?merchantId=<id>
```

## WebSocket

连接地址：

```text
ws://127.0.0.1:3030/ws?merchantId=m_demo&token=<JWT>
```

## External Payment Callback (Commercial Path)

Configure callback signature secret:

```ini
# MealQuestServer/.env
MQ_PAYMENT_CALLBACK_SECRET=mealquest-payment-callback-secret
```

Callback endpoint (gateway -> server):

```text
POST /api/payment/callback
Header: X-Payment-Signature: <hmac-sha256(JSON(body), secret)>
Body: { merchantId, paymentTxnId, externalTxnId, status, paidAmount, callbackId }
```

When an order has external payable amount, `/api/payment/verify` returns `status=PENDING_EXTERNAL`.
After callback is verified, payment becomes `PAID` and wallet settlement is finalized.

## E-Invoice Assistant

```text
POST /api/invoice/issue
GET /api/invoice/list?merchantId=<id>&userId=<optional>&limit=<optional>
```

`invoice/issue` requires a settled payment (`status=PAID`), and writes invoice records for audit.

## Privacy Compliance APIs

```text
POST /api/privacy/export-user
POST /api/privacy/delete-user
POST /api/privacy/cancel-account
```

`export-user` / `delete-user` are Owner-only. `cancel-account` is customer self-service account cancellation.

## Metrics

```text
GET /metrics
```

Prometheus-style text output with request/error counters.

## 测试

```powershell
npm test
```

## 容器化部署

1. 复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

2. 启动容器：

```powershell
docker compose up -d --build
```

3. 验证健康状态：

```powershell
curl http://127.0.0.1:3030/health
```
