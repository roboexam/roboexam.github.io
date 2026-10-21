# Track 1 benchmark publication

The current release is `t1-robodojo14-deepseek-20261021-v1`, using the user-approved common scope of 14 tasks, 70 scenes, and 207 process slots. Original native16 evidence and the previous Stack Bowls publication are unchanged.

## Model restoration and public metric names

The current table has seven rows: DeepSeek Flash, MiMo v2.6 Pro, Kimi K3, GPT-6 Astra, GLM 5.3 Flash, MiniMax H3.1 Preview and Cosmos3-Nano. The old DeepSeek row is excluded at the user's request. `app/data/t1-leaderboard-results.ts` is a presentation adapter over the two existing frozen bundles and the existing model catalog; it never grades or aggregates scores.

MiMo, Kimi and GPT-6 Astra retain their exact saved Initial VQA and capability values. The saved maximum progress appears separately as Peak Progress. Overall, mean Subtask, Success and process metrics remain empty where no corresponding aggregate was saved. The original five-scene scope and initial-only formula are used in those rows' metric dialogs. GLM, MiniMax and Cosmos retain their names with empty current-protocol cells; unrelated historical metrics stay in the existing historical view.

The main capability headings are Recognition, Localization, Relations, Goals, Constraints, Interaction, Planning, Task Tracking and Next Action. Each has a short explanation, and formulas display capability names instead of internal A/B/C codes. Internal IDs and both formal result JSON files remain unchanged.

Fifteen original MiMo/Kimi/Astra video records retain their model, attempt, scene and result version. Local copies occupy 22,315,560 bytes in ignored `.local/t1-stack-bowls/media/`; set `DASHBOARD_T1_MEDIA_ROOT` to that directory for local playback. Kimi's one-frame recordings are presented as saved observations. The existing production media route and publication root are unchanged.

This revision passes 26 focused display/identity/media tests, seven built-server checks, TypeScript, lint and the production build. Browser verification covers the seven rows, legacy VQA formula and five-scene scope, all four recorded models' selections, reset to DeepSeek's own tasks, readable metric explanations on desktop/mobile, and 15 real legacy media HEAD/ETag/size checks. No scoring exporter or model was run for this revision.

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

The browser imports only `app/data/generated/t1-benchmark-results.json` through its typed adapter. It receives no private filesystem paths, raw answers, histories or gold references. The UI derives task/scene choices from actual model episodes and resets dependent state when the parent selection changes. Historical results do not enter the new ranking.

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

Development is isolated on `codex/dashboard-deepseek` in `/Users/hua/roboexam-dashboard-deepseek`, based on canonical 5403 main `5768b5ed`. This delivery is a preview; shared main and the deployed service are unchanged. Deployment uses the repository's managed release workflow after explicit release authorization.
