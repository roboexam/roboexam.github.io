# Track 1 Results Publication Implementation Plan

> For agentic workers: use subagent-driven implementation with separate file ownership and independent review. The named superpowers execution subskills are not installed in this session; use the provided collaboration tools for the same task/review boundaries.

**Goal:** Publish the current four-model Stack Bowls VQA results and exact execution videos under Track 1.

**Architecture:** Immutable source packet -> allowlisted exporter -> generated public JSON -> typed adapter -> Track1 results and viewer. Media uses a separate allowlisted streaming route. Root performs release integration after disjoint worker changes and review.

**Tech Stack:** Existing React 19, TypeScript, Node 22, vinext/Vite, npm lockfile; Python 3 for one-time source packet preparation.

## Global Constraints

- Follow the approved spec 2026-10-18-t1-current-results-design.md in the neighboring specs directory.
- Worktree /bh/zbh_self/projects/roboexam-t1-vlm-results-20261018, branch codex/t1-vlm-results-20261018, based on actual local main@8137a0f2.
- Read-only original episodes, truth, first answers, source grades and seals. Zero API/model/simulation calls.
- Only Track1 product behavior changes. Existing other tracks' data and five-regime Overall contract stay intact.
- No source values manually embedded in UI; only validated generated data. Public bundle has no absolute paths or secrets.
- All scores use 0-100; missing C2/C3 and unknown terminal outcomes stay null. Kimi normal answers remain 22/25.
- New website is the current release with minimal labeling; scoring limitations live in Details.

## Task 1: Immutable source packet and media

Files: scripts/build-t1-publication.py; external source publication root named in spec.
Consumes: the frozen 20 selected source bindings, latest initial report, original native outcomes and selected MP4 hashes.
Produces: publication-manifest.json, copied source metadata and exact 20 media objects.

- [ ] Validate destination with `/usr/bin/python3 /mnt/gyc/benchmark2027/scripts/storage/layout_guard.py validate evaluation_run /mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-stack-bowls-20261018-v1` before writing.
- [ ] Build from exact initial/execution sources, verifying sealed source hashes and video bytes before copying; write only new files.
- [ ] Verify 20 unique model/layout records; 16 moving execution records and 4 initial/static records are distinct; 97/100 normal initial answers.
- [ ] Publish a private source manifest with source references and normalized execution metadata; send its exact SHA to exporter worker. Do not publish contexts/truth/credentials.

## Task 2: Validated public results bundle

Files: scripts/t1-agent-result-registry.mjs; scripts/export-t1-agent-results.mjs; app/data/generated/t1-agent-results.json; app/data/t1-agent-results.ts; tests/t1-agent-results.test.mjs.
Consumes: Task1 immutable publication manifest and source metadata, frozen report SHA from spec.
Produces: t1AgentResults with the exact TypeScript interfaces and IDs defined in spec.

- [ ] Add representative contract tests: normal manifest succeeds; duplicate layout, wrong source SHA, missing/unsafe video, wrong aggregate, nonfinite score and null substitution fail.
- [ ] Implement a deterministic exporter with `--check` that rebuilds in memory and compares generated JSON bytes; regular export writes only its single named generated bundle.
- [ ] Preserve report model summaries, derive only A1 from its two question means, and bind per-layout scores by model/layout/question ID. Scale 0-1 scores to 0-100 exactly once.
- [ ] Assert known golden outcomes: DeepSeek composite30, MiMo29.444444444444443, Kimi19.444444444444443 with22/25, GPT48.333333333333336; use tolerance1e-9 for binary float differences.
- [ ] Run `node --experimental-strip-types --test tests/t1-agent-results.test.mjs` and `node scripts/export-t1-agent-results.mjs --check`; both exit0.

## Task 3: Track1 table and episode viewer

Files: app/components/t1/; app/t1-results.css; app/components/leaderboard-view.tsx; app/layout.tsx if needed.
Consumes: `import { t1AgentResults, type T1Episode } from '../../data/t1-agent-results'` in Track1 components.
Produces: current Track1 landing table and selected episode viewer, retaining a secondary previous-protocol entry.

- [ ] Render four model rows from the adapter; heading Stack Bowls and 5 layouts. Initial VQA column uses scores.composite, never global Overall. C2/C3 render em dash.
- [ ] Implement accessible model/layout selects and remount the video by exact episode ID; selected details come from that episode only. Render null outcomes without inferred success/failure, and static video records as Initial view.
- [ ] Put scorer source, formulas/units and C1 interpretation in a compact Details disclosure. No Pilot/Provisional banners or repeated labels on current results.
- [ ] Change only the Track1 branch of existing leaderboard rendering. Preserve legacy metric handling under Previous protocols; keep other tracks' existing behavior and data imports.
- [ ] Verify TypeScript and lint; root will test real browser interactions and cross-track regression.

## Task 4: Secure media delivery and package gates

Files: app/api/t1-media/[id]/route.ts; package.json; targeted media tests; docs implementation notes.
Consumes: public episode.video.id -> exact file mapping under server-only media root.
Produces: GET/HEAD video playback with correct byte ranges and deployment-readable media paths.

- [ ] Follow existing episode-media route's containment and Range implementation, add allowlisted Track1 lookup, and reject arbitrary user paths.
- [ ] Test GET200, HEAD, Range206, invalid range416, unknown ID404, physical size mismatch, and traversal rejection using small temporary fixtures; never decode all frozen videos.
- [ ] Add export:t1 and freshness/data test gates without weakening existing exporters. Add external media integrity checks based on current catalog/hashes; changed objects receive real byte hashes.
- [ ] Run npm ci using /bh/zbh_self/cache/npm, then npm run typecheck, lint, test, build, test:render from the isolated dashboard. Record unrelated existing failures separately.

## Task 5: Review and publish

- [ ] Independent review checks source identities, exact twenty media joins, no public server paths/secrets, table totals, nulls, C1 interpretation in details, and Track2/3/4 isolation.
- [ ] Browser verifies default Track1, four models and five layouts, video playback/seek, static Kimi states, previous protocols, other-track navigation and a narrow viewport.
- [ ] Review git diff and exact staged paths, commit focused changes. Recheck main/worktrees before merging; never overwrite another contributor's files.
- [ ] Merge validated branch into clean shared main; use the existing managed 4090 update/status/fixed-public-status/watchdog workflow. Do not build the live checkout directly.
- [ ] Verify fixed public URL, client assets, Track1 results and streaming media; report exact release commits, website URL, paths/environment and any remaining limitation.
