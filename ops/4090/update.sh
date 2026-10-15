#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

script_project_dir="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
project_dir="$(cd "${PROJECT_DIR}" && pwd -P)"
if [[ "${script_project_dir}" != "${project_dir}" ]]; then
  echo "Run update.sh from the shared deployment checkout: ${project_dir}" >&2
  exit 1
fi

cd "${PROJECT_DIR}"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "The shared deployment checkout must be on main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The shared deployment checkout must be completely clean, including untracked files." >&2
  git status --short >&2
  exit 1
fi

deploy_commit="$(git rev-parse HEAD)"
mkdir -p "${RUNTIME_DIR}"
exec 9>"${DEPLOY_LOCK_FILE}"
if ! flock -n 9; then
  echo "Another dashboard deployment is already in progress: ${DEPLOY_LOCK_FILE}" >&2
  exit 1
fi

if [[ ! -x "${UNIBENCH_TRACE_PYTHON}" ]]; then
  echo "Managed trace Python is missing: ${UNIBENCH_TRACE_PYTHON}" >&2
  exit 1
fi

"${SCRIPT_DIR}/link-media.sh"
"${SCRIPT_DIR}/link-episode-media.sh"
"${SCRIPT_DIR}/link-vlm-sample-media.sh"
"${SCRIPT_DIR}/link-l1-minimal-media.sh"
"${SCRIPT_DIR}/link-l1-phase1-media.sh"
echo "Running dashboard checks that do not mutate the live client bundle..."
npm run check:prebuild

if tmux has-session -t "=${TMUX_SESSION}" 2>/dev/null; then
  "${SCRIPT_DIR}/stop.sh"
fi

echo "Building the release while the service is explicitly stopped..."
if ! UNIBENCH_DEPLOY_BUILD=1 npm run build; then
  echo "Release build failed; the service remains stopped rather than serving inconsistent assets." >&2
  exit 1
fi
if ! npm run test:render; then
  echo "Rendered-HTML verification failed; the service remains stopped." >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "${deploy_commit}" || -n "$(git status --porcelain)" ]]; then
  echo "The shared main checkout changed during the release build; refusing to publish a mixed revision." >&2
  exit 1
fi

"${SCRIPT_DIR}/start.sh"
deployed_tmp="${DEPLOYED_COMMIT_FILE}.tmp.$$"
printf '%s\n' "${deploy_commit}" >"${deployed_tmp}"
mv "${deployed_tmp}" "${DEPLOYED_COMMIT_FILE}"
live_tmp="${LIVE_VERIFIED_COMMIT_FILE}.tmp.$$"
printf 'pending %s\n' "${deploy_commit}" >"${live_tmp}"
mv "${live_tmp}" "${LIVE_VERIFIED_COMMIT_FILE}"
"${SCRIPT_DIR}/status.sh"
UNIBENCH_FIXED_VERIFY_SCOPE=full \
  UNIBENCH_FIXED_VERIFY_TIMEOUT=60 \
  UNIBENCH_FIXED_VERIFY_RETRIES=1 \
  "${SCRIPT_DIR}/ensure-fixed-funnel.sh"
live_tmp="${LIVE_VERIFIED_COMMIT_FILE}.tmp.$$"
printf '%s\n' "${deploy_commit}" >"${live_tmp}"
mv "${live_tmp}" "${LIVE_VERIFIED_COMMIT_FILE}"
echo "The 4090 dashboard has been updated."
