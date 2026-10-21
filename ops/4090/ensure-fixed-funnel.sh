#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

mkdir -p "${RUNTIME_DIR}"
exec 8>"${FIXED_PUBLIC_LOCK_FILE}"
if ! flock -n 8; then
  echo "Fixed public URL repair is already in progress: ${FIXED_PUBLIC_LOCK_FILE}" >&2
  exit 1
fi

for required in "${TAILSCALE_BIN}" "${TAILSCALED_BIN}" "${TAILSCALE_STATE_FILE}"; do
  if [[ ! -e "${required}" ]]; then
    echo "Cannot restore the fixed URL; required Tailscale path is missing: ${required}" >&2
    exit 1
  fi
done

is_online() {
  [[ -S "${TAILSCALE_SOCKET}" ]] || return 1
  "${TAILSCALE_BIN}" --socket="${TAILSCALE_SOCKET}" status --json 2>/dev/null | \
    "${NODE_HOME}/bin/node" -e '
      const fs = require("fs");
      const status = JSON.parse(fs.readFileSync(0, "utf8"));
      process.exit(status.BackendState === "Running" && status.Self?.Online === true ? 0 : 1);
    '
}

start_tailscaled() {
  if tmux has-session -t "=${TAILSCALE_SESSION}" 2>/dev/null; then
    tmux kill-session -t "=${TAILSCALE_SESSION}"
  fi
  rm -f "${TAILSCALE_SOCKET}"
  # The workspace proxy rejects Tailscale's control-plane CONNECT requests with
  # HTTP 403. Keep the proxy available to the dashboard, but make the managed
  # daemon use the working direct route.
  tmux new-session -d -s "${TAILSCALE_SESSION}" \
    "exec env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY -u http_proxy -u https_proxy -u all_proxy -u no_proxy '${TAILSCALED_BIN}' --tun=userspace-networking --state='${TAILSCALE_STATE_FILE}' --statedir='${TAILSCALE_STATE_DIR}' --socket='${TAILSCALE_SOCKET}'"
  for _ in {1..30}; do
    if is_online; then
      return 0
    fi
    sleep 1
  done
  echo "Tailscale did not become online; authentication may require administrator action" >&2
  return 1
}

mapping_is_current() {
  local output
  output="$("${TAILSCALE_BIN}" --socket="${TAILSCALE_SOCKET}" funnel status 2>/dev/null)" || return 1
  printf '%s\n' "${output}" | "${NODE_HOME}/bin/node" \
    "${SCRIPT_DIR}/check-funnel-mapping.mjs" "${FIXED_PUBLIC_URL}" "${TAILSCALE_FUNNEL_TARGET}"
}

ensure_mapping() {
  if ! mapping_is_current; then
    echo "Restoring the fixed Funnel mapping to ${TAILSCALE_FUNNEL_TARGET}."
    "${TAILSCALE_BIN}" --socket="${TAILSCALE_SOCKET}" \
      funnel --bg --https=443 "${TAILSCALE_FUNNEL_TARGET}"
  fi
}

restarted=0
if ! tmux has-session -t "=${TAILSCALE_SESSION}" 2>/dev/null || ! is_online; then
  echo "Starting the managed Tailscale daemon for the fixed public URL."
  start_tailscaled
  restarted=1
fi
ensure_mapping

if "${SCRIPT_DIR}/fixed-public-status.sh"; then
  exit 0
fi

if [[ "${restarted}" == "1" ]]; then
  echo "Fixed URL verification still fails after starting Tailscale; refusing another restart." >&2
  exit 1
fi

now_epoch="$(date +%s)"
last_restart_epoch=0
if [[ -s "${TAILSCALE_LAST_RESTART_FILE}" ]]; then
  read -r last_restart_epoch <"${TAILSCALE_LAST_RESTART_FILE}" || last_restart_epoch=0
fi
restart_cooldown="${UNIBENCH_TAILSCALE_RESTART_COOLDOWN_SECONDS:-900}"
if [[ ! "${last_restart_epoch}" =~ ^[0-9]+$ ]] || \
   (( now_epoch - last_restart_epoch >= restart_cooldown )); then
  restart_tmp="${TAILSCALE_LAST_RESTART_FILE}.tmp.$$"
  printf '%s\n' "${now_epoch}" >"${restart_tmp}"
  mv "${restart_tmp}" "${TAILSCALE_LAST_RESTART_FILE}"
  echo "The Funnel control state is correct but its public data path is unhealthy; restarting tailscaled once."
  start_tailscaled
  ensure_mapping
  "${SCRIPT_DIR}/fixed-public-status.sh"
  exit 0
fi

echo "Fixed URL remains unhealthy; restart cooldown is active, so no restart loop was started." >&2
exit 1
