# E2E Automation for MealQuest (Mini Program)

This directory contains end-to-end test scripts powered by `miniprogram-automator`.

## Prerequisites
1. Install WeChat DevTools.
2. Enable Service Port in DevTools.
3. Ensure build output exists:
   - `npm run build:weapp` (output folder: `dist/`)

## Run
```bash
# Unit tests only (e2e excluded)
npm test

# E2E only
npm run test:e2e

# Build + E2E
npm run test:e2e:weapp
```

## Current E2E Coverage (Required)
- `customer-core-flow.spec.js`
  - Startup first-time entry shows scan CTA.
  - Home page can reach account center.
  - Account center renders ledger/invoice modules.
  - Cancel-account action requires second confirmation.
- `wechat-cli-resolver.spec.js`
  - DevTools CLI path resolution for env/PATH/default locations.
- `mini-program-session.spec.js`
  - E2E runtime context resolution (auto-connect/launch path).

## CLI Resolution Strategy (Recommended)
The resolver uses this order:
1. `WECHAT_CLI_PATH` (explicit path, highest priority)
2. Search `PATH` (best for cross-machine portability)
3. Known default install paths (fallback)

If DevTools CLI is not in default location, set `WECHAT_CLI_PATH`.

PowerShell example:
```powershell
$env:WECHAT_CLI_PATH="C:/Program Files (x86)/Tencent/WeChatDevTools/cli.bat"
npm run test:e2e:weapp
```

If the DevTools install directory is already in `Path`, you can run e2e directly without setting `WECHAT_CLI_PATH`.

## Auto Launch (Default)
E2E now uses auto-launch by default.
Set CLI path when needed:

```powershell
$env:WECHAT_CLI_PATH="C:/Program Files (x86)/Tencent/WeChatDevTools/cli.bat"
npm run test:e2e:weapp
```

Optional auto-launch port override:

```powershell
$env:WECHAT_AUTO_PORT="9420"
```

On Windows, auto-launch uses `cli auto --auto-port` and then auto-connects to `ws://127.0.0.1:<WECHAT_AUTO_PORT>`.

## Doctor
Check whether this machine is ready for auto-launch mode:

```powershell
npm run test:e2e:doctor
```

## Structure
- `customer-core-flow.spec.js`: required business e2e flow for customer app.
- `wechat-cli-resolver.spec.js`: resolver tests for `WECHAT_CLI_PATH` / `PATH` / fallback behavior.
- `mini-program-session.spec.js`: runtime context resolver tests.
- `utils/wechat-devtools-cli.js`: reusable CLI path resolver.
- `utils/mini-program-session.js`: auto-launch session helper.
