#!/usr/bin/env bash
# Start the host-level tmux supervisor, detached from this shell and from tmux.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

mkdir -p "${RUNTIME_DIR}"

if [[ -s "${SUPERVISOR_PID_FILE}" ]]; then
  existing=""
  read -r existing <"${SUPERVISOR_PID_FILE}" || true
  if [[ "${existing}" =~ ^[0-9]+$ ]] && kill -0 "${existing}" 2>/dev/null; then
    echo "Dashboard host supervisor is already running (pid ${existing})."
    exec "${SCRIPT_DIR}/supervisor-status.sh"
  fi
fi

# setsid detaches the loop into its own session so it is reparented to PID 1
# instead of dying with this shell, the SSH connection, or the tmux server.
setsid nohup "${SCRIPT_DIR}/supervisor-loop.sh" >>"${SUPERVISOR_LOG_FILE}" 2>&1 </dev/null &
disown || true

for _ in $(seq 1 20); do
  if [[ -s "${SUPERVISOR_PID_FILE}" ]]; then
    read -r started <"${SUPERVISOR_PID_FILE}" || started=""
    if [[ "${started}" =~ ^[0-9]+$ ]] && kill -0 "${started}" 2>/dev/null; then
      echo "Dashboard host supervisor started (pid ${started}); interval=${SUPERVISOR_INTERVAL_SECONDS}s."
      echo "Log: ${SUPERVISOR_LOG_FILE}"
      exit 0
    fi
  fi
  sleep 0.5
done

echo "Dashboard host supervisor did not report a pid; see ${SUPERVISOR_LOG_FILE}." >&2
exit 1
