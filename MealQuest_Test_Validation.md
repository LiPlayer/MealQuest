# MealQuest 测试与验证总册

Last updated: 2026-02-25

本文件合并以下历史文档：
- `MealQuest_Full_Function_Test_Guide.md`
- `MealQuest_Scenario_Validation.md`

目标：用一份文档完成“自动化回归 + 场景验证 + 验收标准”。

## 1. 一键回归（推荐）

在仓库根目录执行：

```bash
npm run verify
```

说明：该命令会串行执行三端 `lint + typecheck + test`。

跨平台脚本：
- Linux/macOS: `./scripts/verify-all.sh`
- Windows: `./scripts/verify-all.ps1`

## 2. 服务器专项验证

在 `MealQuestServer` 目录：

```bash
npm test
npm run test:smoke
```

`smoke` 覆盖场景：
- 支付报价/核销/退款
- RBAC 与商户作用域
- WebSocket 实时事件
- 审计日志查询
- 租户策略（冻结/限流）
- 迁移切换与回滚
- 策略提案/确认/状态切换
- 联盟与跨店钱包
- 顾客中心（账单/发票/注销）

## 3. 双端（商户/顾客）验证

在各子工程目录：

```bash
# Merchant
npm test -- --runInBand
npm run lint
npm run typecheck

# Customer
npm test -- --runInBand
npm run lint
npm run typecheck
```

## 4. 场景回归最小集（上线前必须）

### 4.1 顾客侧
- 扫码进入门店
- 智能抵扣支付（券/赠送金/本金/碎银/外部支付）
- 账务流水与发票查询
- 注销账号

### 4.2 商户侧
- 登录/开店/进件链路
- 策略提案 -> 确认 -> 生效
- 活动启停
- 熔断开关
- 审计查看

### 4.3 服务端
- 支付与退款回溯守恒
- 回调验签
- 租户隔离与策略限流
- 切库与回滚

## 5. 验收标准

全部满足才算通过：
1. `npm run verify` 通过。
2. `MealQuestServer` smoke 通过。
3. 三端核心链路人工点测通过。
4. 无阻塞级问题（支付失败、跨租户串数据、权限越权、关键流程不可用）。

## 6. 历史详细记录

旧版详表已归档：
- `docs/archive/MealQuest_Full_Function_Test_Guide.md`
- `docs/archive/MealQuest_Scenario_Validation.md`
