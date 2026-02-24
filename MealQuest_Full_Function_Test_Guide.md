# MealQuest Full Function Test Guide

Last updated: 2026-02-24

This guide is the single path to validate the current end-to-end feature set across:
- `MealQuestServer`
- `MealQuestMerchant` (React Native)
- `meal-quest-customer` (Taro WeChat/Alipay mini program)

## 1) One-command automated regression

Run from repo root:

```powershell
node .\scripts\release-local.js
```

Expected:
- all steps are `PASS`
- report is generated at `artifacts/release-local-report.json`

Current automated coverage:
- Config contract check
- Server full test suite
- Server smoke scenarios `A-M`
- Merchant unit/regression tests + typecheck
- Customer unit/regression tests
- Customer build for `weapp` and `alipay`

## 2) Server smoke scenario mapping

`MealQuestServer/scripts/smoke-local-server.js` covers:

- `A` payment quote/verify/refund + RBAC
- `B` websocket + ws scope
- `C` proposal + trigger + kill switch
- `D` audit query
- `E` tenant policy freeze + rate limit
- `F` migration step + cutover + rollback
- `G` strategy library + proposal + campaign status
- `H` supplier verify + fire sale
- `I` alliance config + wallet share + cross-store sync
- `J` social transfer + red packet
- `K` treat paying session
- `L` customer center ledger + invoice list
- `M` customer self-service cancel-account

## 3) Manual real-device checks

Automated tests do not replace real super-app login and camera/scan flows.

### 3.1 Merchant RN app first-launch and guide behavior

Goal:
- first install shows guide/onboarding
- reopen app keeps settled state
- clear app data re-enters onboarding

Suggested check:
1. Fresh install merchant app.
2. Complete onboarding.
3. Kill and reopen app: should stay in settled merchant view.
4. Clear app data on device.
5. Reopen app: should return to onboarding guide.

### 3.2 Customer mini program login and core loop (WeChat)

Goal:
- no manual id input, store resolved by scan/store name flow
- login -> state -> pay -> ledger/invoice/account center works

Suggested check:
1. Build/run customer weapp.
2. Enter via store QR/entry.
3. Complete login and phone binding.
4. Execute a payment.
5. Verify ledger and invoice list in account center.
6. Verify cancel-account flow on a test account.

### 3.3 Customer mini program login and core loop (Alipay)

Goal:
- same flow as WeChat
- same phone maps to same account per merchant

Suggested check:
1. Build/run customer alipay mini program.
2. Login with a phone number already used in WeChat flow.
3. Verify account center shows same user asset continuity for same merchant.

## 4) Optional platform override for customer auth

Customer auth provider can be forced by build env:

```powershell
$env:TARO_APP_AUTH_PROVIDER="WECHAT" # or ALIPAY
```

If not set, app resolves provider from runtime/build platform automatically.

## 5) Known boundary of external integrations

For local/staging validation:
- Payment and invoice provider integrations can run in mocked or simulated mode depending on environment.
- Login must still go through platform identity path (WeChat/Alipay) and requires phone for account continuation.

