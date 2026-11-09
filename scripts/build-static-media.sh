#!/usr/bin/env bash
# Second half of the static snapshot (after scripts/export-static-site.mjs): compress the downloaded
# clip sample into <out>/static-media and write the URL → file manifest the static build reads.
#
#   bash scripts/build-static-media.sh <out>
#
# Then copy <out>/static-api and <out>/static-media into public/, and <out>/static-media.json into
# app/data/generated/.
set -euo pipefail

out="${1:?usage: build-static-media.sh <export dir>}"
plan="$out/media-plan.json"
[[ -f "$plan" ]] || { echo "missing $plan" >&2; exit 1; }

# one line per clip: file<TAB>transcode
node -e '
  for (const item of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))
    if (item.status === 200) console.log(`${item.file}\t${item.transcode}`);
' "$plan" | while IFS=$'\t' read -r file transcode; do
  source="$out/raw/$file"
  target="$out/static-media/$file"
  [[ -f "$source" ]] || { echo "missing clip $source" >&2; exit 1; }
  [[ -s "$target" ]] && continue
  mkdir -p "$(dirname "$target")"
  if [[ "$transcode" == "true" ]]; then
    # at most 960 px wide, H.264 for every browser, no audio, playable before it has fully loaded
    ffmpeg -nostdin -loglevel error -y -i "$source" -map 0:v:0 -an \
      -vf "scale='min(960,iw)':-2:flags=lanczos" -c:v libx264 -preset slow -crf 30 \
      -pix_fmt yuv420p -movflags +faststart "$target"
  else
    cp "$source" "$target"
  fi
done

node -e '
  const fs = require("fs");
  const media = {};
  for (const item of JSON.parse(fs.readFileSync(process.argv[1], "utf8")))
    if (item.status === 200) media[item.url] = `/static-media/${item.file}`;
  fs.writeFileSync(process.argv[2], JSON.stringify({ schemaVersion: "roboexam.static-media.v1", media }, null, 2) + "\n");
  console.log(`${Object.keys(media).length} clips in the manifest`);
' "$plan" "$out/static-media.json"
du -sh "$out/static-media" "$out/static-api"
