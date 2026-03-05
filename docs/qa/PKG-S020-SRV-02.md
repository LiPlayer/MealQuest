# PKG-S020-SRV-02 验收记录（入店码状态校验与门店绑定）

## 任务信息

- PackageID: `PKG-S020-SRV-02`
- Lane: `server`
- CapabilityID: `SRV-C02`
- 目标: 服务端提供入店码可用性校验，并将顾客入店行为绑定到正确门店上下文。

## 能力覆盖

1. 入店码可用性校验
- 路径: `GET /api/merchant/exists?merchantId=...`
- 作用: 顾客扫码后可先校验门店是否存在，避免无效入店。

2. 入店后门店上下文绑定
- 路径: `POST /api/auth/customer/wechat-login`
- 路径: `POST /api/auth/customer/alipay-login`
- 作用: 登录会话显式绑定 `merchantId`，并在该门店作用域内建立顾客身份与后续状态查询链路。

3. 作用域一致性
- 路径: `GET /api/state?merchantId=...&userId=...`
- 作用: 顾客后续资产读取与支付链路均在同一门店上下文下执行。

## 关键实现位置

- `MealQuestServer/src/http/routes/preAuthRoutes.ts`
- `MealQuestServer/src/http/serverHelpers.ts`

## 回归验证

1. `merchant exists endpoint returns precise availability`
2. `customer wechat login binds phone as primary identity`
3. `customer alipay login merges to same account when phone is the same`

以上场景由 `MealQuestServer/test/http.integration.test.ts` 覆盖并通过。
