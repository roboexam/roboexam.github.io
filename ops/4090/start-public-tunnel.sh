#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

"${SCRIPT_DIR}/start.sh" >/dev/null

if [[ ! -x "${CLOUDFLARED_BIN}" ]]; then
  echo "cloudflared is missing: ${CLOUDFLARED_BIN}" >&2
  exit 1
fi

if tmux has-session -t "=${TUNNEL_SESSION}" 2>/dev/null; then
  if [[ -s "${PUBLIC_URL_FILE}" ]]; then
    echo "Public URL: $(<"${PUBLIC_URL_FILE}")"
    exit 0
  fi
  tmux kill-session -t "=${TUNNEL_SESSION}"
fi

: >"${TUNNEL_LOG_FILE}"
rm -f "${PUBLIC_URL_FILE}"
tmux new-session -d -s "${TUNNEL_SESSION}" \
  "exec '${CLOUDFLARED_BIN}' tunnel --no-autoupdate --protocol http2 --url 'http://127.0.0.1:${SERVICE_PORT}' >>'${TUNNEL_LOG_FILE}' 2>&1"

for _ in {1..45}; do
  public_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "${TUNNEL_LOG_FILE}" | tail -1 || true)"
  if [[ -n "${public_url}" ]]; then
    printf '%s\n' "${public_url}" >"${PUBLIC_URL_FILE}"
    echo "Public URL: ${public_url}"
    exit 0
  fi
  sleep 1
done

echo "The public tunnel did not become ready. Check ${TUNNEL_LOG_FILE}." >&2
exit 1
