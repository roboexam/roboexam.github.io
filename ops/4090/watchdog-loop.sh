#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

mkdir -p "${RUNTIME_DIR}"
while true; do
  checked_at="$(date -Is)"
  checked_epoch="$(date +%s)"
  result="ok"
  if ! output="$("${SCRIPT_DIR}/deploy-if-needed.sh" 2>&1)"; then
    result="failed"
  elif grep -Fq "WARNING:" <<<"${output}"; then
    result="warning"
  fi
  printf '[%s] result=%s\n%s\n' "${checked_at}" "${result}" "${output}" >>"${WATCHDOG_LOG_FILE}"
  deployed_value=""
  live_verified_value=""
  if [[ -s "${DEPLOYED_COMMIT_FILE}" ]]; then
    read -r deployed_value <"${DEPLOYED_COMMIT_FILE}"
  fi
  if [[ -s "${LIVE_VERIFIED_COMMIT_FILE}" ]]; then
    read -r live_verified_value <"${LIVE_VERIFIED_COMMIT_FILE}"
  fi
  status_tmp="${WATCHDOG_STATUS_FILE}.tmp.$$"
  {
    printf 'checked_epoch=%q\n' "${checked_epoch}"
    printf 'checked_at=%q\n' "${checked_at}"
    printf 'result=%q\n' "${result}"
    printf 'source_commit=%q\n' "$(git -C "${PROJECT_DIR}" rev-parse HEAD 2>/dev/null || true)"
    printf 'deployed_commit=%q\n' "${deployed_value}"
    printf 'live_verified_commit=%q\n' "${live_verified_value}"
  } >"${status_tmp}"
  mv "${status_tmp}" "${WATCHDOG_STATUS_FILE}"
  sleep "${WATCHDOG_INTERVAL_SECONDS}"
done
