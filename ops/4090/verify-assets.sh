#!/usr/bin/env bash
set -euo pipefail

VERIFY_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_PROJECT_DIR="$(cd -- "${VERIFY_SCRIPT_DIR}/../.." && pwd -P)"
PROJECT_DIR="${UNIBENCH_PROJECT_DIR:-${DEFAULT_PROJECT_DIR}}"
SERVICE_PORT="${UNIBENCH_PORT:-3100}"
NODE_BIN="${UNIBENCH_NODE_BIN:-node}"
CURL_BIN="${UNIBENCH_CURL_BIN:-curl}"
VERIFY_TIMEOUT="${UNIBENCH_VERIFY_TIMEOUT:-30}"
VERIFY_RETRIES="${UNIBENCH_VERIFY_RETRIES:-0}"
VERIFY_SCOPE="${UNIBENCH_VERIFY_SCOPE:-full}"
BASE_URL="${1:-http://127.0.0.1:${SERVICE_PORT}}"
PAGE_PATH="${UNIBENCH_HEALTH_PATH:-/login}"

BASE_URL="${BASE_URL%/}"
entry_manifest="${PROJECT_DIR}/dist/client/vinext-client-entry-manifest.json"
vite_manifest="${PROJECT_DIR}/dist/client/.vite/manifest.json"

for required in "${entry_manifest}" "${vite_manifest}"; do
  if [[ ! -f "${required}" ]]; then
    echo "Asset verification failed: missing build manifest ${required}" >&2
    exit 1
  fi
done

if [[ ! -x "${NODE_BIN}" ]] && ! command -v "${NODE_BIN}" >/dev/null 2>&1; then
  echo "Asset verification failed: Node executable not found: ${NODE_BIN}" >&2
  exit 1
fi

page_url="${BASE_URL}${PAGE_PATH}"
curl_args=(
  --fail
  --silent
  --show-error
  --location
  --max-time "${VERIFY_TIMEOUT}"
  --retry "${VERIFY_RETRIES}"
  --retry-all-errors
  --retry-delay 1
)
if [[ "${UNIBENCH_VERIFY_DIRECT:-0}" == "1" ]]; then
  curl_args+=(--noproxy "*")
fi
if ! page="$(${CURL_BIN} "${curl_args[@]}" "${page_url}")"; then
  echo "Asset verification failed: page is unavailable: ${page_url}" >&2
  exit 1
fi

expected_entry="$(${NODE_BIN} -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (typeof manifest.appBrowserEntry !== "string" || !manifest.appBrowserEntry.startsWith("_next/static/")) process.exit(2);
  process.stdout.write(`/${manifest.appBrowserEntry}`);
' "${entry_manifest}")"

html_assets="$(printf '%s' "${page}" | grep -oE '(src|href)="/_next/static/[^"\\]+"' | sed -E 's/^(src|href)="//; s/"$//' | sort -u || true)"
if ! printf '%s\n' "${html_assets}" | grep -Fxq "${expected_entry}"; then
  echo "Asset verification failed: ${page_url} does not reference current entry ${expected_entry}" >&2
  exit 1
fi

manifest_assets="$(${NODE_BIN} -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const files = new Set();
  for (const record of Object.values(manifest)) {
    for (const candidate of [record.file, ...(record.css ?? []), ...(record.assets ?? [])]) {
      if (typeof candidate === "string" && candidate.startsWith("_next/static/")) files.add(`/${candidate}`);
    }
  }
  process.stdout.write([...files].sort().join("\n"));
' "${vite_manifest}")"

case "${VERIFY_SCOPE}" in
  full)
    assets="$(printf '%s\n%s\n' "${html_assets}" "${manifest_assets}" | sed '/^$/d' | sort -u)"
    ;;
  critical)
    critical_css="$(printf '%s\n' "${html_assets}" | grep -E '\.css([?#].*)?$' || true)"
    assets="$(printf '%s\n%s\n' "${expected_entry}" "${critical_css}" | sed '/^$/d' | sort -u)"
    ;;
  html)
    assets="$(printf '%s\n' "${html_assets}" | sed '/^$/d' | sort -u)"
    ;;
  *)
    echo "Asset verification failed: unsupported scope ${VERIFY_SCOPE}; expected full, critical, or html" >&2
    exit 1
    ;;
esac
if [[ -z "${assets}" ]]; then
  echo "Asset verification failed: no client assets were discovered" >&2
  exit 1
fi

asset_check_dir="$(mktemp -d "${TMPDIR:-/tmp}/unibench-asset-check.XXXXXX")"
cleanup_asset_checks() {
  rm -rf -- "${asset_check_dir}"
}
trap cleanup_asset_checks EXIT

asset_count=0
asset_pids=()
asset_results=()
while IFS= read -r asset; do
  [[ -n "${asset}" ]] || continue
  disk_path="${PROJECT_DIR}/dist/client${asset}"
  if [[ ! -s "${disk_path}" ]]; then
    echo "Asset verification failed: referenced asset is missing or empty: ${disk_path}" >&2
    exit 1
  fi

  asset_url="${BASE_URL}${asset}"
  asset_count=$((asset_count + 1))
  result_file="${asset_check_dir}/${asset_count}.txt"
  asset_results+=("${result_file}")
  (
    if ! response="$(${CURL_BIN} "${curl_args[@]}" --output "${result_file}.body" --write-out '%{http_code} %{size_download}' "${asset_url}" 2>"${result_file}.curl")"; then
      printf 'Asset verification failed: asset request failed: %s\n' "${asset_url}" >"${result_file}"
      exit 1
    fi
    status="${response%% *}"
    size="${response##* }"
    if [[ "${status}" != "200" || "${size}" -le 0 ]]; then
      printf 'Asset verification failed: %s returned HTTP %s, %s bytes\n' \
        "${asset_url}" "${status}" "${size}" >"${result_file}"
      exit 1
    fi
    : >"${result_file}"
  ) &
  asset_pids+=("$!")
done <<< "${assets}"

asset_failure=0
for index in "${!asset_pids[@]}"; do
  if ! wait "${asset_pids[${index}]}"; then
    if [[ -s "${asset_results[${index}]}" ]]; then
      <"${asset_results[${index}]}" sed -n '1p' >&2
    fi
    if [[ -s "${asset_results[${index}]}.curl" ]]; then
      <"${asset_results[${index}]}.curl" sed -n '1,3p' >&2
    fi
    asset_failure=1
  fi
done
if [[ "${asset_failure}" == "1" ]]; then
  exit 1
fi

echo "Asset verification passed: ${asset_count} client assets from ${page_url}"
