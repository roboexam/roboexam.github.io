#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if tmux has-session -t "=${WATCHDOG_SESSION}" 2>/dev/null; then
  tmux kill-session -t "=${WATCHDOG_SESSION}"
  echo "Dashboard release watchdog stopped."
else
  echo "Dashboard release watchdog is not running."
fi
