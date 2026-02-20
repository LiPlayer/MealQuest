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

## CLI Resolution Strategy (Recommended)
The resolver uses this order:
1. `WECHAT_CLI_PATH` (explicit path, highest priority)
2. Search `PATH` (best for cross-machine portability)
3. Known default install paths (fallback)

If DevTools CLI is not in default location, set `WECHAT_CLI_PATH`.

PowerShell example:
```powershell
$env:WECHAT_CLI_PATH="C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat"
npm run test:e2e:weapp
```

If the DevTools install directory is already in `Path`, you can run e2e directly without setting `WECHAT_CLI_PATH`.

## Connect Mode
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

When `WECHAT_WS_ENDPOINT` is set, tests can connect directly without CLI path lookup.

## Doctor
Check whether this machine has at least one usable launch/connect entry:

```powershell
npm run test:e2e:doctor
```

## Structure
- `placeholder.spec.js`: e2e placeholder while card interactions are being redesigned.
- `wechat-cli-resolver.spec.js`: resolver tests for `WECHAT_CLI_PATH` / `PATH` / fallback behavior.
- `utils/wechat-devtools-cli.js`: reusable CLI path resolver.
