#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

APK_PATH=""
PACKAGE_NAME="com.mealquestmerchant"
ACTIVITY_NAME=".MainActivity"
DEVICE_ID=""
SMOKE_SECONDS=8
SKIP_INSTALL=false

usage() {
  cat <<'USAGE'
Usage: scripts/verify-merchant-android-release.sh [options]

Options:
  --apk-path <path>            APK path (default: android release output)
  --package-name <name>        Package name (default: com.mealquestmerchant)
  --activity-name <name>       Activity name (default: .MainActivity)
  --device-id <serial>         Target adb device id
  --smoke-seconds <n>          Seconds to wait after launch (default: 8)
  --skip-install               Skip reinstall step
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk-path)
      APK_PATH="${2-}"
      shift 2
      ;;
    --package-name)
      PACKAGE_NAME="${2-}"
      shift 2
      ;;
    --activity-name)
      ACTIVITY_NAME="${2-}"
      shift 2
      ;;
    --device-id)
      DEVICE_ID="${2-}"
      shift 2
      ;;
    --smoke-seconds)
      SMOKE_SECONDS="${2-}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
 done

if ! [[ "$SMOKE_SECONDS" =~ ^[0-9]+$ ]]; then
  printf 'Invalid --smoke-seconds: %s\n' "$SMOKE_SECONDS" >&2
  exit 1
fi

if [[ -z "$APK_PATH" ]]; then
  APK_PATH="${REPO_ROOT}/MealQuestMerchant/android/app/build/outputs/apk/release/app-release.apk"
fi

ADB_BIN=""
if [[ -n "${ANDROID_SDK_ROOT-}" && -x "${ANDROID_SDK_ROOT}/platform-tools/adb" ]]; then
  ADB_BIN="${ANDROID_SDK_ROOT}/platform-tools/adb"
elif [[ -n "${ANDROID_HOME-}" && -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
  ADB_BIN="${ANDROID_HOME}/platform-tools/adb"
else
  ADB_BIN="$(command -v adb || true)"
fi

if [[ -z "$ADB_BIN" ]]; then
  printf 'adb not found. Install Android platform-tools or set ANDROID_SDK_ROOT.\n' >&2
  exit 1
fi

declare -a device_args
if [[ -n "$DEVICE_ID" ]]; then
  device_args=(-s "$DEVICE_ID")
else
  device_args=()
fi

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} devices"
device_output="$($ADB_BIN "${device_args[@]}" devices)"
printf '%s\n' "$device_output"

mapfile -t online_devices < <(printf '%s\n' "$device_output" | awk '/^[^[:space:]]+[[:space:]]+device$/ {print $1}')
if [[ ${#online_devices[@]} -eq 0 ]]; then
  printf 'No online Android device found.\n' >&2
  exit 1
fi

if [[ "$SKIP_INSTALL" == false ]]; then
  if [[ ! -f "$APK_PATH" ]]; then
    printf 'APK not found: %s\n' "$APK_PATH" >&2
    exit 1
  fi

  log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} install -r $APK_PATH"
  install_output="$($ADB_BIN "${device_args[@]}" install -r "$APK_PATH" 2>&1 || true)"
  printf '%s\n' "$install_output"
  if ! printf '%s\n' "$install_output" | grep -q 'Success'; then
    printf 'APK install failed.\n' >&2
    exit 1
  fi
  printf '[verify-merchant-release] install=Success\n'
else
  printf '[verify-merchant-release] skip install by request.\n'
fi

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} logcat -c"
$ADB_BIN "${device_args[@]}" logcat -c >/dev/null

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} shell am force-stop $PACKAGE_NAME"
$ADB_BIN "${device_args[@]}" shell am force-stop "$PACKAGE_NAME" >/dev/null

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} shell am start -n $PACKAGE_NAME/$ACTIVITY_NAME"
$ADB_BIN "${device_args[@]}" shell am start -n "$PACKAGE_NAME/$ACTIVITY_NAME" >/dev/null

sleep "$SMOKE_SECONDS"

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} shell pidof $PACKAGE_NAME"
pid_output="$($ADB_BIN "${device_args[@]}" shell pidof "$PACKAGE_NAME" 2>/dev/null || true)"
app_pid="$(trim "$pid_output")"
if [[ -z "$app_pid" ]]; then
  printf 'App process not found after launch: %s\n' "$PACKAGE_NAME" >&2
  exit 1
fi
printf '[verify-merchant-release] pid=%s\n' "$app_pid"

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} logcat --pid $app_pid -d"
log_text="$($ADB_BIN "${device_args[@]}" logcat --pid "$app_pid" -d 2>/dev/null || true)"
if printf '%s\n' "$log_text" | grep -E -q 'FATAL EXCEPTION|AndroidRuntime|has stopped|Fatal signal'; then
  if printf '%s\n' "$log_text" | grep -q "$PACKAGE_NAME"; then
    printf 'Release smoke failed: fatal runtime signal detected.\n' >&2
    exit 1
  fi
fi

log_step "$REPO_ROOT" "$ADB_BIN ${device_args[*]} shell dumpsys package $PACKAGE_NAME"
pkg_info="$($ADB_BIN "${device_args[@]}" shell dumpsys package "$PACKAGE_NAME" 2>/dev/null || true)"
printf '[verify-merchant-release] package summary:\n'
printf '%s\n' "$pkg_info" | awk '/versionCode=|versionName=|signing|cert|Package \[/'

printf '[verify-merchant-release] launch smoke=PASS\n'
