# E2E Automation for MealQuest (Mini Program)

This directory contains end-to-end test scripts powered by `miniprogram-automator`.

## Prerequisites
1. Install WeChat DevTools.
2. Enable Service Port in DevTools.
3. Ensure build output exists:
   - `npm run build:weapp`

## Run
```bash
# Unit tests only (e2e excluded)
npm test

# E2E only
npm run test:e2e

# Build + E2E
npm run test:e2e:weapp
```

If DevTools CLI is not in default location, set `WECHAT_CLI_PATH`.

PowerShell example:
```powershell
$env:WECHAT_CLI_PATH="C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat"
npm run test:e2e:weapp
```

If CLI launch is restricted on your machine, run with connect mode:

```powershell
$env:WECHAT_SERVICE_PORT="33358"
npm run test:e2e
```

You can still force a known websocket endpoint directly:

```powershell
$env:WECHAT_WS_ENDPOINT="ws://127.0.0.1:<actual_ws_port>"
npm run test:e2e
```

When `WECHAT_WS_ENDPOINT` is set, the test will auto-try `cli auto --auto-port` if direct connect fails.

## Structure
- `flow.spec.js`: card drag regression for `Card N -> peek Card N`.
