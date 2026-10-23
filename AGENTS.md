# UniEmbodied-Bench Dashboard Agent Rules

## Scope and current architecture

- These rules apply to this repository. The parent `/mnt/gyc/benchmark2027/AGENTS.md` also applies and remains authoritative for shared storage, experiment artifacts, process ownership, deletion, and cleanup.
- This is a read-only benchmark dashboard built with React 19, TypeScript, vinext/Vite, and a Cloudflare-compatible worker. Preserve the existing package manager, lockfile, and runtime shape.
- The shared checkout `/mnt/gyc/benchmark2027/roboexam` is the `main` source; this dashboard is deployed from its `third_party/dashboard` subtree. Per the user's 2026-10-23 direction, make routine website changes directly on `main`. Keep separate branches for explicitly requested track experiments; do not automatically create `codex/*` or other website feature branches.
- For ACWM changes, first read `/mnt/gyc/benchmark2027/roboexam/third_party/dashboard/ACWM_DASHBOARD_FRONTEND_ISSUE_EXTREME_HANDOFF.md`. Treat it as audit evidence, not as automatically current truth; revalidate claims against the target branch, formal result files, and runtime.

## Collaboration and Git safety

1. Before editing, run `git status --short --branch`, inspect `git worktree list`, and identify the exact files and data sources in scope.
2. Coordinate the owner and file scope before overlapping edits. Preserve other contributors' work and avoid overlapping dirty files. Missing team-channel access does not require creating a feature branch; report a concrete conflict if safe progress on `main` is impossible.
3. Use the actual local `main`; it may contain integration commits not yet present on `sites/main`. Do not assume the remote branch is newer or authoritative. Create a track branch only when requested.
4. Never switch the shared integration checkout to a feature branch. Never overwrite, delete, stage, or commit another contributor's dirty or untracked files.
5. Never use `git reset --hard`, `git clean -fd`, broad `git checkout`/`git restore`, force-push, or remove another worktree/branch. Do not rebase or merge another contributor's branch without coordination.
6. Keep commits focused. Before committing, review `git status`, `git diff`, and the staged diff; include the affected page, metric/data version, and verification performed in the handoff.

## Benchmark data integrity

- Versioned formal result JSON plus evaluator provenance is the source of truth. UI literals, screenshots, filenames containing `latest`, and old handoffs are not authoritative data sources.
- Treat formal results under `/mnt/gyc_ckp/benchmark2027` as read-only unless the user explicitly asks to change the evaluation pipeline. Do not rerun metrics merely to hide a frontend `N/A`.
- A deployed browser cannot read `/mnt/...` paths. Expose data only through an allowlisted, schema-validated exporter/bundle or an authenticated server API; clients may submit stable IDs, never filesystem paths.
- Do not add or refresh production result values by hand in frontend constants. Typed adapters under `app/data/` consume validated generated bundles; source selection and validation belong in allowlisted exporters. Static values are acceptable only in clearly named test fixtures. Preserve model ID, task, result version, split, metric ID, sample ID, evaluator revision, source hash, and media provenance.
- Model availability and metric granularity must be explicit. Missing, not run, failed, partial, and unsupported are different states; missing values remain `null`/N/A and are never coerced to zero.
- Episode metrics may expose episode records. JEPA/JEDi remains distribution/group-level unless the evaluator contract changes. Action Following remains counterfactual-group data and must show `INPUT_MISSING` when no eligible group exists.
- Join Interaction and other sidecar evidence by exact `sample_id`, never by array index or fuzzy filename. Reject duplicates, unknown IDs, split-count mismatches, and cross-model video/evidence.
- Dependent UI state must be keyed by at least model + task + result version + split + metric + sample, and reset when a parent selection changes.

## Frontend implementation

- The title-side iteration counter is generated from Git at build time; see `docs/ITERATION_COUNTER.md`. Commit independent dashboard changes with descriptive titles. Never hand-increment the number, change its fixed baseline, or count refresh/restart events. Keep the full baseline ancestry available to builds.

- Keep application code in `app/`, public static assets in `public/`, tests in `tests/`, and 4090 operations in `ops/4090/`. Do not hand-edit `node_modules/`, `.next/`, `.vinext/`, `.wrangler/`, or `dist/`.
- Preserve authentication and server/client boundaries. Secrets stay in ignored environment files or the runtime environment and must never enter source, generated bundles, logs, or browser responses.
- Use semantic controls, accessible names, keyboard operation, visible focus, and responsive layouts. Avoid introducing a second source of truth for the same metric or selection state.
- Large videos and formal result trees do not belong in Git. Publish controlled media URLs and retain hashes/provenance needed to verify evidence identity.

