#!/usr/bin/env bash
set -euo pipefail

DEPLOY_CHECKOUT="${UNIBENCH_DEPLOY_CHECKOUT:-/mnt/gyc/benchmark2027/dashboard}"
SERVICE_PORT="${UNIBENCH_PORT:-3100}"
TMUX_SESSION="${UNIBENCH_TMUX_SESSION:-unibench-dashboard}"

if [[ ! -d "${DEPLOY_CHECKOUT}" ]]; then
  exit 0
fi
current_dir="$(pwd -P)"
deploy_dir="$(cd "${DEPLOY_CHECKOUT}" && pwd -P)"
if [[ "${current_dir}" != "${deploy_dir}" ]]; then
  exit 0
fi

if [[ "${UNIBENCH_DEPLOY_BUILD:-0}" == "1" ]]; then
  exit 0
fi

service_is_live=0
if command -v tmux >/dev/null 2>&1 && tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
  service_is_live=1
elif command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${SERVICE_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  service_is_live=1
fi

if [[ "${service_is_live}" == "1" ]]; then
  cat >&2 <<EOF
Refusing to build inside the live deployment checkout: ${deploy_dir}
An in-place build replaces hashed client assets before the running process reloads them,
which leaves server-rendered HTML visible but disables all hydrated interactions.
Develop in a sibling worktree, or deploy the clean main checkout with ops/4090/update.sh.
EOF
  exit 1
fi
