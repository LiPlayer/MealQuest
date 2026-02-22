# MealQuestMerchant

商户端 React Native 应用（驾驶舱 + 收银 + 策略确认）。

## 老板首登流程（默认开启）

应用首次进入会走老板引导流程：

1. 手机号登录（验证码）
2. 新手引导
3. 开店（创建商户）
4. 特约商户入驻申请
5. 进入经营驾驶舱

测试环境默认开启；如需关闭可设置：

```powershell
$env:MQ_ENABLE_ENTRY_FLOW='false'
```

## 本地演练模式

默认使用本地域引擎，不依赖后端。

```powershell
npm start
npm run android
```

## 远程联调模式

先启动服务端（见 `MealQuestServer/README.md`），然后在当前终端设置：

```powershell
$env:MQ_USE_REMOTE_API='true'
$env:MQ_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:MQ_MERCHANT_ID='m_my_first_store'
npm start
npm run android
```

说明：

1. 远程模式会调用服务端 API（提案确认、熔断、TCA 触发）。  
2. 远程模式会建立 `/ws` 实时通道，展示支付/策略等事件流。  
3. 远程模式会拉取 `/api/audit/logs` 审计流水，支持动作/状态/时间筛选与分页查看。  
4. 远程连接失败会自动降级回本地模式。
