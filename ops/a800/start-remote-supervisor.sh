#!/usr/bin/env bash
# Start the cross-host watch on the A800, detached from this shell.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

mkdir -p "${STATE_DIR}"

if [[ -s "${REMOTE_PID_FILE}" ]]; then
  existing=""
  read -r existing <"${REMOTE_PID_FILE}" || true
  if [[ "${existing}" =~ ^[0-9]+$ ]] && kill -0 "${existing}" 2>/dev/null; then
    echo "Remote dashboard supervisor is already running (pid ${existing})."
    exec "${SCRIPT_DIR}/remote-supervisor-status.sh"
  fi
fi

setsid nohup "${SCRIPT_DIR}/remote-supervisor-loop.sh" >>"${REMOTE_LOG_FILE}" 2>&1 </dev/null &
disown || true

for _ in $(seq 1 20); do
  if [[ -s "${REMOTE_PID_FILE}" ]]; then
    read -r started <"${REMOTE_PID_FILE}" || started=""
    if [[ "${started}" =~ ^[0-9]+$ ]] && kill -0 "${started}" 2>/dev/null; then
      echo "Remote dashboard supervisor started (pid ${started}); interval=${REMOTE_INTERVAL_SECONDS}s."
      echo "Log: ${REMOTE_LOG_FILE}"
      exit 0
    fi
  fi
  sleep 0.5
done

echo "Remote dashboard supervisor did not report a pid; see ${REMOTE_LOG_FILE}." >&2
exit 1
