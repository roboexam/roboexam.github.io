# Track 1 DeepSeek Dashboard Implementation Plan

> **For agentic workers:** Execute the following owned tasks in the existing isolated worktree, review each result, and verify the integrated page before delivery.

**Goal:** Publish the approved DeepSeek scores with inspectable calculations and exact saved rollout playback.

**Architecture:** A source-validated versioned export feeds a typed adapter and independent Track 1 components. An allowlisted range API serves external MP4s. Existing historical bundles and all other tracks remain separate.

**Tech Stack:** React 19, TypeScript, vinext/Vite, Node, existing dashboard CSS and media helpers.

## Global Constraints

- Scope: 14 tasks, 70 scenes, 207 process slots.
- Result version: `t1-robodojo14-deepseek-20261021-v1`.
- Formula: `overall = 0.7 * subtask + 0.3 * ((a + b + (c1 + c2 + c3) / 3) / 3)`.
- No model calls, simulations, changes to formal evidence, Git videos, frontend score literals, or missing-data footnotes.
- Worktree: `/Users/hua/roboexam-dashboard-deepseek`; do not build or modify shared main.

### Task 1: Formal publication adapter and exporter

Files: `scripts/t1-benchmark-*.mjs`, `scripts/export-t1-benchmark-results.mjs`, `app/data/t1-benchmark-results.ts`, `app/data/generated/t1-benchmark-results.json`, `tests/t1-benchmark-results.test.mjs`.

- [x] Pin and validate selected initial/process/execution source bytes and exact model/task/scene IDs.
- [x] Reaggregate formal values into 0–100 scores using the approved hierarchy; reject incomplete evidence, duplicate identities, nonfinite values, and aggregate disagreement.
- [x] Export only public fields with SHA provenance and stable media URLs; verify regeneration with `--check`.
- [x] Run `node --experimental-strip-types --test tests/t1-benchmark-results.test.mjs`.

### Task 2: Exact media publication and service

Files: `app/data/t1-benchmark-media.server.ts`, `app/api/t1-benchmark-media/[id]/route.ts`, `scripts/publish-t1-benchmark-media.mjs`, `tests/t1-benchmark-media.test.mjs`.

- [x] Copy only the selected 70 native sensor clips into ignored local media storage; verify copied hashes against the exact attempt manifests.
- [x] Reuse `serveT1Media(request, id, catalog, root, headOnly)` with the new catalog and `T1_BENCHMARK_MEDIA_ROOT` override.
- [x] Test Range, HEAD, ETag, unsafe/unknown IDs, missing files, and catalog isolation.

### Task 3: Leaderboard, metric details, and rollout UI

Files: `app/components/t1/t1-benchmark-*.tsx`, `app/t1-benchmark.css`.

- [x] Render the requested score-column order and real capability columns from the adapter.
- [x] Open native metric dialogs from headers and values, reading definitions and aggregation from the same bundle.
- [x] Add model/task/scene controls and key playback by the full episode identity; show saved execution facts.
- [x] Keep the layout responsive and keyboard accessible, using the existing visual style.

### Task 4: Integration and verification

Files: `app/components/leaderboard-view.tsx`, `app/layout.tsx`, `.gitignore`, `package.json`, `tests/rendered-html.test.mjs`, new component tests, and release notes.

- [x] Route current T1 to `T1BenchmarkView`, import its stylesheet, and ignore `.local/`.
- [x] Add export/check/media/test npm commands without changing dependencies or the lockfile.
- [x] Update the built-route test to assert the new publication and absence of the historical model mix.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:t1`, and the relevant rendered-route tests.
- [x] Verify desktop/mobile table, formulas, player playback and scene switching, and actual navigation to another track and back.
- [x] Review the complete diff, commit only owned files, and hand over the preview and data/media setup commands.
