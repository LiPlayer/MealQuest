#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

PORT=3030

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
