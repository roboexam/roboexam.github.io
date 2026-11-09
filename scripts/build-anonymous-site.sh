#!/usr/bin/env bash
# Build the anonymous copy of the static site: the same pages with build/static-redactions.mjs's
# anonymous rules, audited, in <out> (default dist-anonymous) ready to publish as plain files.
#
#   STATIC_AUDIT_DENY=<file> bash scripts/build-anonymous-site.sh [out]
#
# STATIC_AUDIT_DENY names a deny list kept outside the repository (see scripts/audit-static-site.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-dist-anonymous}"
[[ -d public/static-api && -d public/static-media ]] || { echo "public/static-api and public/static-media are missing (see README)" >&2; exit 1; }

GITHUB_PAGES=true ROBOEXAM_SITE_VARIANT=anonymous UNIBENCH_DEPLOY_BUILD=1 npm run build
# same as the Pages workflow: raw benchmark folders are not part of the site
rm -rf dist/client/analysis dist/client/curated-data dist/client/curated-traces dist/client/episode-data dist/client/explorer-data dist/client/review-data
node scripts/redact-static-site.mjs dist/client/static-api --anonymous
node scripts/audit-static-site.mjs dist/client --anonymous ${STATIC_AUDIT_DENY:+--deny "$STATIC_AUDIT_DENY"}

rm -rf "$out"
cp -R dist/client "$out"
touch "$out/.nojekyll"
du -sh "$out"
