# MealQuest æœ¬åœ°å‘å¸ƒéªŒæ”¶ Runbook

æœ¬æ–‡ä»¶ç”¨äºŽâ€œæœ€ç»ˆå¯ä¸Šçº¿å‘å¸ƒå‰â€çš„æœ¬åœ°é—¸é—¨éªŒæ”¶ã€‚

## 1. ä¸€é”®éªŒæ”¶ï¼ˆæŽ¨èï¼‰

åœ¨ä»“åº“æ ¹ç›®å½•æ‰§è¡Œï¼š

```powershell
node .\scripts\release-local.js
```

æ‰§è¡Œå†…å®¹ï¼š

1. `MealQuestServer` å…¨é‡æµ‹è¯•ï¼ˆå«æŒä¹…åŒ–ã€å¤šç§Ÿæˆ·ã€è¿ç§»ã€RBACã€å®¡è®¡ã€ç­–ç•¥åº“ã€ä¾›åº”å•†æ ¸éªŒã€æ€¥å”®ï¼‰ã€‚
2. `MealQuestServer` æœ¬åœ° smoke åœºæ™¯å›žå½’ã€‚
3. `MealQuestMerchant` æµ‹è¯• + TypeScript ç±»åž‹æ£€æŸ¥ã€‚
4. `MealQuestMerchant` UI å¯å¤çŽ°å›žå½’ï¼ˆå¯å•ç‹¬æ‰§è¡Œï¼š`npm run test:regression:ui`ï¼‰ã€‚
5. `meal-quest-customer` æµ‹è¯• + UI å¯å¤çŽ°å›žå½’ï¼ˆ`npm run test:regression:ui`ï¼‰ã€‚
6. `meal-quest-customer` `build:weapp` æž„å»ºã€‚

E2Eï¼ˆéœ€è¦å¾®ä¿¡å¼€å‘è€…å·¥å…·çŽ¯å¢ƒï¼Œç‹¬ç«‹æ‰§è¡Œï¼‰ï¼š

1. `cd meal-quest-customer && npm run test:e2e:doctor`
2. è¿žæŽ¥æ¨¡å¼ï¼šè®¾ç½® `WECHAT_WS_ENDPOINT` æˆ– `WECHAT_SERVICE_PORT` åŽæ‰§è¡Œ `npm run test:e2e`
3. è‡ªåŠ¨æ‹‰èµ·æ¨¡å¼ï¼šè®¾ç½® `WECHAT_E2E_AUTO_LAUNCH=1` åŽæ‰§è¡Œ `npm run test:e2e:weapp`

è¾“å‡ºæŠ¥å‘Šï¼š

- `artifacts/release-local-report.json`

## 1.1 çŽ¯å¢ƒåŒ–å¯åŠ¨ï¼ˆdev/staging/prodï¼‰

æ ¸å¿ƒè„šæœ¬ï¼š

1. `scripts/start-server.ps1`

é»˜è®¤è¯»å–é¡ºåºï¼š

1. `MealQuestServer/.env.<profile>.local`ï¼ˆä¼˜å…ˆï¼‰
2. `MealQuestServer/.env.<profile>.example`

ç¤ºä¾‹ï¼š

```powershell
.\scripts\start-server.ps1 -Profile dev
.\scripts\start-server.ps1 -Profile staging
.\scripts\start-server.ps1 -Profile prod
```

## 2. ä»…éªŒæ”¶æœ¬åœ°è¿è¡Œä¸­çš„æœåŠ¡ç«¯ï¼ˆå¯é€‰ï¼‰

å…ˆå¯åŠ¨æœåŠ¡ç«¯ï¼ˆé»˜è®¤ `http://127.0.0.1:3030`ï¼‰ï¼š

```powershell
cd .\MealQuestServer
npm start
```

å¦å¼€ç»ˆç«¯æ‰§è¡Œ smokeï¼š

```powershell
cd .\MealQuestServer
node .\scripts\smoke-local-server.js --external --base-url http://127.0.0.1:3030
```

## 2.1 è‡ªå®šä¹‰å¼€åº—ï¼ˆæ— éœ€ä½¿ç”¨ m_demoï¼‰

åœ¨æœåŠ¡ç«¯ç›®å½•æ‰§è¡Œï¼š

```powershell
cd .\MealQuestServer
npm run onboard:merchant -- --merchant-id m_my_first_store --name "æˆ‘çš„ç¬¬ä¸€å®¶åº—"
```