## Validation gates

- Documentation/rules-only changes: verify every referenced path and command, inspect the diff, and confirm no product or generated file changed. A build or deployment is not required.
- Source changes: run `npm run build`, `npm run lint`, and relevant automated tests. Do not weaken a gate to make it pass; record pre-existing failures separately.
- Data-contract changes must test schema rejection paths, 100 distinct episodes, heldout73 = 73, all100 = 100, finite values, aggregate agreement, exact Interaction joins, and correct JEPA/AF semantics where applicable.
- User-visible changes must verify login, the affected model/metric flow, cross-model switching without stale evidence, and representative desktop/mobile layouts before release.
- `tests/rendered-html.test.mjs` covers the real login route, anonymous redirect, and authenticated capability-matrix SSR. Keep it current when touching product rendering, but do not treat SSR assertions as a substitute for browser interaction, cross-model stale-state, or responsive-layout verification.

## Media verification cost and review scope

- Routine releases use incremental media integrity receipts for curated videos, the episode-media bundle, and staging review videos. Every run still validates current manifests/catalogs, paths, existence, sizes and file identity. Reuse a previous completed SHA-256 check only when expected hash, physical path, device, inode, size, nanosecond mtime/ctime and verifier revision all match.
- New, replaced or modified files, missing/corrupt receipts, and changed verifier policy require actual byte hashing; missing files, wrong bytes and inconsistent evidence remain rejection conditions. Never seed receipts manually from old logs or success flags. Run npm run audit:media:full for an explicit complete byte audit.
- Keep receipt caches outside Git under the managed runtime cache. They are disposable trusted derived state, not independent capture acceptance or cryptographic proof against privileged metadata forgery. Preserve full-audit mode and measure cold/hot checks when changing this gate.
- UI-only changes must not trigger simulation, recapture or full video decoding. With valid matching receipts, do not rehash unchanged frozen media; missing/invalid receipts still require real hashing under the preceding rule. Validate affected flows and actual cross-page clicks before merging; SSR alone missed the installed vinext Link navigation failure.
- The Review page can display allowlisted staging candidates before admission. Label new scene identities explicitly and keep human-review status, machine acceptance, fidelity, timing and formal dataset membership separate. Do not move candidates into curated merely to show them.

## Merge and 4090 release

- Review and commit routine website changes on `main`. When integrating an already existing task branch, review its complete diff and merge into clean `main`, then remove only that task's own merged temporary branch/worktree. Preserve other contributors' branches and worktrees.
- `ops/4090/common.sh` resolves the dashboard root from its own location, and `update.sh` additionally requires the script itself to come from that deployment subtree. Merge first and invoke the merged script from the shared RoboExam `main`; never use a feature-worktree copy to preview or deploy unmerged work.
- Never run `npm run build`, `npm run check`, or a direct `vinext build` in the live shared checkout while the managed service is running. Content-hashed `dist/client` assets must only be replaced through `ops/4090/update.sh`. If validation would replace live build assets, use a temporary detached worktree without creating a branch, and remove it after validation.
- Treat HTML, the client entry manifest, on-disk hashed assets, and HTTP asset responses as one release unit. A `/login` HTTP 200 without successful client-asset verification is unhealthy because server rendering alone does not prove hydration works.
- Deploy only when explicitly requested. For the current 4090 service, run `bash ops/4090/update.sh`, then `bash ops/4090/status.sh`, `bash ops/4090/fixed-public-status.sh`, and `bash ops/4090/watchdog-status.sh`. `public-status.sh` checks only the optional Cloudflare Quick Tunnel.
- The canonical public URL is the Tailscale Funnel URL. It is publicly reachable and does not require a visitor's Mac to run Tailscale. Diagnose local port 3100, the server-side Tailscale daemon, the exact Funnel mapping, TLS, and hashed assets before attributing a failure to a client.
- Keep `unibench-dashboard-watchdog` active. It may deploy only a clean shared `main` whose HEAD differs from the deployment marker; it must never fetch, merge, reset, or select a feature branch automatically. Treat committed, merged, deployed, and fixed-URL live-verified as separate states in reports.
- Preserve the fixed URL. Do not restart the Cloudflare Quick Tunnel merely to deploy application code; bounded Tailscale recovery is owned by `ensure-fixed-funnel.sh`.
- Do not publish through the `.openai/hosting.json` Sites project unless the user explicitly selects that deployment path; the current team production path is the 4090 service and Cloudflare Quick Tunnel.
