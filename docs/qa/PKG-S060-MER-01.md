# PKG-S060-MER-01 验收记录（老板端生命周期运营）

## 任务信息

- PackageID: `PKG-S060-MER-01`
- Lane: `merchant`
- CapabilityID: `MER-C07`
- 目标: 建立老板端生命周期策略运营能力，支撑五阶段策略的可见、启用与回放联动。

## 交付内容

1. 生命周期策略运营入口与页面承载
- 复用 `Replay` 页面新增生命周期运营区域，不新增独立 Tab。
- `Dashboard` 新增“生命周期运营”入口，支持快速跳转。

2. 生命周期策略库接入
- 接入 `GET /api/merchant/strategy-library`，展示五阶段策略状态：
  - `stage`、`templateId/templateName`、`status`、`triggerEvent`、`lastPolicyId`、`updatedAt`
- 支持策略库手动刷新与状态回读。

3. 逐阶段启用能力
- `OWNER` 接入 `POST /api/merchant/strategy-library/{templateId}/enable`，支持逐阶段启用。
- 重复启用场景展示幂等反馈（已启用状态可识别）。
- `MANAGER / CLERK` 仅可查看，不可执行启用。

4. 回放联动与可见性补齐
- 保持原回放筛选与列表能力不回归。
- `Dashboard` 接入 `engagementSummary`，补齐活跃阶段看板可见。

## 关键实现位置

- `MealQuestMerchant/src/services/apiClient.ts`
- `MealQuestMerchant/src/domain/merchantEngine.ts`
- `MealQuestMerchant/src/context/MerchantContext.tsx`
- `MealQuestMerchant/src/screens/ReplayScreen.tsx`
- `MealQuestMerchant/src/screens/DashboardScreen.tsx`

## 回归验证

1. `cd MealQuestMerchant && npm run typecheck`
2. `cd MealQuestMerchant && npm run lint`
3. `cd MealQuestMerchant && npm run test:contract:baseline`

手工检查：
- OWNER 在回放页可查看五阶段并逐阶段启用；
- MANAGER/CLERK 仅可查看并看到权限提示；
- 生命周期区域接口异常时可重试，且不阻断回放列表；
- 看板可见活跃阶段摘要并能跳转到生命周期运营。
