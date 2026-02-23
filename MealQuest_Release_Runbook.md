# MealQuest Local Release Approval Runbook

This document is used for local gatekeeping before the "final release to production".

## 1. One-Click Approval (Recommended)

Execute at the repository root:

```powershell
node .\scripts\release-local.js
```

Steps performed:

1. Config contract verification (`scripts/verify-config-contract.js`).
2. `MealQuestServer` full testing (including persistence, multi-tenancy, migrations, RBAC, auditing, policy library, supplier verification, flash sales).
3. `MealQuestServer` local smoke scenario regression.
4. `MealQuestMerchant` testing + TypeScript type checking.
5. `MealQuestMerchant` UI reproducible regression (can be run separately: `npm run test:regression:ui`).
6. `meal-quest-customer` testing + UI reproducible regression (`npm run test:regression:ui`).
7. `meal-quest-customer` `build:weapp` build.

E2E (requires WeChat DevTools environment, executed independently):

1. `cd meal-quest-customer && npm run test:e2e:doctor`
2. Connection Mode: Set `WECHAT_WS_ENDPOINT` or `WECHAT_SERVICE_PORT` then run `npm run test:e2e`.
3. Auto-launch Mode: Set `WECHAT_E2E_AUTO_LAUNCH=1` then run `npm run test:e2e:weapp`.

Output Report:

- `artifacts/release-local-report.json`

## 1.1 Profile-based Startup (dev/staging/prod)

Core scripts:

1. `scripts/start-server.ps1`

Default loading order:

1. `MealQuestServer/.env.<profile>.local` (Priority)
2. `MealQuestServer/.env.<profile>.example`

Examples:

```powershell
.\scripts\start-server.ps1 -Profile dev
.\scripts\start-server.ps1 -Profile staging
.\scripts\start-server.ps1 -Profile prod
```

## 2. Verify Local Running Server Only (Optional)

First start the server (default `http://127.0.0.1:3030`):

```powershell
cd .\MealQuestServer
npm start
```

Run smoke tests in another terminal:

```powershell
cd .\MealQuestServer
node .\scripts\smoke-local-server.js --external --base-url http://127.0.0.1:3030
```

## 2.1 Custom Store Onboarding

Execute in server directory:

```powershell
cd .\MealQuestServer
npm run onboard:merchant -- --merchant-id m_my_first_store --name "My First Store"
```

### 🆕 专业配置模式 (Recommended)
不再手动设置环境变量，而是统一维护各端的 `.env` 文件。

**1. 服务端配置 (`MealQuestServer/.env`)**
```ini
PORT=3030
JWT_SECRET=...
```

**2. 商家端配置 (`MealQuestMerchant/.env`)**
```ini
MQ_SERVER_URL=http://<LAN_IP>:3030
MQ_MERCHANT_ID=m_my_first_store
```

**3. 用户端配置 (`meal-quest-customer/.env.development`)**
```ini
TARO_APP_SERVER_BASE_URL=http://<LAN_IP>:3030
TARO_APP_DEFAULT_STORE_ID=m_my_first_store
```

启动脚本会自动优先从这些文件加载配置。

## 3. Minimum Release Standards

1. One-click approval script all PASS.
2. `allPassed=true` in `artifacts/release-local-report.json`.
3. Critical scenario confirmation:
   - Payment / Refund / Idempotency / Auditing;
   - RBAC;
   - Multi-tenant isolation;
   - Tenant policy freezing and rate limiting;
   - Automatic database switching and rollback;
   - Standard marketing policy library (template query / branch proposal / execution confirmation / activity toggle);
   - Supplier verification and cross-industry alliance order validation;
   - Emergency Flash Sale `Priority:999 + TTL`;
   - Chain alliance shared wallet (cross-store payment hits);
   - Social fission accounting (transfer / red packet splitting with total amount conservation);
   - Group treat session (group pay / boss subsidy settlement and limit validation);
   - Customer Account Center (self-transaction / self-invoice scope validation);
   - Privacy compliance (Owner export / deletion + Customer self-deregistration);
   - Customer app build passes.

## 4. Merchant App One-Command Debug (local / online)

Run from repository root:

```powershell
# 采用配置驱动（推荐）：直接编辑 MealQuestMerchant/.env 后执行
.\scripts\start-merchant-app.ps1 -Platform android
```

Notes:

