# PKG-S010-SRV-01 验收记录（长期价值目标口径冻结）

## 任务信息

- PackageID: `PKG-S010-SRV-01`
- Lane: `server`
- CapabilityID: `SRV-C05`
- 目标: 冻结“长期价值最大化”北极星口径，并明确“商户收益与 Uplift”为执行代理指标。

## 口径冻结结论

1. 北极星目标保持不变
- 目标函数：长期价值最大化（`Maximize Long-term Value`）。
- 长期价值口径：`Σ(客户生命周期长期价值贡献 - 营销成本)`。

2. 执行代理指标口径
- `MerchantProfitUplift30`
- `MerchantRevenueUplift30`
- `UpliftHitRate30`
- 说明：代理指标用于执行排序与运行观测，不替代北极星目标。

3. 决策目标合同
- 服务端 objective 合同固定为：
  - `targetMetric = MERCHANT_LONG_TERM_VALUE_30D`
  - `windowDays = 30`

## 真源一致性校验

1. `docs/specs/mealquest-spec.md`
- `0.1 当前生效口径`、`3.1 北极星目标函数`、`3.2 执行代理指标`、`8.3 发布门与 KPI 合同`口径一致。

2. `docs/roadmap.md`
- `S010` 老板/顾客双视角目标与 `PKG-S010-SRV-01` 任务描述一致。

## 验收结论

1. 北极星目标、执行代理、决策合同已形成一致闭环。
2. 三端后续功能实现均以该冻结口径为前置约束。
