#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
    echo "RoboExam already has a managed session; verifying it."
  exec "${SCRIPT_DIR}/status.sh"
fi

if [[ ! -f "${PROJECT_DIR}/dist/server/index.js" ]]; then
  echo "No production build found. Run ops/4090/update.sh first." >&2
  exit 1
fi

mkdir -p "${RUNTIME_DIR}"
tmux new-session -d -s "${TMUX_SESSION}" \
  "cd '${PROJECT_DIR}' && set -a && source '${ENV_FILE}' && set +a && exec env PORT='${SERVICE_PORT}' npm run start -- --hostname 0.0.0.0 --port '${SERVICE_PORT}' >>'${LOG_FILE}' 2>&1"

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${SERVICE_PORT}/login" >/dev/null; then
    if UNIBENCH_PROJECT_DIR="${PROJECT_DIR}" \
      UNIBENCH_NODE_BIN="${NODE_HOME}/bin/node" \
      UNIBENCH_PORT="${SERVICE_PORT}" \
      "${SCRIPT_DIR}/verify-assets.sh"; then
      echo "RoboExam is running on port ${SERVICE_PORT}."
      exit 0
    fi
    tmux kill-session -t "=${TMUX_SESSION}" 2>/dev/null || true
    echo "The dashboard started but failed client-asset verification; the broken session was stopped." >&2
    exit 1
  fi
  sleep 1
done

echo "The dashboard did not become ready. Check ${LOG_FILE}." >&2
exit 1
