#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if ! tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
  echo "Status: stopped"
  exit 1
fi

if verification_output="$(UNIBENCH_PROJECT_DIR="${PROJECT_DIR}" \
  UNIBENCH_NODE_BIN="${NODE_HOME}/bin/node" \
  UNIBENCH_PORT="${SERVICE_PORT}" \
  "${SCRIPT_DIR}/verify-assets.sh" 2>&1)"; then
  echo "Status: healthy"
  echo "Port: ${SERVICE_PORT}"
  echo "Log: ${LOG_FILE}"
  echo "${verification_output}"
  if [[ ! -s "${DEPLOYED_COMMIT_FILE}" ]]; then
    echo "Deployment status: unrecorded (${DEPLOYED_COMMIT_FILE} is missing)" >&2
    exit 1
  fi
  deployed_commit="$(<"${DEPLOYED_COMMIT_FILE}")"
  source_commit="$(git -C "${PROJECT_DIR}" rev-parse HEAD)"
  echo "Deployed commit: ${deployed_commit}"
  if [[ "${deployed_commit}" != "${source_commit}" ]]; then
    echo "Deployment status: stale (source ${source_commit} is not deployed)" >&2
    exit 1
  fi
  echo "Deployment status: current"
else
  echo "Status: process exists but HTML/client assets are inconsistent"
  echo "${verification_output}" >&2
  exit 1
fi
