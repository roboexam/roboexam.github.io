# Latest-three ACWM evaluation · 2026-11-05

The current 600-case results are integrated into the normal Track 2 leaderboard, using its shared navigation, typography, filters and table classes. `/?track=T2` opens that workspace directly; the former standalone `/track-2/results` route only redirects there. Current results, the metric plan and historical runs remain separate selections. There is no separate results-page theme or CSS module.

The generated full bundle remains the score source. Its hash-bound `acwm600-summary.json` derivative copies aggregates exactly and omits the 1,800 case records from the initial client payload. Protocol, SHA, coverage, reader limits and a full JSON download are inside folded details. `/api/acwm600-results` serves the unchanged full bundle and accepts no filesystem paths or query parameters. Run `npm run export:acwm600` on the experiment server to export both bundles, or `npm run check:acwm600` to compare them with the allowlisted formal artifacts. Neither command generates predictions or executes metric models. Offline builds and visitors use the frozen bundles; they do not need the experiment filesystem.

`scripts/acwm600-registry.mjs` freezes the accepted run and three model checkpoint SHA-256 identities. The exporter requires `COMPLETE_A_AND_V5_B`, 600 unique cases per model, 24 tasks × 5 regimes × 5 cases, exact prediction/time identity across v4/v5, complete numeric reader coverage, and source-report hash agreement. Nine accepted quick-pair B results have an older schema: their exact receipt hashes and original v5 manifest are required instead of inventing a missing reader field.

The browser bundle retains logical source IDs and hashes; experiment paths and credentials are excluded. Per-case prediction, recorded-time, generation and B-source hashes are retained. A source manifests retain the frozen evaluator contract and formula provenance. The reader is used on both GT RGB and generated RGB. SDK end-effector values are diagnostic only.

The cohort uses fixed-action self-recursive replay with t0-only conditioning and no future-GT conditioning. Model-native rates differ; the published comparison uses actual common 0.16-second timestamps, excludes t0 and performs no interpolation. Scope selection chooses an existing formal ALL, task or regime aggregate; it never averages already-aggregated percentiles or computes an unsupported joint task×regime A3 group.

A1 PSNR and A2 SSIM use future-frame micro means. A5 M-MSE uses the frozen pooled numerator/denominator with eta=0.01. A4 and A6 use episode macro aggregation. JEPA similarity and JEDi distance are set-level outputs of the same distribution comparison; there is no per-episode A3 value. A is independent of the AnyPos reader selection. B `ee_position_mae_mm` is Euclidean end-effector position error; B `ee_rotation_mae_deg` is SO(3) angular error. The two arms are pooled with valid arm-frame denominators. These B readouts do not populate legacy counterfactual Action Following/TA/LAC metrics.

AnyPos v5 is the default; v4 remains an explicit comparison. The same predictions are reused. A change in reader scores does not establish generation-model improvement. v5 passed original GT validation thresholds on 19 of 24 tasks; pour_liquid_into_cup, hang_mugs, stack_bowls, push_T and find_category_outlier remain TASK_LIMITED and are all retained. Numeric coverage is distinct from generated-domain 3D/identity accuracy and task success.

Validation commands:

```sh
node --test tests/acwm600-data.test.mjs
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

The data tests reject duplicate or incomplete cohorts, NaNs, incomplete coverage and per-case A3, and reproduce every formal B scope aggregate from the case denominators for both readers. They also require the lightweight summary to equal the exact full-bundle projection. Rendered tests cover the normal dashboard shell, frozen v5 scores, legacy-route redirect and complete JSON download. Browser checks cover v4/v5, task/regime and dimension filters, folded provenance, unchanged neighboring tracks, desktop/mobile layout and the normal navigation path. Production deployment still uses the repository's managed release workflow and requires a clean shared main checkout.

## Release source isolation · 2026-11-05

The active Node service is on xiaobao, port 3100. Source development remains in
`/mnt/gyc/benchmark2027/roboexam/third_party/dashboard` (the public dashboard path
is a symlink to it). Deployment follows the existing clean-main snapshot pattern:
build and run a committed main checkout without copying unrelated training work
from the dirty shared checkout. API handlers are in `app/api/`; server-side
filesystem readers are in `app/data/*.server.ts` (for example,
`app/data/raw-review.server.ts`), and `worker/index.ts` is the compatible
Worker entry. The existing `ops/4090` script directory retains its historical
name and is also used on this host. No Tailscale identity or public URL changes.

The November 5 mutable policy-results folder contains newer Track 3 scoring.
ACWM publication must not silently publish those unrelated changes. The v4
policy exporter therefore binds score JSON to the actual pre-update backup,
restored at
`/mnt/gyc_ckp/benchmark2027/experiments/audits/dashboard_acwm600_release_20261105_v1/preserved_policy_v4_source`.
Its manifest SHA is the original published `987c5f57…`; all 1,440 episode report
hashes, 288 task aggregates, and 12 overall aggregates were independently matched
to the unchanged published v4 bundle. `policy_v4_snapshot_qualification.json`
in the parent audit directory records that check. Media remain in their original
allowlisted location. No policy scores, generated bundles, formulas or videos
are updated by this source-binding repair; `--check` now also validates every
published episode's frozen report hash.
