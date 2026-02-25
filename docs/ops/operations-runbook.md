# MealQuest 运维与发布总手册

Last updated: 2026-02-25

本文件合并以下历史文档：
- `MealQuest_Release_Runbook.md`
- `MealQuest_PreLaunch_Checklist.md`
- `MealQuest_Full_Lifecycle_Handbook.md`

目标：统一“启动、联调、发布、回滚、放行标准”。

## 1. 环境准备

关键环境变量（Server）：
- `MQ_DB_URL`
- `MQ_JWT_SECRET`
- `MQ_PAYMENT_CALLBACK_SECRET`
- `MQ_ONBOARD_SECRET`
- `HOST`
- `PORT`

建议：
- 开发联调使用 `HOST=0.0.0.0`（便于局域网真机访问）
- 自动化验证使用 `HOST=127.0.0.1`

## 2. 本地启动（推荐顺序）

1. 启动服务端
```bash
cd MealQuestServer
npm start
```

2. 启动商户端
```bash
cd MealQuestMerchant
npm start
```

3. 启动顾客端（按 taro 目标）
```bash
cd meal-quest-customer
npm run dev:weapp
# 或 npm run dev:alipay
```

## 3. 发布前放行流程

在仓库根目录：

```bash
npm run verify
```

然后执行：

```bash
cd MealQuestServer
npm run test:smoke
```

## 4. 上线前检查清单（精简版）

### 4.1 安全
- JWT 与回调密钥已替换。
- 生产环境未使用默认示例密钥。

### 4.2 业务完整性
- 支付/退款/发票/隐私链路通过。
- 商户策略链路通过（提案、确认、启停、熔断）。
- 租户隔离与审计可追溯。

### 4.3 稳定性
- 所有测试通过。
- Smoke 通过。
- 关键页面可用，无阻塞 bug。

## 5. 回滚策略

出现阻塞级问题时：
1. 停止增量变更发布。
2. 回滚到最近一次 `npm run verify` 全绿版本。
3. 优先恢复支付、鉴权、租户隔离能力。
4. 回滚后重新跑 `verify + smoke`。

## 6. 历史详细版本

旧版详表已归档：
- `docs/archive/MealQuest_Release_Runbook.md`
- `docs/archive/MealQuest_PreLaunch_Checklist.md`
- `docs/archive/MealQuest_Full_Lifecycle_Handbook.md`
