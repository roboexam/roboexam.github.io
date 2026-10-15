#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/mnt/gyc/benchmark2027/dashboard-szm"
RUNTIME_DIR="/mnt/gyc_ckp/benchmark2027/runtime/dashboard-szm-smoke"
NODE_HOME="/mnt/gyc_ckp/benchmark2027/runtime/node/node-v22.14.0-linux-x64"
AUTH_ENV="/mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.env"
SERVER_SESSION="unibench-dashboard-szm-smoke"
TUNNEL_SESSION="unibench-dashboard-szm-smoke-tunnel"
SERVER_LOG="${RUNTIME_DIR}/dashboard.log"
TUNNEL_LOG="${RUNTIME_DIR}/cloudflared.log"
PUBLIC_URL_FILE="${RUNTIME_DIR}/public-url.txt"
CLOUDFLARED="/mnt/gyc_ckp/benchmark2027/runtime/dashboard/cloudflared"
PORT="${UNIBENCH_SMOKE_PORT:-3101}"

mkdir -p "${RUNTIME_DIR}"

if ! curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/login" >/dev/null 2>&1; then
  if tmux has-session -t "=${SERVER_SESSION}" 2>/dev/null; then
    echo "Preview tmux session exists but port ${PORT} is not healthy." >&2
    exit 1
  fi

  : >"${SERVER_LOG}"
  tmux new-session -d -s "${SERVER_SESSION}" \
    "cd '${PROJECT_DIR}' && set -a && source '${AUTH_ENV}' && set +a && exec env PATH='${NODE_HOME}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' PORT='${PORT}' npm run start -- --hostname 0.0.0.0 --port '${PORT}' >>'${SERVER_LOG}' 2>&1"

  for _ in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/login" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/login" >/dev/null

if ! tmux has-session -t "=${TUNNEL_SESSION}" 2>/dev/null; then
  : >"${TUNNEL_LOG}"
  tmux new-session -d -s "${TUNNEL_SESSION}" \
    "'${CLOUDFLARED}' tunnel --no-autoupdate --protocol http2 --url 'http://127.0.0.1:${PORT}' >>'${TUNNEL_LOG}' 2>&1"
fi

public_url=""
for _ in $(seq 1 60); do
  public_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "${TUNNEL_LOG}" | tail -n 1 || true)"
  if [[ -n "${public_url}" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "${public_url}" ]]; then
  echo "Preview is healthy locally, but no public tunnel URL was found." >&2
  tail -n 40 "${TUNNEL_LOG}" >&2 || true
  exit 1
fi

printf '%s\n' "${public_url}" >"${PUBLIC_URL_FILE}"
printf 'Preview: %s\n' "${public_url}"
printf 'Local: http://127.0.0.1:%s\n' "${PORT}"
