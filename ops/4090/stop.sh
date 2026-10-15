#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
  tmux kill-session -t "=${TMUX_SESSION}"
  echo "RoboExam has stopped."
else
  echo "RoboExam is not running."
fi
