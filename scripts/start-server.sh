#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

PROFILE="dev"
ENV_FILE=""

usage() {
  cat <<'USAGE'
Usage: scripts/start-server.sh [--profile dev|staging|prod] [--env-file <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2-}"
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

if [[ "$PROFILE" != "dev" && "$PROFILE" != "staging" && "$PROFILE" != "prod" ]]; then
  printf 'Invalid --profile: %s\n' "$PROFILE" >&2
  exit 1
fi

SERVER_DIR="${REPO_ROOT}/MealQuestServer"
if [[ ! -d "$SERVER_DIR" ]]; then
  printf 'Server directory not found: %s\n' "$SERVER_DIR" >&2
  exit 1
fi

if [[ -z "$ENV_FILE" ]]; then
  local_file="${SERVER_DIR}/.env.${PROFILE}.local"
  example_file="${SERVER_DIR}/.env.${PROFILE}.example"
  if [[ -f "$local_file" ]]; then
    ENV_FILE="$local_file"
  else
    ENV_FILE="$example_file"
  fi
fi

printf '[start-server] profile=%s\n' "$PROFILE"
printf '[start-server] envFile=%s\n' "$ENV_FILE"

import_env_file "$ENV_FILE"

cd "$SERVER_DIR"
log_step "$SERVER_DIR" "npm start"
exec npm start
