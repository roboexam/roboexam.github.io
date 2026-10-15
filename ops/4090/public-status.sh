#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if ! tmux has-session -t "=${TUNNEL_SESSION}" 2>/dev/null; then
  echo "Public tunnel: stopped"
  exit 1
fi

if [[ ! -s "${PUBLIC_URL_FILE}" ]]; then
  echo "Public tunnel: starting"
  exit 1
fi

public_url="$(<"${PUBLIC_URL_FILE}")"
if verification_output="$(UNIBENCH_PROJECT_DIR="${PROJECT_DIR}" \
  UNIBENCH_NODE_BIN="${NODE_HOME}/bin/node" \
  UNIBENCH_PORT="${SERVICE_PORT}" \
  "${SCRIPT_DIR}/verify-assets.sh" "${public_url}" 2>&1)"; then
  echo "Public tunnel: healthy"
  echo "Public URL: ${public_url}"
  echo "${verification_output}"
else
  echo "Public tunnel: unhealthy (HTML/client asset verification failed)"
  echo "${verification_output}" >&2
  exit 1
fi
