#!/usr/bin/env bash
# Host-level supervisor for the tmux sessions the dashboard depends on.
#
# This host has no systemd and no cron, so the dashboard service, the Tailscale
# daemon and the release watchdog all live inside tmux. When the tmux server
# itself dies, all three disappear at once and nothing is left running that
# could notice. On 2026-09-17 that happened and the public dashboard stayed
# down until a person looked at it.
#
# This loop runs OUTSIDE tmux (see start-supervisor.sh, which detaches it with
# setsid), so a dead tmux server does not take it with them.
#
# Scope is deliberately narrow: it restores sessions that are ABSENT and
# nothing else. Release convergence, asset verification and Funnel repair stay
# owned by watchdog-loop.sh and ensure-fixed-funnel.sh. Re-implementing their
# health checks here would create two repair loops fighting over one service.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Overridable so tests can point the repairs at fixtures instead of the real
# service scripts.
REPAIR_DIR="${UNIBENCH_SUPERVISOR_REPAIR_DIR:-${SCRIPT_DIR}}"

mkdir -p "${RUNTIME_DIR}"

# One supervisor at a time. The lock is held for the life of the process, so a
# second copy exits instead of racing the first one into duplicate repairs.
exec 9>"${SUPERVISOR_LOCK_FILE}"
if ! flock -n 9; then
  echo "Another dashboard supervisor already holds ${SUPERVISOR_LOCK_FILE}." >&2
  exit 1
fi
printf '%s\n' "$$" >"${SUPERVISOR_PID_FILE}"
trap 'rm -f "${SUPERVISOR_PID_FILE}"' EXIT

sessions=("${TMUX_SESSION}" "${TAILSCALE_SESSION}" "${WATCHDOG_SESSION}")
repairs=("start.sh" "ensure-fixed-funnel.sh" "start-watchdog.sh")
declare -A last_repair=()

log() { printf '[%s] %s\n' "$(date -Is)" "$*" >>"${SUPERVISOR_LOG_FILE}"; }

# update.sh holds DEPLOY_LOCK_FILE with flock across stop, build and restart.
# A missing dashboard session inside that window is the deployment doing its
# job, not a fault; starting the service there races a half-written dist/ and
# leaves the app serving HTML whose assets do not exist yet.
deploy_in_progress() {
  exec 8>"${DEPLOY_LOCK_FILE}" || return 1
  if flock -n 8; then
    flock -u 8
    exec 8>&-
    return 1
  fi
  exec 8>&-
  return 0
}

log "supervisor started (pid $$, interval ${SUPERVISOR_INTERVAL_SECONDS}s)"
cycles=0
while true; do
  checked_at="$(date -Is)"
  checked_epoch="$(date +%s)"
  repaired=()
  deploying="no"
  if deploy_in_progress; then
    deploying="yes"
    log "a deployment holds the deploy lock; leaving sessions to it this cycle"
  fi

  for index in "${!sessions[@]}"; do
    session="${sessions[index]}"
    if tmux has-session -t "=${session}" 2>/dev/null; then
      continue
    fi
    # Skip before the cooldown is stamped, so a deployment never consumes the
    # repair budget that a genuine outage needs.
    if [[ "${deploying}" == "yes" ]]; then
      continue
    fi
    # A repair that keeps failing must not be retried every cycle; the
    # cooldown keeps a broken dependency from turning into a restart loop.
    previous="${last_repair[${session}]:-0}"
    if (( checked_epoch - previous < SUPERVISOR_REPAIR_COOLDOWN_SECONDS )); then
      log "session ${session} still absent; repair cooldown active"
      continue
    fi
    last_repair["${session}"]="${checked_epoch}"
    log "session ${session} is absent; running ${repairs[index]}"
    if output="$("${REPAIR_DIR}/${repairs[index]}" 2>&1)"; then
      repaired+=("${session}")
      log "repair of ${session} finished"
    else
      log "repair of ${session} failed"
    fi
    printf '%s\n' "${output}" >>"${SUPERVISOR_LOG_FILE}"
  done

  present=0
  still_missing=()
  for session in "${sessions[@]}"; do
    if tmux has-session -t "=${session}" 2>/dev/null; then
      present=$(( present + 1 ))
    else
      still_missing+=("${session}")
    fi
  done

  if (( ${#still_missing[@]} == 0 )); then
    result="ok"
  elif [[ "${deploying}" == "yes" ]]; then
    result="deploying"
  elif (( ${#repaired[@]} > 0 )); then
    result="repairing"
  else
    result="failed"
  fi

  status_tmp="${SUPERVISOR_STATUS_FILE}.tmp.$$"
  {
    printf 'checked_epoch=%q\n' "${checked_epoch}"
    printf 'checked_at=%q\n' "${checked_at}"
    printf 'result=%q\n' "${result}"
    printf 'supervisor_pid=%q\n' "$$"
    printf 'sessions_present=%q\n' "${present}"
    printf 'sessions_total=%q\n' "${#sessions[@]}"
    printf 'missing_sessions=%q\n' "${still_missing[*]-}"
    printf 'repaired_sessions=%q\n' "${repaired[*]-}"
    printf 'deploying=%q\n' "${deploying}"
  } >"${status_tmp}"
  mv "${status_tmp}" "${SUPERVISOR_STATUS_FILE}"

  cycles=$(( cycles + 1 ))
  if (( SUPERVISOR_MAX_CYCLES > 0 && cycles >= SUPERVISOR_MAX_CYCLES )); then
    break
  fi
  sleep "${SUPERVISOR_INTERVAL_SECONDS}"
done
