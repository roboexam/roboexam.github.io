# Track 1 benchmark publication

The current release is `t1-robodojo14-deepseek-20261021-v1`, using the user-approved common scope of 14 tasks, 70 scenes, and 207 process slots. Original native16 evidence and the previous Stack Bowls publication are unchanged.

## Model restoration and public metric names

The current table has six rows: DeepSeek Flash, MiMo v2.6 Pro, GPT-6 Astra, GLM 5.3 Flash, MiniMax H3.1 Preview and Cosmos3-Nano. The old DeepSeek row, Kimi K3 and Peak Progress are excluded at the user's request. `app/data/t1-leaderboard-results.ts` is a presentation adapter over the two existing frozen bundles and the existing model catalog; it never grades or aggregates scores.

MiMo and GPT-6 Astra retain their exact saved Initial VQA and capability values. Overall, mean Subtask, Success and process metrics remain empty where no corresponding aggregate was saved. The original five-scene scope and initial-only formula are used in those rows' metric dialogs. GLM, MiniMax and Cosmos retain their names with empty current-protocol cells; unrelated historical metrics stay in the existing historical view.

The main capability headings are Recognition, Localization, Relations, Goals, Constraints, Interaction, Planning, Task Tracking and Next Action. Each has a short explanation, and formulas display capability names instead of internal A/B/C codes. Internal IDs and both formal result JSON files remain unchanged.

## Five-rollout gallery

Every model offers the fourteen current tasks and five scene cards per task. The cards show the task's admitted scene IDs in scope order, rather than all seven IDs in the cross-task union. DeepSeek's five cards expose their exact original sensor clips and switch a single main player. The model/task/scene/version identity also controls the displayed execution facts. A model change preserves the chosen task and resets the selected scene; a task change resets the scene and player.

Other models display five empty scene cards and a blank player, without borrowed historical footage, invented episode facts or missing-data notes. Their saved leaderboard scores remain available independently. Historical media files and their existing API remain unchanged, but the current gallery does not reference them. No scorer, exporter, model call, simulation or media copy is required for this display revision.

The five-rollout revision passes 29 focused adapter/component/media tests, seven built-server checks, TypeScript, lint and the production build. Browser checks at 1280 and 390 pixels cover the five selectable Cover Blocks scenes (including 100007 and 100012), task/model resets, blank MiMo/GLM players, readable cards, and removal of Peak Progress/Kimi. The empty player's width is explicitly constrained to prevent its minimum height and aspect ratio from widening the mobile page. No formal score JSON changed.

## Selected-episode VQA

The block below the main player shows the selected episode's saved VQA, Perception, Understanding and Reasoning scores, plus applicable capability scores. These values come directly from `episode.scores`; they are distinct from the leaderboard's task-level means. No aggregate or question score is recomputed for this feature.

`app/data/generated/t1-benchmark-vqa.json` contains seventy exact episode records, 390 initial question rows (382 first answers and eight eligibility exclusions), and 207 fixed process checkpoints (eight answered and 199 normally unreached). The separate exporter copies exact public prompts, visible first final answers and frozen initial-v2/process grades. Initial scores never come from superseded `initial/graded.json`. The original formal score bundle and raw artifacts are unchanged.

`/api/t1-benchmark-vqa/[id]` lazily returns a single allowlisted record. Its metadata must agree with model, task, layout, final attempt and result version in the formal episode. Invalid IDs return 404; a stale or inconsistent bundle fails closed without private diagnostics. Client selection changes unmount the previous evidence, abort pending requests and reject mismatched responses.

Initial questions expand to the exact question, first answer and saved grade. An excluded question retains a null answer and score. Answered process checkpoints show both Task Tracking and Next Action scores, with the native trigger step and first returned context step kept separate. Unreached checkpoints show their saved zero and state, with no invented question or response. Text is escaped, never rendered as HTML; long prompts and answers support keyboard scrolling.

