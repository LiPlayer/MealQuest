# meal-quest-customer

顾客端小程序（Taro + React）。

## 本地模式

默认使用本地 Mock 数据，无需服务端。

```powershell
npm run dev:weapp
```

## 远程联调模式

先启动服务端（见 `MealQuestServer/README.md`），再设置环境变量：

```powershell
$env:TARO_APP_USE_REMOTE_API='true'
$env:TARO_APP_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:TARO_APP_DEFAULT_STORE_ID='m_my_first_store'
npm run dev:weapp
```

说明：

1. 远程接口失败会自动回退本地 Mock，保证页面可继续使用。
2. 顾客端会通过 `/api/auth/mock-login` 自动获取测试 token。
