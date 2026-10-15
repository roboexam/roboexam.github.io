#!/usr/bin/env bash
# Stop the cross-host watch. Nothing on the 4090 is affected.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if [[ ! -s "${REMOTE_PID_FILE}" ]]; then
  echo "Remote dashboard supervisor is not running."
  exit 0
fi
pid=""
read -r pid <"${REMOTE_PID_FILE}" || true
if [[ ! "${pid}" =~ ^[0-9]+$ ]] || ! kill -0 "${pid}" 2>/dev/null; then
  rm -f "${REMOTE_PID_FILE}"
  echo "Remote dashboard supervisor is not running; removed a stale pid file."
  exit 0
fi

kill "${pid}"
for _ in $(seq 1 20); do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "Remote dashboard supervisor stopped (pid ${pid})."
    exit 0
  fi
  sleep 0.5
done
echo "Remote dashboard supervisor (pid ${pid}) did not exit within 10s." >&2
exit 1