The display source is frozen at SHA-256 `0db6329871e2adc45de7dc75c867405d71a78f17a1a9e070a1e16a6b17865b44`. `npm run export:t1-benchmark-vqa` projects it; `npm run check:t1-benchmark-vqa` verifies the public sidecar deterministically. Both reuse `T1_BENCHMARK_SOURCE_ROOT`, now with `vqa-details.json` alongside the original initial/execution/process snapshots. The public sidecar is server-only and is not imported into the client bundle.

On 5403, the existing managed publication gained only `source/vqa-details.json` and a separate `vqa-details-publication-receipt.json`; the original publication receipt and seventy clips remain untouched. The source is 571,321 bytes; the public projection is 385,803 bytes. Original formal score JSON hashes are unchanged.

This feature passes 52 focused source/API/component/identity/media tests, eight built-server checks, the pinned sidecar reproduction check, TypeScript, lint (the same four unrelated image warnings), build and repository hygiene. Browser verification covers 1280/390-pixel layouts, actual initial and process answers, rapid scene changes, empty-model removal, excluded initial nulls, and the insert-key trigger158/context192 checkpoint. No model, scorer or simulation was run.

## Scores and hierarchy

All scores are on a 0–100 scale. Preserve the formal initial report's question → registered subgroup → dimension → task hierarchy for A, B, and C1. Some subgroups apply to a subset of tasks; their diagnostic columns average only those applicable tasks.

Process metrics average all fixed slots inside each scene, then five scenes inside each task, then fourteen tasks. The 207 selected slots include 199 normally unreached slots with protocol-defined zero and eight verified first responses. The eight-question conditional accuracy is not a leaderboard score.

```
C       = (C1 + C2 + C3) / 3
VQA     = (A + B + C) / 3
Overall = 0.70 × Subtask + 0.30 × VQA
```

The public bundle records Overall 18.8803313026, VQA 60.1011043421, Subtask 1.2142857143, and Success 0. It includes the safe source digests, scoring protocol, capture/scorer implementation digests, and exact episode/media identities.

## Source and playback boundaries

`scripts/t1-benchmark-result-registry.mjs` freezes scope, question registration, eligibility and four source digests. `scripts/export-t1-benchmark-results.mjs` validates the formal initial-v2 summary against question scores, the entire original 237-slot matrix before selecting the approved 207 slots, verified capture, exact final attempts, and the media catalog. Nonapplicable subgroups stay null. Only admitted normal failures use the original report's zero-progress fallback; missing/infrastructure episodes are rejected.

The browser imports summary scores from `app/data/generated/t1-benchmark-results.json` through its typed adapter. At the user’s request, the selected-episode VQA API additionally returns public questions and the model’s visible first final answers from a separate validated sidecar. Private filesystem paths, hidden reasoning, full histories, requests, credentials and gold references remain excluded. The UI derives task scene positions from the current admitted task scope and retrieves clips/facts only through exact selected-model episode joins. It resets dependent state when the parent selection changes. Historical results do not enter the new ranking.

`/api/t1-benchmark-media/[id]` accepts stable allowlisted IDs and supports HEAD, Range, ETag and If-Range. The Vite host middleware calls the same route during local development because its worker cannot read host files directly. Published clips contain only native three-view sensor footage, never debug reasoning.

## Assets and commands

Local private source snapshots are in `.local/t1-benchmark/source/`. Local video files are in `.local/t1-benchmark/media/`: 70 MP4s, 206,771,259 bytes. Both directories are ignored by Git. Source `selection.json` and media publication receipts preserve exact attempt joins for internal review.

The prepared 5403 publication root is:

```
/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-robodojo14-deepseek-20261021-v1
```

Its `source/` and `media/` subdirectories are operator inputs. Storage is classified as evaluation publication evidence and validated with the host's layout guard before writing. No runtime environment or managed service is changed by asset preparation.

```bash
npm ci
npm run check:t1-benchmark
npm run test:t1
npm run typecheck
npm run lint
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3217
```

For mounted publication inputs, set `T1_BENCHMARK_SOURCE_ROOT` to its `source/` directory and `T1_BENCHMARK_MEDIA_ROOT` to its `media/` directory. Source selection remains constrained by the immutable SHA pins. `npm run publish:t1-benchmark-media -- --manifest PRIVATE.json --selection SELECTION.json --dry-run` validates the private exact-attempt copy plan before publication. Omit `--dry-run` to copy and verify the clips; existing files are verified rather than replaced. Do not commit videos or private snapshots.

