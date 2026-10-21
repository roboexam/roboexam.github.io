# Raw data review

`/review` reads `/mnt/public_ckp/UniEmbodied-Bench/raw` on the dashboard host.
The old generated staging candidate snapshot is no longer this page's data source.
Historical exporters, media routes, acceptance records and browser storage are preserved.
This change neither moves data nor changes capture/selector/admission decisions.

## Browsing and refresh

- Discover scene directories dynamically, including empty scenes. Keep the actual
  relative subfolder names (`clean/primary_clean100`, `clean_official`, `id`,
  `ood/visual`, `ood/semantic`, `ood/behavioral`, `failure`, arbitrary future batches).
- List episode directories containing MP4, HDF5, Parquet or an episode manifest,
  plus named `episode_*` directories with missing/incomplete files. Hidden and
  underscore metadata directories such as `_provenance` are not episode cohorts.
- Counts are directory records, not deduplicated trajectories or qualified samples.
  The same source can intentionally appear in multiple folders.
- The browser polls every 30 seconds while visible, refreshes on window focus, and
  provides a refresh button. The host coalesces concurrent scans and caches them
  for up to 30 seconds; discovery can therefore take approximately 60 seconds plus
  filesystem latency. It needs no rebuild, export or service restart for new data.
- Only the selected episode's metadata and video bytes are read. Dataset's existing
  synchronized three-camera player is reused. Missing video duration falls back to
  the loaded video's own duration. Missing/partial cameras remain visible as such.
- Raw folder names are organizational labels. Functional success, clean use,
  fidelity, formal time qualification, human review and dataset membership are not
  inferred from a directory name. Explicit recorded replay fidelity is displayed
  independently; missing values remain missing. Original manifest task mismatch,
  invalid metadata and missing/unreadable media produce visible warnings.
- Mount/scan failures return 503 and are retried. The UI keeps the previous folder
  view with an explicit stale warning so an in-progress comment can be saved.
  An episode refresh failure hides its video while preserving its comment editor.

## Human comments

The original reviewer / decision / timestamped note / JSON export workflow remains.
It is **browser-local**, not a shared review database. Existing local storage keys
are not erased and all historical entries are included in the existing JSON export.
Raw-view keys bind the raw relative episode identity plus metadata and verified
camera hashes; video replacements do not borrow another version's comments.
Historical staging IDs and raw directory IDs are distinct: existing staging notes
are retained in export, not fuzzily reassigned by seed or display episode number.
Copying a link preserves scene, folder and exact raw episode selection.

## Host API and boundaries

- `GET /api/raw-review`: scene/folder counts and scan time.
- `GET /api/raw-review?task=<opaque-id>`: that scene's directory entries.
- `GET /api/raw-review?episode=<opaque-id>`: one episode's validated public metadata,
  file names/sizes and opaque camera URLs. Absolute payload paths, arbitrary raw
  JSON and manifest-supplied staging paths are never returned or followed.
- `GET|HEAD /api/raw-review-media?id=<opaque-id>`: selected allowlisted MP4 only,
  with single/open-ended/suffix byte ranges. Unknown IDs/paths fail closed.
- The route uses the existing public access model; no auth/credential changes.
  Vite development uses the same host handlers through the existing media bridge.
- Only host configuration may set `DASHBOARD_RAW_ROOT`. A browser cannot choose a
  filesystem path. Discovered links are confined to the raw root, the public
  UniEmbodied-Bench tree, or the explicit existing raw-capture staging root.
  Link loops/escapes are reported; direct manifest paths never become read authority.
- Every newly viewed/replaced video is actually SHA-256 hashed, checked against
  manifest hash/size when provided, and checked before/after hashing for identity
  changes. In-process receipts reuse only exact physical path, expected identity,
  device/inode/size and nanosecond mtime/ctime. Receipts never survive a process or
  verifier revision. Recently changed files (<2 seconds) are rehashed to accommodate
  coarse shared-filesystem timestamps. `UNIBENCH_MEDIA_VERIFY_MODE=full` forces hashes.
  A byte/hash/size mismatch withholds that camera and reports a warning; it never
  changes the source metadata. Receipt reuse is trusted local derived state, not
  proof against privileged metadata forgery or new physical qualification.
- Media are opened with `O_NOFOLLOW`, checked again at serve time and sent with
  private/no-store caching. Replaced files return 410 instead of reusing old URLs.
- Scan bounds (50,000 directories, depth 12) fail explicitly, not by silent truncation.

## Verification (2026-10-22)

Based on local RoboExam main `a7db0603`; isolated branch
`feat/review-raw-library-20261022`, worktree
`/mnt/gyc/benchmark2027/worktrees/dashboard_review_raw_20261022`.

- Read-only real-root scan: 24 scenes, 2,866 episode directories, no scan warnings,
  approximately 4.05 seconds. Counts are a point-in-time observation.
- Selected three-camera examples: Hold Water Mug (new7), Stack Bowls (official),
  Classify (legacy curated), Pack Small. Cold hash/metadata reads 33–122 ms; matching
  hot reads 1.5–14 ms on these observed frozen files. No whole-tree video decode.
- Eight added tests: 100 distinct episodes, empty scenes, arbitrary groups, add/delete,
  stable IDs/version replacement, official/partial metadata, range/HEAD/suffix/416,
  mount failure, approved links, loops/escapes, media hash mismatch, same-size rapid
  file updates, and API path/duplicate-ID rejection. Included in `npm run test:unit`.
- TypeScript and repository hygiene pass. Lint has zero errors and the same four
  unrelated existing image warnings. Production build passes in the isolated worktree.
- Full unit command: 209 tests pass (plus the existing pretest gates).
- Built-server rendered tests: 13 pass, using the existing managed runtime environment
  for unrelated Track 1 media. No environment file is modified.
- Browser validation uses a loopback-only isolated production server on port 3192,
  forwarded over SSH. Verify real scene/folder changes, three ready camera elements,
  sample switching, saved comments returning only to their own sample, shared links,
  periodic refresh and responsive 390 px layout. No public preview is published.

Failures encountered and corrected: macOS archive sidecars accidentally transferred
with source were removed only from this newly created worktree; a malformed JSX close
was corrected; rapid same-size filesystem writes exposed a receipt-reuse race and
received the two-second fresh-file rehash rule. The build guard was supplied the real
canonical deployment checkout path (no guard disabled). The first rendered run's
obsolete staging-copy expectation was updated to the new route contract; an unrelated
Track 1 404 was resolved by using its existing runtime media environment, not by
weakening the media test. Original failure logs remain in `/tmp/dashboard-raw-*20261022.log`.

Shared main, the live service, original raw/staging data and GPU tasks remain unchanged.
Publication requires the repository's explicit deployment authorization and normal
clean-main release procedure. The watchdog may deploy a changed main automatically,
so this branch is not merged just to obtain a preview.
