#!/usr/bin/env bash
# Put newly admitted curated episodes on the dashboard, in one command.
#
# Everything downstream of "the episodes are in curated_simulation_data" used
# to be tribal knowledge: re-export the bundle, notice that a brand new task
# also needs a metadata entry, commit exactly the generated paths and nothing
# else, then wait for the release watchdog. That was enough friction that
# people pushed one or two episodes and gave up.
#
# Run it from any checkout of this repository:
#
#   bash ops/4090/publish-curated.sh            # export, commit, hand to the watchdog
#   bash ops/4090/publish-curated.sh --dry-run  # export and report, commit nothing
#
# It does NOT weaken what makes an episode publishable. The exporter still
# verifies every manifest hash, video hash and byte size, official reward,
# task success, failure-semantics witness and numbering registry entry, and
# still refuses anything not marked strictly_selected in catalog.json.
set -euo pipefail

NODE_HOME="${UNIBENCH_NODE_HOME:-/mnt/gyc_ckp/benchmark2027/runtime/node/node-v22.14.0-linux-x64}"
export PATH="${NODE_HOME}/bin:${PATH}"
EXPORT_CMD="${UNIBENCH_PUBLISH_EXPORT_CMD:-npm run --silent export:curated-dataset}"

dry_run="no"
for argument in "$@"; do
  case "${argument}" in
    --dry-run) dry_run="yes" ;;
    *) echo "Unknown option: ${argument}" >&2; exit 2 ;;
  esac
done

repo="$(git rev-parse --show-toplevel)"
cd "${repo}"

generated=(
  app/data/generated/curated-dataset.json
  app/data/generated/curated-media.json
  public/curated-data
  app/data/generated/explorer-dataset.json
  public/explorer-data
  scripts/curated-task-metadata.json
)

# Never sweep up someone else's work in progress. Anything dirty outside the
# generated paths means this is not a clean publish, so stop and say what.
mapfile -t dirty < <(git status --porcelain -- . | awk '{print $NF}')
unrelated=()
for file in "${dirty[@]-}"; do
  [[ -z "${file}" ]] && continue
  keep="no"
  for allowed in "${generated[@]}"; do
    [[ "${file}" == "${allowed}"* ]] && keep="yes"
  done
  [[ "${keep}" == "no" ]] && unrelated+=("${file}")
done
if (( ${#unrelated[@]} > 0 )); then
  echo "Refusing to publish: these files are modified but are not part of a curated export:" >&2
  printf '  %s\n' "${unrelated[@]}" >&2
  echo "Commit, stash or revert them first." >&2
  exit 1
fi

summary() {
  local file="app/data/generated/curated-dataset.json"
  [[ -s "${file}" ]] || { echo "(no bundle yet)"; return; }
  node -e '
    const d = require(process.argv[1]);
    const sum = (k) => d.tasks.reduce((total, t) => total + t[k], 0);
    console.log(`${d.tasks.length} tasks, ${d.episodeCount} episodes (clean ${sum("clean")}, recovery ${sum("recovery")}, ood ${sum("ood")})`);
  ' "${PWD}/${file}"
}

echo "Before: $(summary)"
eval "${EXPORT_CMD}"
echo "After:  $(summary)"

if ! git diff --quiet -- "${generated[@]}" || [[ -n "$(git ls-files --others --exclude-standard -- "${generated[@]}")" ]]; then
  :
else
  echo "Nothing changed; the dashboard already matches the catalog."
  exit 0
fi

if [[ "${dry_run}" == "yes" ]]; then
  echo
  echo "Dry run: the bundle above was written but nothing was committed."
  echo "Review with: git diff -- ${generated[*]}"
  exit 0
fi

git add -- "${generated[@]}"
git commit -q -m "Re-export the curated dataset against the current catalog

$(summary)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
echo
echo "Committed $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)."
echo "Merge it into the shared main checkout; the release watchdog publishes"
echo "within a minute, or run ops/4090/update.sh to publish immediately."
