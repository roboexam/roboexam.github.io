#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if tmux has-session -t "=${TUNNEL_SESSION}" 2>/dev/null; then
  tmux kill-session -t "=${TUNNEL_SESSION}"
  echo "The public tunnel has stopped."
else
  echo "The public tunnel is not running."
fi
