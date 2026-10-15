#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

/usr/bin/python3 /mnt/gyc/benchmark2027/scripts/storage/layout_guard.py \
  validate generated_dataset "${DASHBOARD_MEDIA_BUNDLE_DIR}" >/dev/null

if [[ ! -d "${DASHBOARD_MEDIA_ROOT}" || ! -f "${DASHBOARD_MEDIA_MANIFEST}" ]]; then
  echo "Dashboard media bundle is incomplete: ${DASHBOARD_MEDIA_BUNDLE_DIR}" >&2
  exit 1
fi

media_link="${PROJECT_DIR}/public/media"
if [[ -L "${media_link}" ]]; then
  if [[ "$(readlink -f "${media_link}")" != "$(readlink -f "${DASHBOARD_MEDIA_ROOT}")" ]]; then
    echo "Dashboard media link points to an unexpected bundle: ${media_link}" >&2
    exit 1
  fi
elif [[ -e "${media_link}" ]]; then
  echo "Refusing to replace the existing media path: ${media_link}" >&2
  exit 1
else
  ln -s "${DASHBOARD_MEDIA_ROOT}" "${media_link}"
fi

echo "Dashboard media link is ready: ${media_link}"
