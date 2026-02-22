# MealQuest 本地发布验收 Runbook

本文件用于“最终可上线发布前”的本地闸门验收。

## 1. 一键验收（推荐）

在仓库根目录执行：

```powershell
node .\scripts\release-local.js
```

执行内容：

1. `MealQuestServer` 全量测试（含持久化、多租户、迁移、RBAC、审计、策略库、供应商核验、急售）。
2. `MealQuestServer` 本地 smoke 场景回归。
3. `MealQuestMerchant` 测试 + TypeScript 类型检查。
4. `MealQuestMerchant` UI 可复现回归（可单独执行：`npm run test:regression:ui`）。
5. `meal-quest-customer` 测试 + UI 可复现回归（`npm run test:regression:ui`）。
6. `meal-quest-customer` `build:weapp` 构建。

E2E（需要微信开发者工具环境，独立执行）：

1. `cd meal-quest-customer && npm run test:e2e:doctor`
2. 连接模式：设置 `WECHAT_WS_ENDPOINT` 或 `WECHAT_SERVICE_PORT` 后执行 `npm run test:e2e`
3. 自动拉起模式：设置 `WECHAT_E2E_AUTO_LAUNCH=1` 后执行 `npm run test:e2e:weapp`

输出报告：

- `artifacts/release-local-report.json`

## 1.1 环境化启动（dev/staging/prod）

核心脚本：

1. `scripts/start-server.ps1`

默认读取顺序：

1. `MealQuestServer/.env.<profile>.local`（优先）
2. `MealQuestServer/.env.<profile>.example`

示例：

```powershell
.\scripts\start-server.ps1 -Profile dev
.\scripts\start-server.ps1 -Profile staging
.\scripts\start-server.ps1 -Profile prod
```

## 2. 仅验收本地运行中的服务端（可选）

先启动服务端（默认 `http://127.0.0.1:3030`）：

```powershell
cd .\MealQuestServer
npm start
```

另开终端执行 smoke：

```powershell
cd .\MealQuestServer
node .\scripts\smoke-local-server.js --external --base-url http://127.0.0.1:3030
```

## 2.1 自定义开店（无需使用 m_demo）

在服务端目录执行：

```powershell
cd .\MealQuestServer
npm run onboard:merchant -- --merchant-id m_my_first_store --name "我的第一家店"
```

商户端联调时设置：

```powershell
$env:MQ_USE_REMOTE_API='true'
$env:MQ_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:MQ_MERCHANT_ID='m_my_first_store'
```

顾客端联调时设置：

```powershell
$env:TARO_APP_USE_REMOTE_API='true'
$env:TARO_APP_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:TARO_APP_DEFAULT_STORE_ID='m_my_first_store'
```

## 3. 上线前最小放行标准

1. 一键验收脚本全部 PASS。
2. `artifacts/release-local-report.json` 中 `allPassed=true`。
3. 关键场景确认：
   - 支付/退款/幂等/审计；
   - RBAC；
   - 多租户隔离；
   - 租户策略冻结与限流；
   - 自动切库与回滚；
   - 标准营销策略库（模板查询/分支提案/确认执行/活动启停）；
   - 供应商核验与异业联盟订单校验；
   - 紧急急售 `Priority:999 + TTL`；
   - 连锁联盟共享钱包（跨店支付命中）；
   - 社交裂变账务（转赠/红包分账总量守恒）；
   - 请客买单会话（群买单/老板补贴结算与上限校验）；
   - 顾客账户中心（本人流水/本人发票 scope 校验）；
   - 隐私合规（Owner 导出/删除 + Customer 自助注销）；
   - 顾客端构建可通过。

## 4. Merchant App One-Command Debug (local / online)

Run from repository root:

```powershell
# local mode (offline domain engine)
.\scripts\start-merchant-app.ps1 -Mode local -Platform android

# online mode (remote API + optional auto server startup)
.\scripts\start-merchant-app.ps1 -Mode online -Platform android -ServerBaseUrl 'http://127.0.0.1:3030' -AutoStartServer
```

Notes:

1. Script path: `scripts/start-merchant-app.ps1`.
2. It auto injects `MQ_ENABLE_ENTRY_FLOW`, `MQ_USE_REMOTE_API`, `MQ_SERVER_BASE_URL`, `MQ_MERCHANT_ID`.
3. It starts Metro in a new terminal by default, then builds and launches debug app.
4. Use `-NoMetro` when Metro already runs, and `-NoLaunch` for env/Metro only.

## 5. Same-LAN Phone Debug (Customer + Merchant)

Goal: use PC as server, run merchant app and customer app on phones within same Wi-Fi LAN.

1. Connect phone and PC to the same router/Wi-Fi.
2. Start LAN server from repo root:

```powershell
.\scripts\start-server-lan.ps1 -Port 3030
```

3. Copy the printed LAN IP, e.g. `192.168.31.10`.
4. Merchant app (React Native) uses LAN base URL:

```powershell
.\scripts\start-merchant-app.ps1 -Mode online -Platform android -ServerBaseUrl 'http://192.168.31.10:3030'
```

5. Customer app (mini program) uses LAN base URL:

```powershell
cd .\meal-quest-customer
$env:TARO_APP_USE_REMOTE_API='true'
$env:TARO_APP_SERVER_BASE_URL='http://192.168.31.10:3030'
$env:TARO_APP_DEFAULT_STORE_ID='m_my_first_store'
npm run dev:weapp
```

6. Windows firewall: allow inbound TCP 3030 for Node.js (or add explicit inbound rule).
7. WeChat DevTools real-device debug: enable "Do not verify request domain/TLS/HTTPS" for development mode.
8. Do not use `127.0.0.1` on phone. Always use PC LAN IP.

Update (script shortcut):

```powershell
# Customer mini program online mode in LAN
.\scripts\start-customer-weapp.ps1 -Mode online -ServerBaseUrl 'http://192.168.31.10:3030' -StoreId 'm_my_first_store'
```
