#!/usr/bin/env bash
# Stop the host-level tmux supervisor. The tmux sessions it guards keep running.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if [[ ! -s "${SUPERVISOR_PID_FILE}" ]]; then
  echo "Dashboard host supervisor is not running."
  exit 0
fi
pid=""
read -r pid <"${SUPERVISOR_PID_FILE}" || true
if [[ ! "${pid}" =~ ^[0-9]+$ ]] || ! kill -0 "${pid}" 2>/dev/null; then
  rm -f "${SUPERVISOR_PID_FILE}"
  echo "Dashboard host supervisor is not running; removed a stale pid file."
  exit 0
fi

kill "${pid}"
for _ in $(seq 1 20); do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "Dashboard host supervisor stopped (pid ${pid})."
    exit 0
  fi
  sleep 0.5
done
echo "Dashboard host supervisor (pid ${pid}) did not exit within 10s." >&2
exit 1
