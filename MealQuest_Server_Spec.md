# 餐餐有戏 - 服务端技术架构规范 (Master Server Spec V1.0)

> **关联文档**: [餐餐有戏 - 产品全景定义白皮书](./MealQuest_Spec.md)

## 1. 核心架构设计
本系统采用 **Serverless (云原生)** 架构，以应对高并发的扫码点单与实时营销推送。

### 1.1 技术栈选型
*   **计算层**: 云函数 (Cloud Functions) - 弹性伸缩，按量计费。
*   **数据库**: 文档型数据库 (NoSQL) - 适配灵活的 JSON 结构 (Story Protocol)。
*   **实时通道**: WebSocket - 用于商户端指令下发与 C 端资产推送。

## 2. 数据模型 (Data Schema)

### 2.1 商户 (Merchants)
*   `merchant_id`: String (Key)
*   `basic_info`: { name, logo, address, location: [lat, lon] }
*   `config`: { profit_margin_threshold, auto_print: bool }
*   `staff`: [ { uid, role, permissions } ]

### 2.2 用户 (Users)
*   `uid`: String (Key, OpenID)
*   `wallets`: 
    *   `silver`: Integer (碎银)
    *   `balance`: { principal: Float, bonus: Float } (储值)
*   `stats`: { total_steps, join_date, tags: [] }

### 2.3 资产库存 (Asset_Inventory)
*   `owner_id`: String (User UID)
*   `merchant_id`: String (Scoped to Merchant)
*   `fragments`: { "fragment_id": count }
*   `cards`: [ { card_id, uuid, expiry_date, status: "ACTIVE"|"USED" } ]
*   `stock_config`: { 
    "card_id": { 
        "daily_cap": Integer,   // 每日最大供应量
        "current_stock": Integer // 当前剩余量 (每日重置)
    } 
}

### 2.4 交易流水 (Ledger)
*   `txn_id`: String (Unique)
*   `type`: "RECHARGE" | "PAYMENT" | "REFUND" | "MARKET_BUY"
*   `amount`: Float
*   `assets_change`: JSON (Diff)
*   `timestamp`: ISO8601

## 3. 核心 API 协议

### 3.1 鉴权 (Auth)
*   所有请求 Header 需携带 `Authorization: Bearer <JWT>`。
*   商户端 JWT 包含 `merchant_id` 与 `role`。

### 3.2 资产交互
*   `POST /api/assets/synthesize`: 合成入席令 (消耗碎片 -> 生成 Card)。
*   `POST /api/market/trade`: 集市交易 (消耗碎银 <-> 获得碎片)。

### 3.3 支付与核销
*   `POST /api/payment/create`: 创建预支付订单。
*   `POST /api/payment/verify`: (商户端) 扫码核销入席令/收款。
    *   *逻辑*: 验证 `card_uuid` 有效性 -> 更新状态为 `USED` -> 触发 WebSocket 通知 C 端。

## 4. TCA 规则引擎实现
*   **触发**: 监听 EventBus (如 `USER_ENTER_SHOP`, `WEATHER_CHANGE`).
*   **判定**: 
    1.  加载当前商户的 `active_campaigns`.
    2.  根据 `user.tags` 与环境上下文计算权重.
    3.  **Budget Check**: 检查 `daily_budget_used < daily_budget_cap`.
*   **执行**: 生成 `Story JSON` 并通过 WebSocket 推送至客户端.

## 6. AI Agent 体系 (The Brain)

> **技术核心**: 采用 **DeepSeek** (低成本推理) + **LangGraph** (人机协同工作流) 构建。

### 6.1 架构层级
由于 Agent 需维持长会话与复杂状态，建议剥离出独立的 **Agent Service (Python)**，与主 Serverless 环境异步交互。

*   **Model Layer**: `DeepSeek-V3` (用于意图理解/文案生成) + `DeepSeek-R1` (用于复杂商业策略推理)。
*   **Orchestration**: `LangGraph`。利用其 **Checkpointers (PostgreSQL)** 实现长时间跨度的 "Human-in-the-loop" 流程。
*   **Memory**: 
    *   **Short-term**: 当前对话上下文 (Redis)。
    *   **Long-term**: 向量数据库 (PgVector)，存储商户的历史偏好 ("老板不喜欢打折，喜欢送菜")。

### 6.2 核心 Agent 工作流 (LangGraph Definitions)

#### Workflow A: 智能策略提案 (The Strategist)
此流程解决“AI 主动建议”与“老板确认”的异步问题。
1.  **Node: Sense (感知)**: 定时任务/事件触发。拉取 `Ledger` (流水) 与 `Inventory` (库存) 数据。
2.  **Node: Reason (推理)**: DeepSeek 分析数据。
    *   *Input*: "库存: 鸭脖积压 500份; 天气: 暴雨"。
    *   *System Prompt*: "你是一个精明的店长，请制定去库存策略，必须保证毛利 > 40%"。
3.  **Node: Propose (提案)**: 生成结构化 `Proposal JSON` (包含 UI 卡片数据)。
4.  **Node: Interrupt (中断/等待)**: **关键步骤**。
    *   将 Workflow 状态持久化至 DB。
    *   向老板 App 推送 "新策略待办"。
    *   **结束本次运行** (释放计算资源)。
