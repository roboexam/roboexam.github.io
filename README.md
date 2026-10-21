# RoboExam dashboard

Public research dashboard for a planned CVPR 2027 Workshop benchmark. It presents four independent track tables, metric definitions, dataset cohorts, published baselines, and linked evidence for VLM, ACWM, VLA, and WAM systems.

## Requirements

- Node.js `>=22.13.0`
- npm with the committed `package-lock.json`

Start a local preview:

```bash
export PATH=/usr/local/node-v22/bin:/usr/local/bin:$PATH
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Use `--hostname` (the vinext CLI does not recognize `--host`).

Forward port `3000` from VS Code's **Ports** panel and open the forwarded address. The dashboard opens directly; no login or `AUTH_*` environment variables are required. `/login` redirects to `/`, and `POST /api/login` is intentionally disabled.

## Track structure

- **T1 Embodied Agency** — diverse VLM agents run through one harness for grounding, task-state tracking, planning, and structured next-action output.
- **T2 Physical Foresight** — the 18 ACWM report items covering video fidelity, action following, physical response, and intervention outcomes.
- **T3 Simulation Deployment** — policy correctness, local closed-loop effectiveness, long-horizon execution, robustness, safety, and efficiency.
- **T4 Real-World Deployment** — hardware task outcome, subgoal progress, timing, and manual safety/intervention review.

**Leaderboards** opens on all report entries. Every metric opens its full definition, scoring rule, interpretation, and evidence; there is no separate Metric guide page. Filter by dimension or search; **More filters** adds subdimension, required evidence, protocol status, and model family or result availability.

The current T1 publication uses `Overall = 0.70 × Subtask + 0.30 × VQA`, with
`VQA = (A + B + (C1 + C2 + C3) / 3) / 3`. Its frozen common scope is fourteen
tasks, seventy scenes and 207 process slots. The generated adapter, metric
dialogs and exact model/task/scene rollout viewer share this publication.
See [T1 publication and verification](docs/T1_BENCHMARK_PUBLICATION.md).

The other regime-based score tables use a strict five-regime Overall:
`0.2 × ID + 0.2 × Visual OOD + 0.2 × Semantic OOD + 0.2 × Behavioral OOD + 0.2 × Recovery`.
Its inputs are exporter-admitted 0–100 setting scores after per-track
normalization and dimension macro averaging, never raw heterogeneous metrics.
All five settings must cover every selected unique scene; otherwise Overall
stays `—` and the model is not ranked.

**Datasets** opens on **Task trajectories**: collection overview, admission counts, task/tag filters, and a five-regime ID / Visual OOD / Semantic OOD / Behavioral OOD / Recovery rail. Each episode keeps its three synchronized camera views; source-bound joint and end-effector traces replay on the same video clock when telemetry is published. OOD validation state stays attached to each episode rather than appearing in a separate browser.

T1's current publication is separate from **Previous protocols**. T2 keeps **Current plan** separate from **Historical runs**: the September VLM / ACWM designs cannot inherit older scores just because metric names match. Missing values stay blank; original measured zeros stay zero. T4 plans only outcomes and diagnostics observable through video or manual review.

Editorial contracts live in `app/data/metric-plan.ts` and `metric-definitions.ts`; `metric-facets.ts` organizes navigation, and `scenario-plan.ts` records proposal tags separately from generated catalogs. `track-results.ts` binds cells to track, model, and result version. Fonts are served locally.

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:render
```

Use the exporter scripts under `scripts/` to publish formal result bundles. Generated bundles retain model, task, split, metric, scorer, and source-hash provenance.

## Local video files

Indexes are included in the checkout; the original MP4 collections are external. Set these server-side paths before starting the preview when the media is mounted somewhere other than the original deployment:

- `UNIBENCH_CURATED_ROOT`: the `curated_simulation_data` directory.
- `UNIBENCH_OOD_STAGING_ROOT`: the `robodojo_data_generation` staging directory.
- `DASHBOARD_EPISODE_MEDIA_ROOT`: the published model-episode `media` directory (defaults to `public/episode-media`).
- `T1_BENCHMARK_MEDIA_ROOT`: the current T1 release's native sensor MP4 directory (defaults to `.local/t1-benchmark/media`).

`T1_BENCHMARK_SOURCE_ROOT` selects the four SHA-pinned source snapshots for
`npm run export:t1-benchmark` and `npm run check:t1-benchmark`; its local default
is `.local/t1-benchmark/source`. These operator paths never enter client requests.

Keep the original relative paths and files. The curated/OOD allowlists, byte counts, and path checks still apply. An unavailable video does not remove its episode record or imply an empty dataset.