å•†æˆ·ç«¯è”è°ƒæ—¶è®¾ç½®ï¼š

```powershell
$env:MQ_USE_REMOTE_API='true'
$env:MQ_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:MQ_MERCHANT_ID='m_my_first_store'
```

é¡¾å®¢ç«¯è”è°ƒæ—¶è®¾ç½®ï¼š

```powershell
$env:TARO_APP_USE_REMOTE_API='true'
$env:TARO_APP_SERVER_BASE_URL='http://127.0.0.1:3030'
$env:TARO_APP_DEFAULT_STORE_ID='m_my_first_store'
```

## 3. ä¸Šçº¿å‰æœ€å°æ”¾è¡Œæ ‡å‡†

1. ä¸€é”®éªŒæ”¶è„šæœ¬å…¨éƒ¨ PASSã€‚
2. `artifacts/release-local-report.json` ä¸­ `allPassed=true`ã€‚
3. å…³é”®åœºæ™¯ç¡®è®¤ï¼š
   - æ”¯ä»˜/é€€æ¬¾/å¹‚ç­‰/å®¡è®¡ï¼›
   - RBACï¼›
   - å¤šç§Ÿæˆ·éš”ç¦»ï¼›
   - ç§Ÿæˆ·ç­–ç•¥å†»ç»“ä¸Žé™æµï¼›
   - è‡ªåŠ¨åˆ‡åº“ä¸Žå›žæ»šï¼›
   - æ ‡å‡†è¥é”€ç­–ç•¥åº“ï¼ˆæ¨¡æ¿æŸ¥è¯¢/åˆ†æ”¯ææ¡ˆ/ç¡®è®¤æ‰§è¡Œ/æ´»åŠ¨å¯åœï¼‰ï¼›
   - ä¾›åº”å•†æ ¸éªŒä¸Žå¼‚ä¸šè”ç›Ÿè®¢å•æ ¡éªŒï¼›
   - ç´§æ€¥æ€¥å”® `Priority:999 + TTL`ï¼›
   - è¿žé”è”ç›Ÿå…±äº«é’±åŒ…ï¼ˆè·¨åº—æ”¯ä»˜å‘½ä¸­ï¼‰ï¼›
   - ç¤¾äº¤è£‚å˜è´¦åŠ¡ï¼ˆè½¬èµ /çº¢åŒ…åˆ†è´¦æ€»é‡å®ˆæ’ï¼‰ï¼›
   - è¯·å®¢ä¹°å•ä¼šè¯ï¼ˆç¾¤ä¹°å•/è€æ¿è¡¥è´´ç»“ç®—ä¸Žä¸Šé™æ ¡éªŒï¼‰ï¼›
   - é¡¾å®¢è´¦æˆ·ä¸­å¿ƒï¼ˆæœ¬äººæµæ°´/æœ¬äººå‘ç¥¨ scope æ ¡éªŒï¼‰ï¼›
   - éšç§åˆè§„ï¼ˆOwner å¯¼å‡º/åˆ é™¤ + Customer è‡ªåŠ©æ³¨é”€ï¼‰ï¼›
   - é¡¾å®¢ç«¯æž„å»ºå¯é€šè¿‡ã€‚

## 4. Merchant App One-Command Debug (online only)

Run from repository root:

```powershell
# online mode (remote API + optional auto server startup)
.\scripts\start-merchant-app.ps1 -Platform android -ServerBaseUrl 'http://127.0.0.1:3030' -AutoStartServer
```

Notes:

1. Script path: `scripts/start-merchant-app.ps1`.
2. It auto injects `MQ_ENABLE_ENTRY_FLOW`, `MQ_USE_REMOTE_API`, `MQ_SERVER_BASE_URL`, `MQ_MERCHANT_ID`.
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
.\scripts\start-merchant-app.ps1 -Platform android -ServerBaseUrl 'http://192.168.31.10:3030'
```

5. Customer app (mini program) uses LAN base URL:

```powershell
cd .\meal-quest-customer
$env:TARO_APP_USE_REMOTE_API='true'
$env:TARO_APP_SERVER_BASE_URL='http://192.168.31.10:3030'
$env:TARO_APP_DEFAULT_STORE_ID='m_my_first_store'
npm run dev:weapp
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
# Customer mini program online mode in LAN
.\scripts\start-customer-weapp.ps1 -ServerBaseUrl 'http://192.168.31.10:3030'
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


