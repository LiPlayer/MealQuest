#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

BUILD_TYPE="release"
ARTIFACT="apk"
ANDROID_SDK_PATH=""
CLEAN=false

usage() {
  cat <<'USAGE'
Usage: scripts/build-merchant-android.sh [options]

Options:
  --build-type debug|release   Build variant (default: release)
  --artifact apk|aab           Output type (default: apk)
  --android-sdk-path <path>    Explicit Android SDK path
  --clean                      Run gradle clean before build
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-type)
      BUILD_TYPE="${2-}"
      shift 2
      ;;
    --artifact)
      ARTIFACT="${2-}"
      shift 2
      ;;
    --android-sdk-path)
      ANDROID_SDK_PATH="${2-}"
      shift 2
      ;;
    --clean)
      CLEAN=true
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

if [[ "$BUILD_TYPE" != "debug" && "$BUILD_TYPE" != "release" ]]; then
  printf 'Invalid --build-type: %s\n' "$BUILD_TYPE" >&2
  exit 1
fi
if [[ "$ARTIFACT" != "apk" && "$ARTIFACT" != "aab" ]]; then
  printf 'Invalid --artifact: %s\n' "$ARTIFACT" >&2
  exit 1
fi

MERCHANT_DIR="${REPO_ROOT}/MealQuestMerchant"
ANDROID_DIR="${MERCHANT_DIR}/android"
if [[ ! -d "$MERCHANT_DIR" ]]; then
  printf 'Merchant app directory not found: %s\n' "$MERCHANT_DIR" >&2
  exit 1
fi
if [[ ! -d "$ANDROID_DIR" ]]; then
  printf 'Merchant android directory not found: %s\n' "$ANDROID_DIR" >&2
  exit 1
fi

if ! sdk_path="$(resolve_android_sdk_path "$ANDROID_SDK_PATH")"; then
  printf 'Android SDK not found. Pass --android-sdk-path or set ANDROID_SDK_ROOT.\n' >&2
  exit 1
fi

set_process_env "ANDROID_SDK_ROOT" "$sdk_path"
set_process_env "ANDROID_HOME" "$sdk_path"
ensure_path_contains "${sdk_path}/platform-tools"
ensure_path_contains "${sdk_path}/cmdline-tools/latest/bin"

if [[ "$ARTIFACT" == "aab" ]]; then
  if [[ "$BUILD_TYPE" == "release" ]]; then
    TASK="bundleRelease"
  else
    TASK="bundleDebug"
  fi
else
  if [[ "$BUILD_TYPE" == "release" ]]; then
    TASK="assembleRelease"
  else
    TASK="assembleDebug"
  fi
fi

cd "$ANDROID_DIR"

if [[ "$CLEAN" == true ]]; then
  log_step "$ANDROID_DIR" "./gradlew clean"
  ./gradlew clean
fi

log_step "$ANDROID_DIR" "./gradlew ${TASK}"
./gradlew "$TASK"

if [[ "$ARTIFACT" == "aab" ]]; then
  artifact_path="${ANDROID_DIR}/app/build/outputs/bundle/${BUILD_TYPE}/app-${BUILD_TYPE}.aab"
else
  artifact_path="${ANDROID_DIR}/app/build/outputs/apk/${BUILD_TYPE}/app-${BUILD_TYPE}.apk"
fi

if [[ -f "$artifact_path" ]]; then
  printf '[build-merchant-android] output=%s\n' "$artifact_path"
else
  printf "[build-merchant-android] built task '%s' but output not found at expected path.\n" "$TASK"
fi
