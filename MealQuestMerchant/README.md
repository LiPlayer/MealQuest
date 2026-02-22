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

## 驾驶舱联调模式

商户端驾驶舱默认连接后端服务。请确保服务端已启动（见 `MealQuestServer/README.md`），然后使用 Quick Start 脚本启动。

说明：

1. 联调模式会调用服务端 API（提案确认、熔断、TCA 触发）。  
2. 联调模式会建立 `/ws` 实时通道，展示支付/策略等事件流。  
3. 联调模式会拉取 `/api/audit/logs` 审计流水，支持动作/状态/时间筛选与分页查看。  
4. 如果连接失败，驾驶舱将显示“正在连接...”或“连接未就绪”。

## Quick Start Script

在仓库根目录下运行。该脚本会自动设置环境变量、构建并启动 Debug 应用。

```powershell
# 启动商户端并指定后端地址
.\scripts\start-merchant-app.ps1 -Platform android -ServerUrl 'http://192.168.x.x:3030'
```

可选参数：

1. `-AutoStartServer`: 自动在后台启动本地服务端。
2. `-NoMetro`: 跳过启动 Metro（如果 Metro 已在运行）。注意：如果环境配置有变，请重启 Metro。
3. `-NoLaunch`: 仅设置环境并启动 Metro，跳过应用安装/运行步骤。
4. `-Platform ios`: 启动 iOS 调试应用。
5. `-MerchantId <id>`: 覆盖默认商户 ID（默认为 `m_my_first_store`）。

