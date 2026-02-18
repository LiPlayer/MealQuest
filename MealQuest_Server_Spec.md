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

## 5. 安全风控 (Security)
*   **Clawback 实现**: 退款时，先计算 `(balance.bonus / balance.principal)` 比例，优先扣除赠送金，若赠送金已消费，则从本金中抵扣等值金额。
*   **幂等性**: 关键资金接口强制要求 `Idempotency-Key`。
