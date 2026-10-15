#!/usr/bin/env bash
# Cross-host watch: keeps the 4090's own dashboard supervisor alive.
#
# The 4090 host supervisor survives a dead tmux server, but not a restart of
# the 4090 container itself, which kills every process including the
# supervisor. That host has no systemd, no cron and no aibox start hook, so
# nothing inside it can restore the guard after a restart.
#
# This loop runs on the A800, which is a separate container on far steadier
# uptime, and does exactly one thing: if the 4090 supervisor is not running,
# start it. Session-level repair stays with the 4090 supervisor so there is
# still a single authority for it; once the supervisor is back it restores the
# dashboard, tailscaled and watchdog sessions on its own.
#
# It only ever STARTS things on the remote host. It never stops or kills.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

mkdir -p "${STATE_DIR}"

exec 9>"${REMOTE_LOCK_FILE}"
if ! flock -n 9; then
  echo "Another remote dashboard supervisor already holds ${REMOTE_LOCK_FILE}." >&2
  exit 1
fi
printf '%s\n' "$$" >"${REMOTE_PID_FILE}"
trap 'rm -f "${REMOTE_PID_FILE}"' EXIT

log() { printf '[%s] %s\n' "$(date -Is)" "$*" >>"${REMOTE_LOG_FILE}"; }

remote_ssh() {
  "${REMOTE_SSH_BIN}" -p "${REMOTE_SSH_PORT}" \
    -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
    "${REMOTE_SSH_TARGET}" "$@"
}

# Printed by the remote shell; keep it to one line and free of side effects.
probe_command="pid_file=${REMOTE_SUPERVISOR_PID_FILE}; if [ -s \"\$pid_file\" ]; then read -r pid <\"\$pid_file\"; case \"\$pid\" in ''|*[!0-9]*) echo down ;; *) if kill -0 \"\$pid\" 2>/dev/null; then echo alive; else echo down; fi ;; esac; else echo down; fi"

log "remote supervisor started (pid $$, interval ${REMOTE_INTERVAL_SECONDS}s, target ${REMOTE_SSH_TARGET}:${REMOTE_SSH_PORT})"
last_repair=0
cycles=0
while true; do
  checked_at="$(date -Is)"
  checked_epoch="$(date +%s)"
  repaired="no"

  if ! probe="$(remote_ssh "${probe_command}" 2>&1)"; then
    result="unreachable"
    log "probe failed: ${probe}"
  elif [[ "${probe}" == *alive* ]]; then
    result="ok"
  else
    result="down"
    if (( checked_epoch - last_repair < REMOTE_REPAIR_COOLDOWN_SECONDS )); then
      log "4090 supervisor still down; repair cooldown active"
    else
      last_repair="${checked_epoch}"
      log "4090 supervisor is down; starting it remotely"
      if output="$(remote_ssh "bash ${REMOTE_DASHBOARD_DIR}/ops/4090/start-supervisor.sh" 2>&1)"; then
        repaired="yes"
        result="repairing"
        log "remote start finished"
      else
        log "remote start failed"
      fi
      printf '%s\n' "${output}" >>"${REMOTE_LOG_FILE}"
    fi
  fi

  status_tmp="${REMOTE_STATUS_FILE}.tmp.$$"
  {
    printf 'checked_epoch=%q\n' "${checked_epoch}"
    printf 'checked_at=%q\n' "${checked_at}"
    printf 'result=%q\n' "${result}"
    printf 'repaired=%q\n' "${repaired}"
    printf 'watcher_pid=%q\n' "$$"
    printf 'target=%q\n' "${REMOTE_SSH_TARGET}:${REMOTE_SSH_PORT}"
  } >"${status_tmp}"
  mv "${status_tmp}" "${REMOTE_STATUS_FILE}"

  cycles=$(( cycles + 1 ))
  if (( REMOTE_MAX_CYCLES > 0 && cycles >= REMOTE_MAX_CYCLES )); then
    break
  fi
  sleep "${REMOTE_INTERVAL_SECONDS}"
done
