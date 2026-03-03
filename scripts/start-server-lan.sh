#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

PORT=3030

read_env_var() {
  local key="$1"
  local env_file="$2"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi
  local raw
  raw="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$env_file")"
  raw="${raw%$'\r'}"
  if [[ "${#raw}" -ge 2 ]]; then
    if [[ "${raw:0:1}" == '"' && "${raw: -1}" == '"' ]]; then
      raw="${raw:1:${#raw}-2}"
    elif [[ "${raw:0:1}" == "'" && "${raw: -1}" == "'" ]]; then
      raw="${raw:1:${#raw}-2}"
    fi
  fi
  printf '%s' "$raw"
}

extract_db_name_from_url() {
  local url="$1"
  local db_name
  db_name="$(printf '%s' "$url" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+/([^?]+).*$#\1#')"
  if [[ -z "$db_name" || "$db_name" == "$url" ]]; then
    printf ''
    return 0
  fi
  printf '%s' "${db_name%%/*}"
}

redact_db_url() {
  local url="$1"
  local redacted
  redacted="$(printf '%s' "$url" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://)([^@/]+@)?([^/?]+)(/[^?]*).*$#\1\3\4#')"
  if [[ -z "$redacted" || "$redacted" == "$url" ]]; then
    printf '%s' "$url"
    return 0
  fi
  printf '%s' "$redacted"
}

usage() {
  cat <<'USAGE'
Usage: scripts/start-server-lan.sh [--port <port>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2-}"
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

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  printf 'Invalid --port: %s\n' "$PORT" >&2
  exit 1
fi

SERVER_DIR="${REPO_ROOT}/MealQuestServer"
if [[ ! -d "$SERVER_DIR" ]]; then
  printf 'Server directory not found: %s\n' "$SERVER_DIR" >&2
  exit 1
fi

printf '[lan-server] CONFIG MANAGED BY: MealQuestServer/.env\n'
printf '[lan-server] PORT=%s\n' "$PORT"

ENV_FILE="${SERVER_DIR}/.env"
mq_db_url="$(read_env_var "MQ_DB_URL" "$ENV_FILE")"
mq_db_admin_url="$(read_env_var "MQ_DB_ADMIN_URL" "$ENV_FILE")"
mq_db_url_name="$(extract_db_name_from_url "$mq_db_url")"
mq_db_admin_url_name="$(extract_db_name_from_url "$mq_db_admin_url")"

if [[ -n "$mq_db_url_name" && -n "$mq_db_admin_url_name" && "$mq_db_url_name" == "$mq_db_admin_url_name" ]]; then
  printf '[lan-server] Invalid DB config: MQ_DB_ADMIN_URL points to the same database as MQ_DB_URL.\n' >&2
  printf '[lan-server] MQ_DB_URL=%s\n' "$(redact_db_url "$mq_db_url")" >&2
  printf '[lan-server] MQ_DB_ADMIN_URL=%s\n' "$(redact_db_url "$mq_db_admin_url")" >&2
  printf '[lan-server] This prevents auto-create when the target DB does not exist.\n' >&2
  printf '[lan-server] Fix one of the following, then rerun:\n' >&2
  printf '  1) Set MQ_DB_ADMIN_URL=\n' >&2
  printf '  2) Set MQ_DB_ADMIN_URL=postgres://<admin-user>:<admin-pass>@127.0.0.1:5432/postgres\n' >&2
  exit 1
fi

mapfile -t ips < <(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}' | grep -v '^169\.254\.' | sort -u)
if [[ ${#ips[@]} -gt 0 ]]; then
  printf '[lan-server] LAN IP candidates:\n'
  for ip in "${ips[@]}"; do
    printf '  - %s\n' "$ip"
  done
  printf '[lan-server] Customer/Merchant MQ_SERVER_URL example: http://%s:<PORT>\n' "${ips[0]}"
else
  printf '[lan-server] No LAN IPv4 detected automatically. Please run "ip -4 addr" and use your LAN IPv4.\n'
fi

printf '[lan-server] Starting MealQuestServer...\n'
cd "$SERVER_DIR"
log_step "$SERVER_DIR" "PORT=$PORT npm start"
PORT="$PORT" exec npm start
