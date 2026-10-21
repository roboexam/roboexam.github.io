#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

if ! tmux has-session -t "=${TAILSCALE_SESSION}" 2>/dev/null; then
  echo "Fixed public URL: tailscaled session is stopped" >&2
  exit 1
fi
for required in "${TAILSCALE_BIN}" "${TAILSCALED_BIN}" "${TAILSCALE_STATE_FILE}"; do
  if [[ ! -e "${required}" ]]; then
    echo "Fixed public URL: required Tailscale path is missing: ${required}" >&2
    exit 1
  fi
done
if [[ ! -S "${TAILSCALE_SOCKET}" ]]; then
  echo "Fixed public URL: Tailscale socket is missing: ${TAILSCALE_SOCKET}" >&2
  exit 1
fi

if ! status_json="$("${TAILSCALE_BIN}" --socket="${TAILSCALE_SOCKET}" status --json 2>/dev/null)"; then
  echo "Fixed public URL: unable to read Tailscale status" >&2
  exit 1
fi
if ! printf '%s' "${status_json}" | "${NODE_HOME}/bin/node" -e '
  const fs = require("fs");
  const status = JSON.parse(fs.readFileSync(0, "utf8"));
  if (status.BackendState !== "Running" || status.Self?.Online !== true) {
    console.error(`Tailscale is not online (backend=${status.BackendState ?? "unknown"}, online=${status.Self?.Online ?? false})`);
    process.exit(1);
  }
  const expiry = Date.parse(status.Self?.KeyExpiry ?? "");
  if (Number.isFinite(expiry)) {
    if (expiry <= Date.now()) {
      console.error(`Tailscale node key expired at ${status.Self.KeyExpiry}`);
      process.exit(1);
    }
    const warningWindow = Number(process.env.UNIBENCH_KEY_EXPIRY_WARN_DAYS ?? "30") * 86400000;
    if (expiry - Date.now() <= warningWindow) {
      console.error(`WARNING: Tailscale node key expires at ${status.Self.KeyExpiry}`);
    }
  }
'; then
  echo "Fixed public URL: Tailscale node is not ready" >&2
  exit 1
fi

if ! funnel_status="$("${TAILSCALE_BIN}" --socket="${TAILSCALE_SOCKET}" funnel status 2>/dev/null)"; then
  echo "Fixed public URL: unable to read Funnel status" >&2
  exit 1
fi
if ! printf '%s\n' "${funnel_status}" | "${NODE_HOME}/bin/node" \
  "${SCRIPT_DIR}/check-funnel-mapping.mjs" "${FIXED_PUBLIC_URL}" "${TAILSCALE_FUNNEL_TARGET}"; then
  echo "Fixed public URL: Funnel mapping is missing or points at the wrong target" >&2
  exit 1
fi

if verification_output="$(UNIBENCH_PROJECT_DIR="${PROJECT_DIR}" \
  UNIBENCH_NODE_BIN="${NODE_HOME}/bin/node" \
  UNIBENCH_PORT="${SERVICE_PORT}" \
  UNIBENCH_VERIFY_RETRIES="${UNIBENCH_FIXED_VERIFY_RETRIES:-2}" \
  UNIBENCH_VERIFY_TIMEOUT="${UNIBENCH_FIXED_VERIFY_TIMEOUT:-30}" \
  UNIBENCH_VERIFY_SCOPE="${UNIBENCH_FIXED_VERIFY_SCOPE:-critical}" \
  UNIBENCH_VERIFY_DIRECT=1 \
  "${SCRIPT_DIR}/verify-assets.sh" "${FIXED_PUBLIC_URL}" 2>&1)"; then
  echo "Fixed public URL: healthy"
  echo "Fixed URL: ${FIXED_PUBLIC_URL}"
  echo "${verification_output}"
else
  echo "Fixed public URL: unhealthy (TLS, HTML, or client assets failed verification)" >&2
  echo "${verification_output}" >&2
  exit 1
fi
