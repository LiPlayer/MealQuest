# PKG-S010-MER-01 验收记录（老板端口径冻结）

## 任务信息

- PackageID: `PKG-S010-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C04`
- 目标: 老板端策略文案统一到“长期价值最大化”，并明确“商户收益与 Uplift”为执行代理指标。

## 文案映射

1. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- 旧文案: `看板看结果，Agent 负责下一步建议。`
- 新文案: `围绕长期价值最大化，按商户收益与 Uplift 给出下一步建议。`

2. `MealQuestMerchant/src/screens/AgentScreen.tsx`
- 旧文案: `输入经营目标，开始一次可回放的策略协作。`
- 新文案: `输入经营目标，启动一次以长期价值为目标、可回放的策略协作。`

3. `MealQuestMerchant/src/screens/DashboardScreen.tsx`
- 旧文案: `先冻结布局骨架，后续在 S210 完整填充经营指标与趋势。`
- 新文案: `围绕长期价值最大化，持续追踪商户收益与 Uplift 变化。`

## 验证结论

1. 老板端核心入口（看板、Agent）已统一长期价值目标口径。
2. 商户收益/Uplift 仅作为执行代理指标，不替代北极星目标。
3. 与 `docs/specs/mealquest-spec.md`、`docs/roadmap.md` 当前口径一致。
