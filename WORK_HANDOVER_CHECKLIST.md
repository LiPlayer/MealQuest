# MealQuest 工作交接清单（换机续开发）

更新时间：2026-03-03

## 1. 当前目标状态
- Agent 定义已升级为：`AI数字运营官`（全能 Agent，不再是 chat-only 语义）。
- 服务端公开 Agent 接口已切到：`/api/agent-os/*`。
- 主契约字段已切到：`agent_id / session_id / task_id`。
- 商户端主入口路由已切到：`/(tabs)/agent`。

## 2. 本次已完成改动（关键）

### 2.1 服务端（MealQuestServer）
- 新增 Agent OS 路由：
  - `MealQuestServer/src/http/routes/agentOsRoutes.ts`
- 新增 Agent 运行时服务：
  - `MealQuestServer/src/services/agentRuntimeService.ts`
- 新增全能 Agent 服务：
  - `MealQuestServer/src/services/omniAgentService.ts`
- 组装层和路由分发已改到新命名：
  - `MealQuestServer/src/http/createHttpRequestHandler.ts`
  - `MealQuestServer/src/http/server.ts`
  - `MealQuestServer/src/http/serverHelpers.ts`
- 运行时存储主字段改为 `agentRuntime`，兼容读取旧 `agentServer`：
  - `MealQuestServer/src/store/inMemoryDb.ts`
- 删除旧文件：
  - `MealQuestServer/src/http/routes/agentServerRoutes.ts`
  - `MealQuestServer/src/services/agentServerService.ts`
  - `MealQuestServer/src/services/strategyChatService.ts`

### 2.2 商户端（MealQuestMerchant）
- Agent 页面与路由改名：
  - `MealQuestMerchant/src/screens/AgentScreen.tsx`
  - `MealQuestMerchant/app/(tabs)/agent.tsx`
  - `MealQuestMerchant/app/(tabs)/_layout.tsx`
- 登录/开店后的默认跳转改为 Agent：
  - `MealQuestMerchant/app/index.tsx`
  - `MealQuestMerchant/app/login.tsx`
  - `MealQuestMerchant/app/quick-onboard.tsx`
- 上下文重构为直接调用 `/api/agent-os`：
  - `MealQuestMerchant/src/context/MerchantContext.tsx`
- 删除旧文件：
  - `MealQuestMerchant/src/screens/StrategyScreen.tsx`
  - `MealQuestMerchant/app/(tabs)/strategy.tsx`

### 2.3 测试与文档
- 测试文件改名并同步新契约：
  - `MealQuestServer/test/agentOs.stream.integration.test.ts`
  - `MealQuestServer/test/omniAgentService.stream.test.ts`
- 删除旧测试文件：
  - `MealQuestServer/test/chat.stream.integration.test.ts`
  - `MealQuestServer/test/strategyChatService.stream.test.ts`
- 文档已同步：
  - `docs/implemented-features.md`
  - `docs/specs/mealquest-spec.md`
  - `MealQuestServer/README.md`

## 3. 验证结果（本机）
- 通过：`cd MealQuestServer && npm test`（60/60）
- 通过：`cd MealQuestMerchant && npm run typecheck`
- 通过：`npm run check:encoding`
- 注意：`npm run test`（root 聚合）仍出现已有的 file-level 失败表现；单独进 `MealQuestServer` 运行测试为全绿。

## 4. 已知事项（你下一台电脑接手前先看）
- 规格唯一真源仍是：`docs/specs/mealquest-spec.md`。
- 实现快照强制同步文档：`docs/implemented-features.md`（AGENTS.md 已要求）。
- `GET /api/merchant/catalog` 当前无业务调用依赖（仅保留接口）。
- 代码中仍有部分历史 `strategy*` 内部命名（主要在 legacy merchantService/存储结构），不影响新 Agent OS 主链路。

## 5. 下一步建议（按优先级）
1. 将 `merchantService` 内部残留 `strategy*` 命名继续收敛到 `agent*`。
2. 把 Agent 能力从“对话主导”扩展到实际可调用能力编排（账本/发票/审计/营销）。
3. 为 `/api/agent-os` 增加更细的契约测试（异常流、权限、限流、cancel/join stream 边界）。
4. 处理 root 聚合测试与单项目测试结果不一致问题（优先在 `scripts/repo-task.js` 入口定位）。

## 6. 换机后快速启动命令
```bash
cd /path/to/MealQuest
npm run bootstrap
cd MealQuestServer && npm test
cd ../MealQuestMerchant && npm run typecheck
cd .. && npm run check:encoding
```
