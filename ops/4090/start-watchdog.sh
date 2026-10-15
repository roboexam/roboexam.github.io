#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if tmux has-session -t "=${WATCHDOG_SESSION}" 2>/dev/null; then
  echo "Dashboard release watchdog is already running."
  exec "${SCRIPT_DIR}/watchdog-status.sh"
fi

mkdir -p "${RUNTIME_DIR}"
initial_result=0
if "${SCRIPT_DIR}/deploy-if-needed.sh"; then
  initial_result=0
else
  initial_result=$?
  echo "Initial release check failed; the watchdog will keep retrying." >&2
fi
tmux new-session -d -s "${WATCHDOG_SESSION}" \
  "exec '${SCRIPT_DIR}/watchdog-loop.sh'"
echo "Dashboard release watchdog started; interval=${WATCHDOG_INTERVAL_SECONDS}s."
exit "${initial_result}"