5.  **Node: Resume (恢复/执行)**: 
    *   触发源: 老板 App 点击 "同意"。
    *   读取 Proposal，调用 `TCA Engine` 写入规则。

#### Workflow B: 资产工场 (The Artist)
此流程解决“老板一句话生成 2D 资产”的问题。
1.  **Node: Intent (意图)**: 解析 "弄一张麻辣小龙虾的图"。
2.  **Node: Prompt (优化)**: DeepSeek 改写为绘图 Prompt ("Isometric, 3D render, clay texture...").
3.  **Node: Generate (绘图)**: 调用绘图模型 API (异步等待)。
4.  **Node: Review (初审)**: (可选) Vision Model 检查图片是否有崩坏/不雅内容。
5.  **Node: Wait (人工选图)**: 推送 4 张缩略图给老板。 **(Interrupt)**
6.  **Node: Mint (铸造)**: 老板中选 1 张 -> 上传 CDN -> 注册 `Asset ID`。

### 6.3 交互协议 (Copilot API)
*   `POST /api/agent/webhook`: 接收 LangGraph 的回调 (如推送建议到手机)。
*   `POST /api/agent/command`: 接收老板的自然语言指令 -> 触发 LangGraph 启动。
*   `POST /api/agent/resume/{thread_id}`: 老板点击确认 -> 唤醒挂起的 Graph 继续执行。

## 7. 安全风控 (Security)
*   **Clawback 实现**: 退款时，先计算 `(balance.bonus / balance.principal)` 比例，优先扣除赠送金，若赠送金已消费，则从本金中抵扣等值金额。
*   **幂等性**: 关键资金接口强制要求 `Idempotency-Key`。
*   **AI 幻觉防护**: 所有 AI 生成的 `Story JSON` 在下发前必须经过 JSON Schema 强校验，防止字段丢失导致客户端崩溃。

## 8. 卓越工程与运维体系 (Engineering Excellence)

### 8.1 基础设施 (Infrastructure)
*   **多环境隔离**:
    *   `DEV`: 开发调试，连接本地数据库或云端开发实例。
    *   `STAGING`: 预发环境，数据脱敏，连接 Staging 数据库 (从 Prod 每日快照恢复)。
    *   `PROD`: 生产环境，严格权限控制 (SRE Only)。
*   **容器化策略**:
    *   **Core API (Serverless)**: 打包为 Docker Image 部署至 AWS Lambda / Cloud Run / 阿里云 FC。
    *   **Agent Service (Stateful)**: 部署至 K8s Cluster / Fargate，保持长连接与任务队列消费。

### 8.2 可观测性 (Observability)
采用 **OpenTelemetry** 标准构建全链路监控：
*   **Logs**: 结构化 JSON 日志 (Loki / ELK)。关键字段: `trace_id`, `merchant_id`, `user_uid`, `duration_ms`.
*   **Metrics**: 
    *   **业务指标**: `order_count`, `asset_mint_rate`, `ai_agent_token_usage`.
    *   **系统指标**: CPU/RAM, GC pause, API Latency (P95/P99).
*   **Tracing**: 全链路追踪 (Jaeger / Tempo)。串联 `User App -> API Gateway -> TCA Engine -> Agent Service -> Database` 的完整调用链。
*   **Alerting**: 
    *   P0级报警: 支付成功率跌破 99%、API P99 > 2s、Agent 任务队列积压 > 1000。
    *   通道: PagerDuty / 钉钉机器人 / 邮件。

### 8.3 CI/CD 流水线
*   **Code Review**: 必须通过 Lint (ESLint/Black) 与 Unit Test 才能合并 PR。
*   **Automated Testing**:
    *   **Unit Test**: 覆盖核心算法 (如 Clawback 退款、TCA 权重计算)。
    *   **Integration Test**: 模拟完整交易链路 (充值 -> 购买 -> 核销)。
    *   **E2E Test**: Playwright 脚本每日定时巡检核心页面 (C端首页, B端收银台)。

### 8.4 韧性设计 (Resilience)
*   **限流 (Rate Limiting)**: 
    *   API 网关层: 基于 IP 和 `user_uid` 的漏桶算法 (Leaky Bucket)，防止恶意刷接口。单用户限频 10 QPS。
    *   Agent 层: 限制 DeepSeek API 调用频率，超出部分进入等待队列 (Exponential Backoff)。
*   **熔断 (Circuit Breaker)**: 当下游依赖 (如各种第三方支付 API、AI 模型 API) 错误率 > 20% 时，自动触发熔断，降级为“默认静态响应”或“系统繁忙提示”，防止雪崩。
*   **灾难恢复 (DR)**: 
    *   数据库: 开启 PITR (Point-in-Time Recovery)，支持恢复到任意秒级时间点。
    *   多可用区 (Multi-AZ): 核心服务跨可用区部署，防止单机房故障。

## 9. 数据库运维规范
*   **索引优化**: 定期分析慢查询 (Slow Query Log)，对高频查询字段 (`merchant_id`, `status`, `timestamp`) 建立复合索引。
*   **冷热分离**: 
    *   **Hot**: 最近 3 个月的订单与活跃资产 -> 主数据库 (SSD)。
    *   **Cold**: 超过 6 个月的历史流水与失效资产 -> 归档至冷存储 (S3 / OSS / Cold DB)，仅支持异步查询。
