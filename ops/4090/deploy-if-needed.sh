#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

script_project_dir="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
project_dir="$(cd "${PROJECT_DIR}" && pwd -P)"
if [[ "${script_project_dir}" != "${project_dir}" ]]; then
  echo "Run deploy-if-needed.sh from the shared deployment checkout: ${project_dir}" >&2
  exit 1
fi
if [[ "$(git -C "${PROJECT_DIR}" branch --show-current)" != "main" ]]; then
  echo "Automatic deployment requires the shared main checkout." >&2
  exit 1
fi
if [[ -n "$(git -C "${PROJECT_DIR}" status --porcelain)" ]]; then
  echo "Automatic deployment is blocked because the shared main checkout is dirty." >&2
  git -C "${PROJECT_DIR}" status --short >&2
  exit 1
fi

source_commit="$(git -C "${PROJECT_DIR}" rev-parse HEAD)"
deployed_commit=""
if [[ -s "${DEPLOYED_COMMIT_FILE}" ]]; then
  deployed_commit="$(<"${DEPLOYED_COMMIT_FILE}")"
fi

if [[ "${source_commit}" != "${deployed_commit}" || ! -f "${PROJECT_DIR}/dist/server/index.js" ]]; then
  echo "Deploying source commit ${source_commit}; current deployed marker is ${deployed_commit:-missing}."
  exec "${SCRIPT_DIR}/update.sh"
fi

if ! tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
  echo "The deployed build is current but the dashboard process is stopped; starting it."
  "${SCRIPT_DIR}/start.sh"
elif ! "${SCRIPT_DIR}/status.sh"; then
  echo "The deployed process is unhealthy; rebuilding the current commit."
  exec "${SCRIPT_DIR}/update.sh"
fi

"${SCRIPT_DIR}/ensure-fixed-funnel.sh"
live_tmp="${LIVE_VERIFIED_COMMIT_FILE}.tmp.$$"
printf '%s\n' "${source_commit}" >"${live_tmp}"
mv "${live_tmp}" "${LIVE_VERIFIED_COMMIT_FILE}"
echo "Release guard: source, deployed build, and fixed public URL are current at ${source_commit}."