1. Script path: `scripts/start-merchant-app.ps1`.
2. It loads app config from `MealQuestMerchant/.env.local` first, then falls back to `MealQuestMerchant/.env`.
3. It starts Metro in a new terminal by default, then builds and launches debug app.
4. Use `-NoMetro` when Metro already runs, and `-NoLaunch` for env/Metro only.
5. Metro defaults to `0.0.0.0:8081` in script. You can override with `-MetroHost` / `-MetroPort`.

Official baseline for this repo (recommended):
1. React Native `0.84.x`.
2. Android NDK `27.1.12297006` (do not pin to 25/26 for this project).
3. Keep `node_modules` unpatched (no header/source hotfixes).
4. If `babel.config.js` changes, restart Metro with reset cache.

## 5. Same-LAN Phone Debug (Customer + Merchant)

Goal: use PC as server, run merchant app and customer app on phones within same Wi-Fi LAN.

1. Connect phone and PC to the same router/Wi-Fi.
2. Start LAN server from repo root:

```powershell
.\scripts\start-server-lan.ps1 -Port 3030
```

3. Copy the printed LAN IP, e.g. `192.168.31.10`.
4. Merchant app (React Native) uses LAN base URL:

```powershell
.\scripts\start-merchant-app.ps1 -Mode online -Platform android -ServerBaseUrl 'http://192.168.31.10:3030'
```

5. Customer app (mini program) uses LAN base URL:

```powershell
# 采用配置驱动（推荐）：直接编辑 meal-quest-customer/.env.development 后执行
.\scripts\start-customer-weapp.ps1
```

6. Windows firewall: allow inbound TCP 3030 for Node.js (or add explicit inbound rule).
7. WeChat DevTools real-device debug: enable "Do not verify request domain/TLS/HTTPS" for development mode.
8. Do not use `127.0.0.1` on phone. Always use PC LAN IP.

Merchant red-screen critical settings (WiFi mode):
1. In RN dev menu, set both:
   `Debug server host & port for device` = `<LAN_IP>:8081`
   `Change bundle location` = `http://<LAN_IP>:8081/index.bundle?platform=android&dev=true&minify=false`
2. Start Metro with LAN binding and cache reset:
```powershell
cd .\MealQuestMerchant
npx react-native start --host 0.0.0.0 --port 8081 --reset-cache
```
3. Quick diagnosis:
   - If app asks `localhost:8081`: phone dev menu not applied.
   - If app asks `<LAN_IP>:8081` but still red: check Metro terminal for `TransformError` (usually Babel config/dependency issue).

Update (script shortcut):

```powershell
# Customer mini program online mode in LAN (driven by env file)
.\scripts\start-customer-weapp.ps1
```

## 6. Android Release Build (APK/AAB)

Run from repository root:

```powershell
# release APK
.\scripts\build-merchant-android.ps1 -BuildType release -Artifact apk -AndroidSdkPath 'D:\AndroidDev\sdk' -Clean

# release AAB (for store upload)
.\scripts\build-merchant-android.ps1 -BuildType release -Artifact aab -AndroidSdkPath 'D:\AndroidDev\sdk'
```

Release signing (recommended for production):

```powershell
$env:MQ_RELEASE_STORE_FILE='D:\secrets\mealquest-release.jks'
$env:MQ_RELEASE_STORE_PASSWORD='***'
$env:MQ_RELEASE_KEY_ALIAS='mealquest'
$env:MQ_RELEASE_KEY_PASSWORD='***'
```

Notes:
1. `MealQuestMerchant/android/app/build.gradle` now supports `MQ_RELEASE_*` env/properties.
2. If `MQ_RELEASE_*` is missing, release build falls back to debug key for local verification only.
3. Expected outputs:
   - APK: `MealQuestMerchant/android/app/build/outputs/apk/release/app-release.apk`
   - AAB: `MealQuestMerchant/android/app/build/outputs/bundle/release/app-release.aab`

## 7. Android Release Install + Smoke Verification

Run from repository root:

```powershell
.\scripts\verify-merchant-android-release.ps1 -ApkPath '.\MealQuestMerchant\android\app\build\outputs\apk\release\app-release.apk'
```

Options:
1. `-DeviceId <adb_serial>`: target a specific device.
2. `-SkipInstall`: verify launch/runtime only for an already installed package.
3. `-SmokeSeconds <N>`: how long to wait before runtime check.
