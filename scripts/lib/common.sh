#!/usr/bin/env bash

set -o pipefail

SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "${SCRIPT_LIB_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPTS_DIR}/.." && pwd)"

RUN_STEP=0
ENV_STEP=0
TRACKED_PIDS=()
RUN_IN_NEW_TERMINAL_PID=""

log_step() {
  local workdir="$1"
  local cmd="$2"
  RUN_STEP=$((RUN_STEP + 1))
  printf "\n>>> [STEP-%s] %s\n" "$RUN_STEP" "$cmd"
  printf "    @ %s\n" "$workdir"
}

log_info() {
  printf '%s\n' "$*"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

mask_env_value() {
  local name="$1"
  local value="$2"
  local upper
  upper="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')"
  if [[ "$upper" == *SECRET* || "$upper" == *TOKEN* || "$upper" == *PASSWORD* ]]; then
    printf '***'
  else
    printf '%s' "$value"
  fi
}

print_env_change() {
  local action="$1"
  local name="$2"
  local value="${3-}"
  ENV_STEP=$((ENV_STEP + 1))
  if [[ "$action" == "SET" ]]; then
    local shown
    shown="$(mask_env_value "$name" "$value")"
    printf '[ENV-%s] SET %s=%s\n' "$ENV_STEP" "$name" "$shown"
  else
    printf '[ENV-%s] UNSET %s\n' "$ENV_STEP" "$name"
  fi
}

set_process_env() {
  local name="$1"
  local value="$2"
  export "$name=$value"
  print_env_change "SET" "$name" "$value"
}

parse_dotenv_line() {
  local line="$1"
  local name raw value

  line="$(trim "$line")"
  if [[ -z "$line" || "${line:0:1}" == "#" ]]; then
    return 1
  fi

  if [[ "$line" =~ ^export[[:space:]]+ ]]; then
    line="${line#export}"
    line="$(trim "$line")"
  fi

  if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
    return 1
  fi

  name="${BASH_REMATCH[1]}"
  raw="$(trim "${BASH_REMATCH[2]}")"

  if [[ ${#raw} -ge 2 && "${raw:0:1}" == '"' && "${raw: -1}" == '"' ]]; then
    value="${raw:1:${#raw}-2}"
    value="${value//\\n/$'\n'}"
    value="${value//\\r/$'\r'}"
    value="${value//\\t/$'\t'}"
    value="${value//\\\"/\"}"
  elif [[ ${#raw} -ge 2 && "${raw:0:1}" == "'" && "${raw: -1}" == "'" ]]; then
    value="${raw:1:${#raw}-2}"
  else
    value="${raw%%#*}"
    value="$(trim "$value")"
  fi

  printf '%s\x1f%s\n' "$name" "$value"
}

import_env_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    printf 'Env file not found: %s\n' "$path" >&2
    return 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    local entry name value
    if ! entry="$(parse_dotenv_line "$line")"; then
      continue
    fi
    name="${entry%%$'\x1f'*}"
    value="${entry#*$'\x1f'}"
    set_process_env "$name" "$value"
  done < "$path"
}

add_tracked_pid() {
  local pid="$1"
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ || "$pid" -le 0 ]]; then
    printf '[process] ignore invalid pid: %s\n' "$pid" >&2
    return 1
  fi
  TRACKED_PIDS+=("$pid")
  return 0
}

is_pid_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

stop_process_tree_with_signal() {
  local pid="$1"
  local signal="${2:-TERM}"
  local children child

  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ || "$pid" -le 0 ]]; then
    return
  fi

  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $children; do
    stop_process_tree_with_signal "$child" "$signal"
  done

  kill "-${signal}" "$pid" 2>/dev/null || true
}

stop_process_tree() {
  local pid="$1"
  stop_process_tree_with_signal "$pid" "TERM"
}

cleanup_tracked_processes() {
  local pid any_alive=false
  if [[ ${#TRACKED_PIDS[@]} -eq 0 ]]; then
    return
  fi

  for pid in "${TRACKED_PIDS[@]}"; do
    if is_pid_alive "$pid"; then
      stop_process_tree "$pid"
      any_alive=true
    fi
  done

  if [[ "$any_alive" == false ]]; then
    return
  fi

  # Give processes a brief chance to exit gracefully, then force kill leftovers.
  sleep 1
  for pid in "${TRACKED_PIDS[@]}"; do
    if is_pid_alive "$pid"; then
      stop_process_tree_with_signal "$pid" "KILL"
    fi
  done
}

port_is_occupied() {
  local port="$1"
  ss -ltn "sport = :${port}" 2>/dev/null | grep -q ":${port}[[:space:]]"
}

resolve_android_sdk_path() {
  local preferred="${1-}"
  local adb_path platform_tools sdk

  if [[ -n "$preferred" && -d "$preferred" ]]; then
    printf '%s\n' "$(cd "$preferred" && pwd)"
    return 0
  fi

  if [[ -n "${ANDROID_SDK_ROOT-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
    printf '%s\n' "${ANDROID_SDK_ROOT}"
    return 0
  fi

  if [[ -n "${ANDROID_HOME-}" && -d "${ANDROID_HOME}" ]]; then
    printf '%s\n' "${ANDROID_HOME}"
    return 0
  fi

  if adb_path="$(command -v adb 2>/dev/null)"; then
    platform_tools="$(cd "$(dirname "$adb_path")" && pwd)"
    if [[ "$(basename "$platform_tools")" == "platform-tools" ]]; then
      sdk="$(cd "${platform_tools}/.." && pwd)"
      if [[ -d "$sdk" ]]; then
        printf '%s\n' "$sdk"
        return 0
      fi
    fi
  fi

  for sdk in "$HOME/Android/Sdk" "/opt/android-sdk" "/usr/lib/android-sdk"; do
    if [[ -d "$sdk" ]]; then
      printf '%s\n' "$sdk"
      return 0
    fi
  done

  return 1
}

ensure_path_contains() {
  local dir="$1"
  if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
    export PATH="$PATH:$dir"
  fi
}

print_install_restricted_guidance() {
  cat <<'GUIDE'
[merchant-app] detected INSTALL_FAILED_USER_RESTRICTED.
[merchant-app] action required on phone:
[merchant-app] 1) Enable Developer options.
[merchant-app] 2) Enable USB debugging.
[merchant-app] 3) Enable USB install / Install via USB.
[merchant-app] 4) Confirm any install/security dialogs on phone.
[merchant-app] 5) Re-run this script after allowing install.
GUIDE
}

run_in_new_terminal() {
  local title="$1"
  local workdir="$2"
  local cmd="$3"
  local terminal_emulator=""
  local launch_pid=""
  local shell_pid_file=""
  local shell_pid=""
  local waited=0
  local wrapper_cmd=""

  RUN_IN_NEW_TERMINAL_PID=""

  # Check for GUI environment
  if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
    return 1
  fi

  if command -v gnome-terminal >/dev/null 2>&1; then
    terminal_emulator="gnome-terminal"
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    terminal_emulator="x-terminal-emulator"
  elif command -v xterm >/dev/null 2>&1; then
    terminal_emulator="xterm"
  fi

  if [[ -z "$terminal_emulator" ]]; then
    return 1
  fi

  shell_pid_file="$(mktemp)"
  wrapper_cmd="printf '%s\n' \"\$\$\" > '${shell_pid_file}'; cd '${workdir}' && ${cmd}; exec bash"

  case "$terminal_emulator" in
    gnome-terminal)
      # --wait keeps gnome-terminal process alive until terminal window exits,
      # so caller can reliably track and clean up process tree by PID.
      gnome-terminal --wait --title="$title" -- bash -c "$wrapper_cmd" &
      ;;
    x-terminal-emulator|xterm)
      $terminal_emulator -T "$title" -e bash -c "$wrapper_cmd" &
      ;;
  esac

  launch_pid="$!"
  while [[ ! -s "$shell_pid_file" && $waited -lt 30 ]]; do
    sleep 0.1
    waited=$((waited + 1))
  done

  if [[ -s "$shell_pid_file" ]]; then
    shell_pid="$(cat "$shell_pid_file" 2>/dev/null || true)"
  fi
  rm -f "$shell_pid_file"

  if [[ -n "$shell_pid" && "$shell_pid" =~ ^[0-9]+$ ]]; then
    RUN_IN_NEW_TERMINAL_PID="$shell_pid"
  else
    RUN_IN_NEW_TERMINAL_PID="$launch_pid"
  fi
  return 0
}
