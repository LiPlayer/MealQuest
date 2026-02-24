#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

PLATFORM="android"
ANDROID_SDK_PATH=""
AUTO_START_SERVER=false
NO_METRO=false
NO_LAUNCH=false
WAIT_METRO_SECONDS=6
METRO_PORT=8081

usage() {
  cat <<'USAGE'
Usage: scripts/start-merchant-app.sh [options]

Options:
  --platform android|ios        Target platform (default: android)
  --android-sdk-path <path>     Explicit Android SDK path
  --auto-start-server           Start MealQuestServer in background
  --no-metro                    Do not start Metro bundler
  --no-launch                   Skip app install/launch
  --wait-metro-seconds <n>      Wait time after starting Metro (default: 6)
USAGE
}

cleanup_on_exit() {
  if [[ ${#TRACKED_PIDS[@]} -gt 0 ]]; then
    printf '[merchant-app] cleaning up child processes...\n'
    cleanup_tracked_processes
  fi
}
trap cleanup_on_exit EXIT INT TERM

resolve_env_file() {
  local project_dir="$1"
  if [[ -f "${project_dir}/.env.local" ]]; then
    printf '%s\n' "${project_dir}/.env.local"
    return 0
  fi
  if [[ -f "${project_dir}/.env" ]]; then
    printf '%s\n' "${project_dir}/.env"
    return 0
  fi
  return 1
}

ensure_android_setup() {
  local merchant_dir="$1"
  local preferred_sdk="${2-}"
  local sdk_path local_properties

  if ! sdk_path="$(resolve_android_sdk_path "$preferred_sdk")"; then
    printf 'Android SDK not found. Install Android Studio SDK or pass --android-sdk-path.\n' >&2
    exit 1
  fi

  export ANDROID_SDK_ROOT="$sdk_path"
  export ANDROID_HOME="$sdk_path"
  ensure_path_contains "${sdk_path}/platform-tools"
  ensure_path_contains "${sdk_path}/cmdline-tools/latest/bin"

  local_properties="${merchant_dir}/android/local.properties"
  printf 'sdk.dir=%s\n' "$sdk_path" > "$local_properties"

  printf '[merchant-app] ANDROID_SDK_ROOT=%s\n' "$ANDROID_SDK_ROOT"
  printf '[merchant-app] android/local.properties generated.\n'
}

any_tracked_alive() {
  local pid
  for pid in "${TRACKED_PIDS[@]}"; do
    if is_pid_alive "$pid"; then
      return 0
    fi
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="${2-}"
      shift 2
      ;;
    --android-sdk-path)
      ANDROID_SDK_PATH="${2-}"
      shift 2
      ;;
    --auto-start-server)
      AUTO_START_SERVER=true
      shift
      ;;
    --no-metro)
      NO_METRO=true
      shift
      ;;
    --no-launch)
      NO_LAUNCH=true
      shift
      ;;
    --wait-metro-seconds)
      WAIT_METRO_SECONDS="${2-}"
      shift 2
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

if [[ "$PLATFORM" != "android" && "$PLATFORM" != "ios" ]]; then
  printf 'Invalid --platform: %s\n' "$PLATFORM" >&2
  exit 1
fi
if ! [[ "$WAIT_METRO_SECONDS" =~ ^[0-9]+$ ]]; then
  printf 'Invalid --wait-metro-seconds: %s\n' "$WAIT_METRO_SECONDS" >&2
  exit 1
fi

MERCHANT_DIR="${REPO_ROOT}/MealQuestMerchant"
if [[ ! -d "$MERCHANT_DIR" ]]; then
  printf 'Merchant app directory not found: %s\n' "$MERCHANT_DIR" >&2
  exit 1
fi

if ! ENV_FILE="$(resolve_env_file "$MERCHANT_DIR")"; then
  printf 'Env file not found. Expected one of: %s, %s\n' \
    "${MERCHANT_DIR}/.env.local" \
    "${MERCHANT_DIR}/.env" >&2
  exit 1
fi
import_env_file "$ENV_FILE"

if [[ "$PLATFORM" == "android" ]]; then
  ensure_android_setup "$MERCHANT_DIR" "$ANDROID_SDK_PATH"
fi

printf '[merchant-app] envFile=%s\n' "$ENV_FILE"
printf '[merchant-app] metro=localhost:%s\n' "$METRO_PORT"

if [[ "$AUTO_START_SERVER" == true ]]; then
  server_script="${SCRIPT_DIR}/start-server.sh"
  if [[ ! -f "$server_script" ]]; then
    printf 'Server startup script not found: %s\n' "$server_script" >&2
    exit 1
  fi
  printf '[merchant-app] starting local server in background...\n'
  log_step "$SCRIPT_DIR" "bash ${server_script} --profile dev"
  (
    cd "$REPO_ROOT"
    bash "$server_script" --profile dev
  ) &
  server_pid=$!
  add_tracked_pid "$server_pid"
  sleep 2
