# MealQuest 发布前检查单

> 适用日期：2026-02-21 起  
> 目标：在没有供应商接口的前提下，先完成本地/准生产发布放行。

## 1. 版本冻结

- [ ] 主分支已冻结功能变更，仅允许修复发布阻塞问题。
- [ ] 版本号、变更说明、回滚版本号已记录。
- [ ] 所有发布相关文档已同步（Server/Merchant/Customer/Scenario）。

## 2. 环境配置

- [ ] 已为目标环境准备 `MealQuestServer/.env.<profile>.local`（dev/staging/prod）。
- [ ] `MQ_JWT_SECRET` 已替换为安全值（非示例值）。
- [ ] `MQ_PAYMENT_CALLBACK_SECRET` 已替换为安全值。
- [ ] 当前阶段确认 `MQ_PAYMENT_PROVIDER=mock`（无供应商接口）。
- [ ] 当前阶段确认 `MQ_INVOICE_PROVIDER=mock`（无供应商接口）。

## 3. 安全与权限

- [ ] RBAC 验证通过：`CLERK/MANAGER/OWNER/CUSTOMER` 权限边界正确。
- [ ] 商户 scope 验证通过：跨商户读取/写入被拒绝。
- [ ] 外部支付回调验签通过：非法签名拒绝，合法签名可入账。
- [ ] 审计日志可追踪高风险动作（支付/退款/提案/熔断/迁移/隐私/回调）。

## 4. 业务链路

- [ ] 支付报价与核销链路通过（含幂等）。
- [ ] 退款回溯链路通过（赠送金优先回收）。
- [ ] 租户策略链路通过（写冻结、限流、WS 开关）。
- [ ] 切库与回滚链路通过（cutover/rollback）。
- [ ] 发票链路通过（未结算拒绝、已结算可开票）。
- [ ] 隐私链路通过（Owner 导出与匿名化删除）。

## 5. 稳定性与可观测性

- [ ] `/health` 可用，应用可启动/停止。
- [ ] `/metrics` 可读，包含请求/错误计数。
- [ ] 本地持久化重启恢复通过（策略、路由、数据快照）。
- [ ] 异常路径有明确错误码与错误消息。

## 6. 自动化闸门

- [ ] 执行 `node .\scripts\release-local.js`，全部 PASS。
- [ ] `artifacts/release-local-report.json` 中 `allPassed=true`。
- [ ] CI 工作流通过（server test + smoke、merchant test + typecheck、customer test + build）。

## 7. 发布与回滚

- [ ] 发布命令与启动命令已演练（`scripts/start-server-*.ps1`）。
- [ ] 回滚流程已演练：回退到上一稳定版本并恢复服务。
- [ ] 数据备份已完成并可恢复（含 `data/*.json` 快照）。

## 8. 供应商接口待接入项（当前已知未完成）

- [ ] 支付供应商正式接口对接（下单、查询、退款、异步通知）。
- [ ] 电子发票供应商正式接口对接（开票、红冲、作废、下载）。
- [ ] 供应商 SLA、告警、重试补偿策略落地。
