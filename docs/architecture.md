# Dashboard architecture

## Current system

```text
browser
  -> vinext routes and signed-cookie authentication
  -> DashboardClient
  -> typed result and episode adapters + feature components
  -> validated generated result bundles
  -> versioned public metric and episode media
```

The 4090 service runs the production vinext build from the shared `main`
checkout. Tailscale Funnel forwards the fixed public URL to the machine-local
service; it is a public Funnel, so browsers do not join the tailnet. A
Cloudflare Quick Tunnel remains an independently checked emergency fallback.

## Source boundaries

- `app/page.tsx`: authenticated root route.
- `app/login/` and `app/api/{login,logout}/`: login UI and session endpoints.
- `app/dashboard-client.tsx`: current dashboard orchestration; it remains an
  oversized migration surface and must shrink as features are changed.
- `app/components/acwm-metric-evidence.tsx`: ACWM episode, distribution,
  judge-episode, and missing-input evidence rendering.
- `app/components/vlm-metric-evidence.tsx`: VLM L1 Pilot aggregate, failure,
  provenance, and Judge-pending evidence rendering.
- `app/components/dataset-explorer.tsx`: task, baseline, seed, and protocol-aware
  episode media selection.
- `app/data/acwm-results.ts`: typed adapter over the generated bundle.
- `app/data/vlm-results.ts`: typed adapter over the VLM L1 generated bundle.
- `app/data/dataset-episodes.ts`: typed adapter over the generated episode catalog.
- `app/data/generated/acwm-results.json`: generated, browser-safe ACWM bundle;
  never edit it by hand.
- `app/data/generated/vlm-results.json`: generated, browser-safe VLM aggregate
  bundle; it contains no private GT, mask, manifest, or server path.
- `scripts/acwm-result-registry.mjs`: explicit server-side source allowlist.
- `scripts/vlm-result-registry.mjs`: exact Pilot artifact allowlist and hashes.
- `scripts/l1-metric-contracts.mjs`: Feishu-revision-pinned Level 1 metric
  allowlist and method provenance. Only its document-approved IDs may be
  projected into the L1 matrix; source-run metric names remain evidence, not
  additional UI metrics.
- `scripts/export-acwm-results.mjs`: schema, split, aggregate, join,
  provenance, and path-leak validation plus deterministic publication.
- `scripts/export-vlm-results.mjs`: Gate D, count, metric-set, pending-state,
  provenance, and path-leak validation plus deterministic publication.
- `scripts/export-dataset-episodes.mjs`: allowlisted formal-cohort validation,
  exact seed pairing, media probing/hashing, and browser-safe episode publication.
- `tests/`: repository, data-contract, and rendered-route verification.
- `ops/4090/`: service, tunnel, validation, and deployment operations.

Generated directories such as `dist/`, `.next/`, `.vinext/`, and
`.wrangler/` are never source.

## Result and episode data paths

```text
formal versioned result JSON
  -> allowlisted exporter
  -> schema and provenance validation
  -> immutable browser-safe manifest/bundle
  -> typed metric adapter
  -> granularity-specific detail component
```

`npm run export:acwm`, `npm run export:vlm`, `npm run export:vla-wam`,
`npm run export:explainability`, and `npm run export:dataset-episodes` are the
supported publication paths.
`npm run check:data` rebuilds their browser-safe outputs in memory and fails when
a committed bundle is stale; exporters never select a result by modification
time or a `latest` filename.

The browser must never receive or choose an absolute `/mnt/...` path. Large
media is stored in the immutable `dashboard-media` generated dataset under
`/mnt/gyc_ckp/benchmark2027/data/generated/`. The 4090 build exposes it
through an ignored `public/media` symlink managed by
`ops/4090/link-media.sh`; browser URLs remain stable under `/media/`.
Episode videos use a separate immutable generated bundle, an ignored
`public/episode-media` symlink, and stable `/episode-media/` URLs. Formal source
videos remain read-only and are never exposed as mount paths.

## Deployment states

`committed`, `merged`, `deployed`, and `live verified` are distinct.
The current team deployment path is the 4090 service. The Sites project in
`.openai/hosting.json` is not a production target unless the user explicitly
selects it.

`ops/4090/update.sh` records the deployed commit only after the rebuilt process
and local hashed assets pass. It records the live-verified commit only after
the Tailscale node, exact Funnel mapping, TLS page, and all public hashed assets
pass. `unibench-dashboard-watchdog` compares these markers with the clean shared
`main` HEAD once per minute. It deploys a changed HEAD, restarts a stopped app,
and performs cooldown-bounded Funnel repair, but never fetches or merges Git.
An external Codex heartbeat restores the tmux watchdog after a host/container
restart because this environment has no systemd or cron.

## Known transition boundaries

- The main dashboard component and global stylesheet are over the desired
  responsibility budget; new feature work should extract modules instead of
  extending them.
- Run and task work-queue notes still contain editorial presentation data;
  formal VLM, VLA/WAM, ACWM, analysis, and episode values already use validated
  registry/exporter/generated-bundle paths.
- Committed result bundles are atomic at Git/deployment level. A future live
  result API would require a separate version pointer and rollback design.