## Verification

Validation used macOS with Node 25.8.1 and the existing npm lockfile. TypeScript, ESLint, the production build, 49 T1 unit/contract/component/media tests, and seven relevant built-server tests pass. The lint run retains four existing image-element warnings in unrelated components.

The broad unit suite reports 143 passed and 19 environment-dependent failures: Linux supervisor/publisher tests require `flock` and a Bash with `mapfile`; three L1 evidence tests and one Pi0.5 media test require external deployment assets absent on this Mac. Those tests and their underlying modules are unchanged. Full logs are retained in ignored `.local/t1-benchmark/`.

Actual HTTP checks verify all 70 media HEAD responses, SHA ETags and byte counts, plus Range playback. Browser checks cover the displayed formula, metric navigation, Escape/focus restoration, task-specific scene choices, scene reset across tasks, real video decoding and complete playback, T1/T2 navigation, and desktop/mobile layouts at 1280 and 390 pixels. A scoped CSS reset prevents the global fixed-height `header` rule from clipping mobile selectors.

Development is isolated on `codex/dashboard-deepseek` in `/Users/hua/roboexam-dashboard-deepseek`, based on canonical 5403 main `5768b5ed`. The preview was validated before release. Production deployment uses the repository's managed release workflow after explicit authorization.


## Production release preparation

The user authorized main integration and production deployment on 2026-10-21. The managed service runs in a separate container from the 5403 development host, while canonical source, runtime configuration, immutable media and release markers share the same GPFS volume. The active production watchdog runs `deploy-if-needed.sh` and the merged `update.sh` when clean shared main advances; do not launch a duplicate service from 5403.

The shared `runtime/dashboard/dashboard.env` now declares the publication's `T1_BENCHMARK_SOURCE_ROOT` and `T1_BENCHMARK_MEDIA_ROOT`. Its original bytes are preserved in a mode-0600 release-job backup; the change receipt contains only hashes and the two non-secret added paths. Source snapshots and media are already staged in the managed evaluation publication.

A pre-existing Funnel gate expected only `|-- / proxy TARGET`. The current multi-path rendering can declare `/` on the root URL followed by `|-- proxy TARGET`. `ops/4090/check-funnel-mapping.mjs` now verifies both layouts by binding the exact root URL block to the exact target. The health and recovery scripts share this read-only predicate; other paths such as `/official-review` are preserved and cannot satisfy the root check. Node-online and actual HTML/client-asset checks remain required.

Release evidence is recorded under `/mnt/gyc_ckp/benchmark2027/runtime/jobs/roboexam-t1-release-20261021-af481e5e/`; full Linux prebuild checks run in the isolated `/mnt/gyc/benchmark2027/worktrees/roboexam-t1-release-20261021` checkout before main advances. Final acceptance requires matching source/deployed/live markers, a successful production watchdog cycle, and actual public-page, VQA and media checks.

The release check for the frozen Pi0.5 publication uses the existing managed trace Python (3.10.12) when available. The ambient 3.12.8 interpreter produces two last-bit summation differences despite identical pinned reports and display strings. Selecting the managed interpreter reproduces the original publication exactly; frozen Pi0.5 scores, samples, media and source pins are unchanged.

The pre-existing Review publication referenced 15 build-tower videos at mutable staging paths that were replaced by later captures. The exact original bytes were recovered from the retained pre-refresh archive into the existing content-addressed review cache. A location-only inventory under `experiments/audits/dashboard_pipeline_review_20261017/path_recovery_20261021` retains the original logical snapshot ID and changes only 45 video/manifest/QC location fields. The registered inventory SHA is `31d25f65c9e05738f8f2e20cf15728062596b7cdadb45085061acd49ca2e013c`. All candidate identities, qualifications, admission, scores, expected media hashes and byte sizes remain unchanged. The original snapshot, later captures and backup archive are preserved. The location-migration receipt is retained beside the repaired inventory; no material directories were deleted or moved.
