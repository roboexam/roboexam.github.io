# EmbodiVSI · RoboExam public site

Public one-page research site for EmbodiVSI and the RoboExam evaluation program.
The homepage presents the workshop program, organizers, invited speakers,
representative simulation and real-robot scenes, and a compact leaderboard
format preview. Its rows are illustrative placeholders rather than published
results. There is no standalone public leaderboards route.

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

The homepage leaderboard is intentionally illustrative. Detailed metric and
evidence components remain internal implementation assets and are not published
as a separate page.

The current T1 publication uses `Overall = 0.70 × Subtask + 0.30 × VQA`, with
`VQA = (A + B + (C1 + C2 + C3) / 3) / 3`. Its frozen common scope is fourteen
tasks, seventy scenes and 207 process slots. The generated adapter, metric
dialogs and exact model/task/scene rollout viewer share this publication.
See [T1 publication and verification](docs/T1_BENCHMARK_PUBLICATION.md).

The T1 table also retains MiMo and GPT-6 Astra's saved Stack Bowls scores,
plus the existing GLM, MiniMax and Cosmos model names. DeepSeek is represented
by its new release. A read-only display adapter copies existing values and keeps
unrecorded columns empty; metric dialogs retain each row's original scope and
formula. Capability headings use plain names such as Recognition, Planning,
Task Tracking and Next Action. Peak Progress and Kimi K3 are excluded from the current table.
The rollout gallery offers five task-specific scene positions for every model,
with one selected video in the main player. DeepSeek uses its seventy published
recordings; the other models retain empty trajectory positions for their future releases.
Below each selected recording, **VQA results** shows that episode’s saved total
and capability scores. Expand initial questions or process checkpoints to see
the exact public question, the model’s first answer and its saved score.

The other regime-based score tables use a strict five-regime Overall:
`0.2 × ID + 0.2 × Visual OOD + 0.2 × Semantic OOD + 0.2 × Behavioral OOD + 0.2 × Recovery`.
Its inputs are exporter-admitted 0–100 setting scores after per-track
normalization and dimension macro averaging, never raw heterogeneous metrics.
All five settings must cover every selected unique scene; otherwise Overall
stays `—` and the model is not ranked.

**Datasets** (`/datasets`, also available from the homepage) uses one source selector for simulation, real-robot / ego recordings, and the coverage plan. **Review** (`/review`) shares the live simulation raw catalog and its opaque episode/media/trace IDs. Simulation and allowlisted LeRobot episodes synchronize camera playback with source-bound action/state traces when recorded; missing telemetry stays unavailable rather than being synthesized. Links between Datasets and Review preserve the selected simulation task, folder, and episode. Review adds browser-local human notes.

The current physical raw root is `/mnt/public_ckp/UniEmbodied-Bench/raw`, a sibling of `simulation`, **not** `simulation/raw` (which is absent on this mount). `simulation/scence` and `simulation/dataset` contain processed scene/purpose datasets and are not substituted for raw captures. Set `DASHBOARD_RAW_ROOT` on the host if the raw collection moves. Simulation browsing uses `/api/raw-review`; Real & Ego uses the allowlisted `/api/real-datasets`, media, and trace routes. Catalog scans are cached for 30 seconds and coalesced across concurrent requests. The browser checks every 30 seconds after the previous request completes, refreshes on focus/visibility, and the Refresh button explicitly requests a fresh scan. Task and episode requests follow a completed catalog response. Added/removed folders and episodes update without a build or exporter run; changed media and metadata are revalidated when the selected episode refreshes. Counts represent directory records, not deduplicated or admitted trajectories. Mount/scan failures are explicit and hide playback until recovery.

The reader must run on a Node host with the raw mount and approved symlink targets available; the existing Vite host bridge supports local development. A standalone Cloudflare deployment cannot scan host `/mnt` directories. Requests accept stable IDs, never filesystem paths; the configured root and existing approved source roots bound symlink resolution. No raw files are modified.

T1 shows its current publication only; archived protocol bundles remain provenance and are not linked from the leaderboard. T2 keeps **Current plan** separate from **Historical runs**: the September ACWM design cannot inherit older scores just because metric names match. Missing values stay blank; original measured zeros stay zero. T4 plans only outcomes and diagnostics observable through video or manual review.

Editorial contracts live in `app/data/metric-plan.ts` and `metric-definitions.ts`; `metric-facets.ts` organizes navigation, and `scenario-plan.ts` records proposal tags separately from generated catalogs. `track-results.ts` binds cells to track, model, and result version. Fonts are served locally.

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:render
```

`npm run test:raw-browser` checks a built local preview (`RAW_TEST_URL`, default
`http://127.0.0.1:3327`) using Playwright (`PLAYWRIGHT_MODULE` and optional
`CHROMIUM_EXECUTABLE`). It checks actual raw video playback, cross-page identity,
desktop/mobile layouts and directory updates using disposable fixtures under
the system temporary directory. It does not modify public datasets.

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
