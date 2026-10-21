# Selected episode VQA implementation plan

**Goal:** Show exact saved VQA results and expandable first-answer evidence beneath each selected rollout.

**Architecture:** A pinned display-only exporter creates a safe VQA sidecar without changing formal scores. A lazy per-episode API and a keyed client component join evidence by result version/model/task/scene/final attempt. Existing episode scores populate the overview.

**Tech Stack:** React 19, TypeScript, existing vinext/Vite runtime, Node tests.

**Constraints:** No model/scorer/simulation calls; no score recalculation; preserve original and formal result artifacts; expose only public questions and first final answers; keep other models empty; no deployment.

- [x] Project source prompts/first answers and saved grades into `app/data/generated/t1-benchmark-vqa.json` with exact source pins, identity validation, privacy checks and source/exporter tests.
- [x] Add typed VQA records, a static-server allowlist and a per-episode GET route with API tests.
- [x] Add selected-episode overview, capability scores, lazy evidence loading and expandable initial/process questions beneath the main player; reset selection and abort stale requests.
- [x] Verify score/null/status semantics, escaped text and scene/model/attempt mismatches with component tests and built-route checks.
- [x] Update documentation, run typecheck/lint/build/relevant tests and desktop/mobile browser QA.
- [x] Review, commit, sync feature branch to 5403 and deliver preview.

## Changed paths and execution record

Dashboard root: `/Users/hua/roboexam-dashboard-deepseek/third_party/dashboard`.

Modified files relative to that root:
- `README.md`
- `app/components/t1/metric-presentation.ts`
- `app/components/t1/t1-benchmark-view.tsx`
- `app/t1-benchmark.css`
- `docs/T1_BENCHMARK_PUBLICATION.md`
- `package.json` (scripts only; no dependencies or lockfile changes)
- `tests/rendered-html.test.mjs`
- `tests/t1-benchmark-components.test.mjs`

Created files:
- `app/api/t1-benchmark-vqa/[id]/route.ts`
- `app/components/t1/t1-benchmark-episode-vqa.tsx`
- `app/data/generated/t1-benchmark-vqa.json`
- `app/data/t1-benchmark-vqa.server.ts`
- `app/data/t1-benchmark-vqa.ts`
- `scripts/export-t1-benchmark-vqa.mjs`
- `scripts/t1-benchmark-vqa-registry.mjs`
- `tests/t1-benchmark-vqa.test.mjs`
- `tests/t1-benchmark-vqa-api.test.mjs`
- `docs/superpowers/plans/2026-10-21-t1-episode-vqa.md`
- `docs/superpowers/specs/2026-10-21-t1-episode-vqa-design.md`

Ignored local evidence and build log: `.local/t1-benchmark/source/vqa-details.json`, `.local/t1-benchmark/remote-vqa-publication-receipt.json`, `.local/t1-benchmark/episode-vqa-build.log`. Review screenshot: `/Users/hua/Documents/ChatGPT/harness/outputs/roboexam-t1-episode-vqa-preview.png`.

Remote 5403 additive files (each validated as evaluation_run with layout_guard before creation):
- `/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-robodojo14-deepseek-20261021-v1/source/vqa-details.json` (571,321 bytes; SHA-256 `0db6329871e2adc45de7dc75c867405d71a78f17a1a9e070a1e16a6b17865b44`)
- `/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-robodojo14-deepseek-20261021-v1/vqa-details-publication-receipt.json` (865 bytes; SHA-256 `7214cc530dd93f337bf5516a3b24291932da4ae65a7d3e8539250b4782609f14`)

Environment: local macOS/Node 25.8.1/existing npm dependencies; remote system Python 3.10.12 for read-only capture and guarded copy, no ML environment or package installation. No new videos or large outputs; all seventy original clips and prior receipts are unchanged. Temporary local capture script was cleaned up, no remote cleanup was needed. The existing formal leaderboard JSONs are unchanged. No model/scorer/simulation was run. The feature branch is synchronized to 5403; shared main/services are untouched and not deployed.

Validation: 52 relevant tests, eight built-server checks, pinned display-exporter `--check`, TypeScript, lint, production build, repository hygiene and diff checks pass. Browser QA covers desktop/mobile, actual first-answer expansion, rapid selection/reset, null/zero semantics and the158→192 checkpoint. The local preview server was restarted to load the new static payload; no remote process was restarted.
