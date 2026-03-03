#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MERCHANT_DIR="${REPO_ROOT}/MealQuestMerchant"

PLATFORM="android"
NO_INSTALL=false
NO_START_SERVER=false
NO_DEV_CLIENT=false

usage() {
  cat <<'USAGE'
Usage: scripts/start-merchant-app.sh [options]

Options:
  --platform android|ios
  --no-install
  --no-start-server
  --no-dev-client
USAGE
}

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
  if [[ -f "${project_dir}/.env.example" ]]; then
    printf '%s\n' "${project_dir}/.env.example"
    return 0
  fi
  return 1
}

import_env_file() {
  local env_file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ "$line" =~ ^export[[:space:]]+ ]]; then
      line="${line#export }"
    fi
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      else
        value="${value%%#*}"
        value="${value%"${value##*[![:space:]]}"}"
      fi
      export "${key}=${value}"
    fi
  done < "$env_file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="${2-}"
      shift 2
      ;;
    --no-install)
      NO_INSTALL=true
      shift
      ;;
    --no-start-server)
      NO_START_SERVER=true
      shift
      ;;
    --no-dev-client)
      NO_DEV_CLIENT=true
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

if [[ "$PLATFORM" != "android" && "$PLATFORM" != "ios" ]]; then
  printf 'Invalid --platform: %s\n' "$PLATFORM" >&2
  exit 1
fi

if [[ ! -d "$MERCHANT_DIR" ]]; then
  printf 'Merchant app directory not found: %s\n' "$MERCHANT_DIR" >&2
  exit 1
fi

if ! ENV_FILE="$(resolve_env_file "$MERCHANT_DIR")"; then
  printf 'Env file not found. Expected .env.local/.env/.env.example in %s\n' "$MERCHANT_DIR" >&2
  exit 1
fi
import_env_file "$ENV_FILE"
printf '[merchant-app] envFile=%s\n' "$ENV_FILE"

if [[ "$NO_START_SERVER" == false ]]; then
  SERVER_SCRIPT="${SCRIPT_DIR}/start-server.sh"
  if [[ -f "$SERVER_SCRIPT" ]]; then
    printf '[merchant-app] starting local server...\n'
    (cd "$REPO_ROOT" && bash "$SERVER_SCRIPT" --profile dev) &
    sleep 2
  fi
fi

cd "$MERCHANT_DIR"

if [[ "$NO_INSTALL" == false ]]; then
  printf '[merchant-app] npm install\n'
  npm install
fi

if [[ "$NO_DEV_CLIENT" == true ]]; then
  printf '[merchant-app] expo start\n'
  exec npx expo start
fi

if [[ "$PLATFORM" == "android" ]]; then
  printf '[merchant-app] expo start --dev-client --android\n'
  exec npx expo start --dev-client --android
fi

printf '[merchant-app] expo start --dev-client --ios\n'
exec npx expo start --dev-client --ios
