# MealQuest 本地发布验收 Runbook

本文件用于“最终可上线发布前”的本地闸门验收。

## 1. 一键验收（推荐）

在仓库根目录执行：

```powershell
node .\scripts\release-local.js
```

或：

```powershell
.\scripts\release-local.ps1
```

执行内容：

1. `MealQuestServer` 全量测试（含持久化、多租户、迁移、RBAC、审计、策略库、供应商核验、急售）。
2. `MealQuestServer` 本地 smoke 场景回归。
3. `MealQuestMerchant` 测试 + TypeScript 类型检查。
4. `meal-quest-customer` 测试 + `build:weapp` 构建。

输出报告：

- `artifacts/release-local-report.json`

## 1.1 环境化启动（dev/staging/prod）

已生成脚本：

1. `scripts/start-server-dev.ps1`
2. `scripts/start-server-staging.ps1`
3. `scripts/start-server-prod.ps1`

默认读取顺序：

1. `MealQuestServer/.env.<profile>.local`（优先）
2. `MealQuestServer/.env.<profile>.example`

示例：

```powershell
.\scripts\start-server-dev.ps1
.\scripts\start-server-staging.ps1
.\scripts\start-server-prod.ps1
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
   - 隐私合规（Owner 导出/删除 + Customer 自助注销）；
   - 顾客端构建可通过。
