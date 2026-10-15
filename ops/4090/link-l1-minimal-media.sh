#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

/usr/bin/python3 /mnt/gyc/benchmark2027/scripts/storage/layout_guard.py \
  validate generated_dataset "${DASHBOARD_L1_MINIMAL_MEDIA_BUNDLE_DIR}" >/dev/null
node "${PROJECT_DIR}/scripts/check-l1-minimal-media.mjs" >/dev/null

media_link="${PROJECT_DIR}/public/l1-minimal-media"
if [[ -L "${media_link}" ]]; then
  if [[ "$(readlink -f "${media_link}")" != "$(readlink -f "${DASHBOARD_L1_MINIMAL_MEDIA_ROOT}")" ]]; then
    next_link="${media_link}.next.$$"
    ln -s "${DASHBOARD_L1_MINIMAL_MEDIA_ROOT}" "${next_link}"
    mv -Tf "${next_link}" "${media_link}"
  fi
elif [[ -e "${media_link}" ]]; then
  echo "Refusing to replace existing L1 media path: ${media_link}" >&2
  exit 1
else
  ln -s "${DASHBOARD_L1_MINIMAL_MEDIA_ROOT}" "${media_link}"
fi
echo "Dashboard L1 minimal media link is ready: ${media_link}"
