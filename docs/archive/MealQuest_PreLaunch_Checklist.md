# MealQuest 发布前检查单

> 适用日期：2026-02-21 起  
> 目标：达到“可本地全场景演练 + 可准生产放行”标准。

## 1. 版本冻结

- [ ] 主分支已冻结功能变更，仅允许修复发布阻塞问题。
- [ ] 版本号、变更说明已记录。
- [ ] 所有发布相关文档已同步（Server/Merchant/Customer/Scenario）。

## 2. 环境配置

- [ ] 已为目标环境准备 `MealQuestServer/.env.<profile>.local`（dev/staging/prod）。
- [ ] `MQ_JWT_SECRET` 已替换为安全值（非示例值）。
- [ ] `MQ_PAYMENT_CALLBACK_SECRET` 已替换为安全值。

## 3. 安全与权限

- [ ] RBAC 验证通过：`CLERK/MANAGER/OWNER/CUSTOMER` 权限边界正确。
- [ ] 商户 scope 验证通过：跨商户读取/写入被拒绝。
- [ ] 外部支付回调验签通过：非法签名拒绝，合法签名可入账。
- [ ] 审计日志可追踪高风险动作（支付/退款/提案/熔断/迁移/隐私/回调）。

## 4. 业务链路

- [ ] 支付报价与核销链路通过（含幂等）。
- [ ] 退款回溯链路通过（赠送金优先回收）。
- [ ] 租户策略链路通过（写冻结、限流、WS 开关）。
- [ ] 切库链路通过（cutover）。
- [ ] 发票链路通过（未结算拒绝、已结算可开票）。
- [ ] 隐私链路通过（Owner 导出/匿名化删除 + Customer 自助注销）。
- [ ] 标准营销策略库链路通过（模板查询 -> 分支提案 -> 确认执行 -> 启停控制）。
- [ ] 紧急急售链路通过（`Priority:999 + TTL`）。
- [ ] 供应商核验链路通过（`/api/supplier/verify-order`）。
- [ ] 连锁联盟链路通过（集群配置 -> 共享钱包 -> 跨店支付命中）。
- [ ] 社交裂变链路通过（转赠/红包创建/红包领取，守恒校验通过）。
- [ ] 请客买单链路通过（会话创建 -> 多人出资 -> 结算/退款 -> 补贴上限校验）。
- [ ] 顾客账户中心链路通过（本人流水/本人发票可读，跨用户与跨商户查询拒绝）。

## 5. 稳定性与可观测性

- [ ] `/health` 可用，应用可启动/停止。
- [ ] `/metrics` 可读，包含请求/错误计数。
- [ ] 本地持久化重启恢复通过（策略、路由、数据快照）。
- [ ] 异常路径有明确错误码与错误消息。

## 6. 自动化闸门

- [ ] 执行 `node .\scripts\release-local.js`，全部 PASS。
- [ ] 执行 `cd .\MealQuestMerchant && npm run test:regression:ui`，商户端 UI 回归脚本 PASS。
- [ ] 执行 `cd .\meal-quest-customer && npm run test:regression:ui`，顾客端 UI 回归脚本 PASS。
- [ ] 执行 `cd .\meal-quest-customer && npm run test:e2e:doctor`，确认 E2E 环境可用。
- [ ] 执行 `cd .\meal-quest-customer && npm run test:e2e`（连接模式）或 `WECHAT_E2E_AUTO_LAUNCH=1` 后执行 `npm run test:e2e:weapp`（自动拉起模式）。
- [ ] `artifacts/release-local-report.json` 中 `allPassed=true`。
- [ ] CI 工作流通过（server test + smoke、merchant test + typecheck、customer test + customer ui regression + build）。

## 7. 发布与恢复

- [ ] 发布命令与启动命令已演练（`scripts/start-server-*.ps1`）。
- [ ] 故障恢复流程已演练：回退到上一稳定版本并恢复服务。
- [ ] 数据备份已完成并可恢复（含 `data/*.json` 快照）。

## 8. 供应商接口待接入项（商业化下一步）

- [ ] 支付供应商正式接口对接（下单、查询、退款、异步通知）。
- [ ] 电子发票供应商正式接口对接（开票、红冲、作废、下载）。
- [ ] 异业联盟供应商订单正式通道接入（当前为本地核验缓存服务）。
- [ ] 供应商 SLA、告警、重试补偿策略落地。

## 9. Android Release Ready

- [ ] NDK uses `27.1.12297006` (RN 0.84 baseline).
- [ ] Release signing secrets are set: `MQ_RELEASE_STORE_FILE`, `MQ_RELEASE_STORE_PASSWORD`, `MQ_RELEASE_KEY_ALIAS`, `MQ_RELEASE_KEY_PASSWORD`.
- [ ] Built release APK via `./scripts/build-merchant-android.ps1 -BuildType release -Artifact apk`.
- [ ] Built release AAB via `./scripts/build-merchant-android.ps1 -BuildType release -Artifact aab`.
- [ ] Release package installed and smoke-tested on real Android device.
