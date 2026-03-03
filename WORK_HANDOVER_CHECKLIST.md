# MealQuest 工作交接清单（换机续开发）

更新时间：2026-03-03

## 1. 当前状态（可直接接手）
- AI 数字运营官已统一为全能 Agent 语义。
- 服务端主入口为 `Agent OS`：`/api/agent-os/*`。
- 商户端主标签页为 `/(tabs)/agent`，登录/开店后默认进入 Agent。
- 仍保留登录与开店主链路：
  - `POST /api/auth/merchant/request-code`
  - `POST /api/auth/merchant/phone-login`
  - `POST /api/auth/merchant/complete-onboard`

## 2. 本次整理结果（关键）

### 2.1 服务端
- `merchantService` 统一为 Agent 命名：
  - `createAgentSession`
  - `getAgentSession`
  - `listAgentMessages`
  - `sendAgentMessage`
- WebSocket 仅保留 `AGENT_SEND_MESSAGE`。
- 存储字段统一为 `agentSessions`（替代旧 chat 字段命名）。
- Agent 线程模型为“每个 merchant+operator 单线程”。
- 记忆策略为短期记忆（进程内）：
  - 消息总量 `>200` 时触发压缩，仅保留最新 `40` 条消息
  - 历史消息必须经 DeepSeek 压缩为 `memory_summary`
  - DeepSeek 压缩失败或空结果时，当前请求直接失败（无 fallback）
- 旧兼容流接口已移除：`POST /api/agent-os/sessions/:sessionId/tasks/stream`（返回 404）。

### 2.2 商户端
- Agent 页面与路由已统一：
  - `MealQuestMerchant/src/screens/AgentScreen.tsx`
  - `MealQuestMerchant/app/(tabs)/agent.tsx`
  - `MealQuestMerchant/src/context/MerchantContext.tsx`
- Agent 请求统一走 `POST /api/agent-os/tasks/stream`，不再依赖客户端维护 `session_id`。

### 2.3 工程与仓库
- root `scripts/` 目录已删除。
- 根目录自动化脚本改为：
  - `repo-task.js`
  - `check-encoding.js`
- 根 `package.json` 已切换到上述脚本路径。

### 2.4 验证快照（本机）
- `cd MealQuestServer && npm test -- agentOs.stream.integration.test.ts` -> pass (`62/62`)
- `cd MealQuestMerchant && npm run typecheck` -> pass
- `npm run check:encoding` -> pass

## 3. 关键文件（优先阅读）
- `docs/specs/mealquest-spec.md`（唯一规范真源）
- `docs/implemented-features.md`（实现快照）
- `MealQuestServer/src/http/routes/agentOsRoutes.ts`
- `MealQuestServer/src/services/agentRuntimeService.ts`
- `MealQuestServer/src/services/omniAgentService.ts`
- `MealQuestServer/src/services/merchantService.ts`
- `MealQuestMerchant/src/context/MerchantContext.tsx`

## 4. 换机后快速启动
```bash
cd /path/to/MealQuest
npm run bootstrap
cd MealQuestServer && npm test -- agentOs.stream.integration.test.ts
cd ../MealQuestMerchant && npm run typecheck
cd .. && npm run check:encoding
```

## 5. 继续开发建议
1. 继续把 Agent 对话能力扩展为“可执行任务编排”（账本/发票/审计/策略）的一体化入口。
2. 强化 `/api/agent-os` 契约测试，覆盖异常流、取消/重连、权限与限流边界。
3. 每次改动同步更新 `docs/implemented-features.md`（仓库规则已在 `AGENTS.md` 固化）。