fi

METRO_INJECTED_OR_PREEXISTING=false
if [[ "$NO_METRO" == false ]]; then
  if port_is_occupied "$METRO_PORT"; then
    printf '\n'
    printf '*******************************************************************************\n'
    printf '  WARNING: Metro port %s is already occupied!\n' "$METRO_PORT"
    printf '  The existing Metro process might NOT have the current environment variables.\n'
    printf "  If app shows 'Connection Failed' or wrong 'BaseUrl', please restart Metro.\n"
    printf '*******************************************************************************\n'
    printf '\n'
    METRO_INJECTED_OR_PREEXISTING=true
  fi
fi

if [[ "$NO_METRO" == false && "$METRO_INJECTED_OR_PREEXISTING" == false ]]; then
  printf '[merchant-app] starting Metro in background...\n'
  log_step "$MERCHANT_DIR" "npx react-native start --port ${METRO_PORT}"
  (
    cd "$MERCHANT_DIR"
    npx react-native start --port "$METRO_PORT"
  ) &
  metro_pid=$!
  add_tracked_pid "$metro_pid"
  METRO_INJECTED_OR_PREEXISTING=true
  if (( WAIT_METRO_SECONDS > 0 )); then
    sleep "$WAIT_METRO_SECONDS"
  fi
fi

if [[ "$NO_LAUNCH" == true ]]; then
  printf '[merchant-app] NoLaunch=true, skipped app install/launch.\n'
  exit 0
fi

cd "$MERCHANT_DIR"
printf '[merchant-app] building + launching %s debug app...\n' "$PLATFORM"

if [[ "$PLATFORM" == "android" ]]; then
  if ! command -v adb >/dev/null 2>&1; then
    printf "adb not found. Ensure Android SDK platform-tools is installed and in PATH.\n" >&2
    exit 1
  fi

  mapfile -t devices < <(adb devices | awk 'NR>1 && $2 == "device" {print $1}')
  if [[ ${#devices[@]} -eq 0 ]]; then
    printf "No real Android devices connected (adb devices). Connect your phone by USB or Wireless ADB.\n" >&2
    exit 1
  fi

  printf '[merchant-app] Target devices detected:\n'
  for device in "${devices[@]}"; do
    printf '  %s\n' "$device"
  done
fi

SKIP_PACKAGER=false
if [[ "$METRO_INJECTED_OR_PREEXISTING" == true || "$NO_METRO" == true ]]; then
  SKIP_PACKAGER=true
fi

tmp_log="$(mktemp)"
set +e
if [[ "$PLATFORM" == "android" ]]; then
  if [[ "$SKIP_PACKAGER" == true ]]; then
    log_step "$MERCHANT_DIR" "npm run android -- --no-packager"
    npm run android -- --no-packager 2>&1 | tee "$tmp_log"
    run_rc=${PIPESTATUS[0]}
  else
    log_step "$MERCHANT_DIR" "npm run android"
    npm run android 2>&1 | tee "$tmp_log"
    run_rc=${PIPESTATUS[0]}
  fi
else
  if [[ "$SKIP_PACKAGER" == true ]]; then
    log_step "$MERCHANT_DIR" "npm run ios -- --no-packager"
    npm run ios -- --no-packager 2>&1 | tee "$tmp_log"
    run_rc=${PIPESTATUS[0]}
  else
    log_step "$MERCHANT_DIR" "npm run ios"
    npm run ios 2>&1 | tee "$tmp_log"
    run_rc=${PIPESTATUS[0]}
  fi
fi
set -e

if (( run_rc != 0 )); then
  if grep -q 'INSTALL_FAILED_USER_RESTRICTED' "$tmp_log"; then
    print_install_restricted_guidance
  fi
  rm -f "$tmp_log"
  exit "$run_rc"
fi
rm -f "$tmp_log"

if [[ ${#TRACKED_PIDS[@]} -gt 0 ]]; then
  printf '\n'
  printf '[merchant-app] Startup sequence finished. Child processes are running:\n'
  for pid in "${TRACKED_PIDS[@]}"; do
    if is_pid_alive "$pid"; then
      printf '  - PID %s\n' "$pid"
    fi
  done
  printf '[merchant-app] SCRIPT IS ACTIVE. Press Ctrl+C to kill child processes and exit.\n'

  while any_tracked_alive; do
    sleep 2
  done
  printf '[merchant-app] All child processes have exited.\n'
fi
