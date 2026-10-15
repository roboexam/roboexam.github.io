#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

/usr/bin/python3 /mnt/gyc/benchmark2027/scripts/storage/layout_guard.py \
  validate generated_dataset "${DASHBOARD_EPISODE_MEDIA_BUNDLE_DIR}" >/dev/null

if [[ ! -d "${DASHBOARD_EPISODE_MEDIA_ROOT}" || ! -f "${DASHBOARD_EPISODE_MEDIA_MANIFEST}" ]]; then
  echo "Dashboard episode media bundle is incomplete: ${DASHBOARD_EPISODE_MEDIA_BUNDLE_DIR}" >&2
  exit 1
fi

media_link="${PROJECT_DIR}/public/episode-media"
if [[ -L "${media_link}" ]]; then
  if [[ "$(readlink -f "${media_link}")" != "$(readlink -f "${DASHBOARD_EPISODE_MEDIA_ROOT}")" ]]; then
    next_link="${media_link}.next.$$"
    ln -s "${DASHBOARD_EPISODE_MEDIA_ROOT}" "${next_link}"
    if [[ "$(readlink -f "${next_link}")" != "$(readlink -f "${DASHBOARD_EPISODE_MEDIA_ROOT}")" ]]; then
      echo "Refusing to publish an unverified episode media link: ${next_link}" >&2
      exit 1
    fi
    mv -Tf "${next_link}" "${media_link}"
  fi
elif [[ -e "${media_link}" ]]; then
  echo "Refusing to replace the existing episode media path: ${media_link}" >&2
  exit 1
else
  ln -s "${DASHBOARD_EPISODE_MEDIA_ROOT}" "${media_link}"
fi

echo "Dashboard episode media link is ready: ${media_link}"
