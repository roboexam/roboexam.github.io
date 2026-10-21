# T1 five-rollout gallery implementation plan

**Goal:** Remove Peak Progress and Kimi K3, and display five selectable rollout scenes for every model/task, with current DeepSeek videos and empty positions for other models.

**Architecture:** Keep the frozen scoring bundles unchanged. A presentation adapter controls visible models/metrics/episodes. The view derives task-specific scene slots and renders a five-card selector plus a keyed main player.

**Tech Stack:** React 19, TypeScript, vinext/Vite, existing Node tests and browser preview.

**Constraints:** No score/exporter/model calls; preserve all remaining saved scores and source JSON; no fabricated empty-model facts; no production deployment.

- [x] Update `app/data/t1-leaderboard-results.ts` and its tests: remove Kimi/peak, preserve scores, only current DeepSeek episode publication and fourteen tasks.
- [x] Update `t1-benchmark-view.tsx`, `t1-benchmark-viewer.tsx` and `app/t1-benchmark.css`: all-model/task selectors, per-task five-scene gallery, blank positions, exact selected player/facts and responsive controls.
- [x] Update focused component/server tests for task-dependent scene IDs, absent model evidence and selection resets.
- [x] Refresh README/publication notes, run focused tests/typecheck/lint/build and desktop/mobile browser checks.
- [x] Review owned changes, commit, sync feature branch to 5403, and deliver preview.

## Changed paths and verification

Dashboard root: `/Users/hua/roboexam-dashboard-deepseek/third_party/dashboard`.

Modified paths relative to that root:
- `README.md`
- `app/components/t1/metric-presentation.ts`
- `app/components/t1/t1-benchmark-view.tsx`
- `app/components/t1/t1-benchmark-viewer.tsx`
- `app/data/t1-leaderboard-results.ts`
- `app/t1-benchmark.css`
- `docs/T1_BENCHMARK_PUBLICATION.md`
- `tests/rendered-html.test.mjs`
- `tests/t1-benchmark-components.test.mjs`
- `tests/t1-leaderboard-results.test.mjs`

Created documentation:
- `docs/superpowers/specs/2026-10-21-t1-five-rollout-gallery-design.md`
- `docs/superpowers/plans/2026-10-21-t1-five-rollout-gallery.md`

Environment: local macOS, Node 25.8.1, existing npm lockfile/dependencies. The 29 focused tests, seven built-server checks, typecheck, lint (four pre-existing unrelated image warnings), build, repository hygiene and diff checks pass. Browser verification covers 1280/390 pixel layouts, all five Cover Blocks clips, model/task resets, and blank other-model cards. Source JSON is unchanged. No new media or large outputs were generated, no cleanup was performed or required, and no model/scorer/exporter was invoked. The feature branch is synchronized to the 5403 repository; shared main and services are unchanged.
