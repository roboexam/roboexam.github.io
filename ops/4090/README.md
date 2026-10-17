# UniEmbodied-Bench 4090 service

The shared source of truth is RoboExam `main` at
`/mnt/gyc/benchmark2027/roboexam`; the dashboard project root is
its `third_party/dashboard` subtree. The service runs on the 4090 machine
reached through SSH port `6015` and listens on the machine-local port `3100`.

## Team workflow

1. Develop and validate in a personal branch and sibling worktree.
2. Review and merge the branch into the shared
   `/mnt/gyc/benchmark2027/roboexam` checkout on `main`.
3. Build and publish with `bash ops/4090/update.sh` on the 4090.
4. Check the release with `bash ops/4090/status.sh`,
   `bash ops/4090/fixed-public-status.sh`, and
   `bash ops/4090/watchdog-status.sh`.

`update.sh` refuses a non-`main` checkout, a feature-worktree copy of the
script, or uncommitted tracked changes. It also holds an exclusive deployment
lock so two maintainers cannot publish concurrently. Non-build checks run while
the existing service stays available. The script then stops the service,
builds, runs rendered-HTML tests, starts the new process, and verifies every
hashed client asset before recording the deployed commit. This intentionally
prefers a short, explicit maintenance window over serving HTML whose JavaScript
bundle no longer exists.

The release gate includes `npm run check:data`, so deployment stops if a
committed result bundle no longer matches its allowlisted formal result files.
`start.sh`, `status.sh`, and both public-entry checks call
`ops/4090/verify-assets.sh`; a 200 response for `/login` alone is not considered
healthy.

## Fixed public URL and automatic release convergence

The canonical public entry is:

```text
https://unibench-dashboard.tail4ada12.ts.net/
```

This is a public Tailscale Funnel. Tailscale runs on the 4090 host; visitors do
not need Tailscale on their Mac or other client. The exact supported mapping is
HTTPS 443 to `http://127.0.0.1:3100`.

The release guard separates three states:

1. `status.sh`: the app process serves the current local HTML and hashed assets,
   and the shared `main` HEAD equals `deployed-commit.txt`.
2. `fixed-public-status.sh`: the Tailscale node is online, the exact Funnel
   mapping exists, and the fixed URL serves current HTML plus every hashed CSS
   and JavaScript asset.
3. `watchdog-status.sh`: the most recent watchdog cycle converged source,
   deployed, and live-verified commit markers.

`update.sh` now runs the full fixed-entry asset gate before writing
`live-verified-commit.txt`. `deploy-if-needed.sh` is the idempotent reconciliation
entry point: it deploys only a clean shared `main` whose HEAD differs from the
deployed marker, restarts a stopped current build, and ensures the fixed Funnel.
It never fetches, pulls, merges, resets, or changes branches.

Start the in-host watchdog once after deployment:

```bash
bash ops/4090/start-watchdog.sh
bash ops/4090/watchdog-status.sh
```

The `unibench-dashboard-watchdog` tmux session checks every 60 seconds. Its
steady-state probe downloads the current login page, browser entry, and
page-referenced stylesheets; every
deployment checks the complete build manifest in parallel. Missing
or offline `tailscaled`, a missing/wrong Funnel mapping, TLS failure, stale HTML,
and missing CSS/JavaScript assets all fail the gate. The repair script may start
the existing node identity, restore only the exact 443 mapping, or restart the
daemon once; a 15-minute cooldown prevents restart loops. It never creates a
new Tailscale identity or performs interactive authentication.
The node-key expiry is checked on every cycle; entering the 30-day warning
window changes watchdog status to `warning` so the external check can notify an
administrator without restarting a healthy service.

This host has neither systemd nor cron, so a host/container restart removes all
tmux sessions. The external dashboard heartbeat calls `start-watchdog.sh`
periodically; that is the boot-loss recovery layer. If authentication expires,
the scripts stop and report administrator action instead of silently replacing
the node.

External heartbeat registration (Codex app):

```text
name: UniBench 固定站点保活
automation id: unibench
interval: 15 minutes
notifications: failed runs only
```

The heartbeat may invoke the committed reconciliation and read-only status
scripts. It must not fetch or merge Git, replace the Tailscale identity, delete
state/certificates, change dashboard authentication, or manage the Cloudflare
fallback.

## Live-build safety

Never run `npm run build`, `npm run check`, or `vinext build` directly in the
live RoboExam `third_party/dashboard` subtree while the managed service is
running. A vinext build replaces content-hashed files under `dist/client`; the
already-running process can keep emitting the previous filenames, leaving the
page visible but disabling all client-side buttons.

The package `prebuild` hook blocks the common accidental `npm run build` and
`npm run check` paths in the live checkout. Validate ordinary changes in a
sibling worktree. The only supported production build path is:

```bash
bash ops/4090/update.sh
```

If a deployment fails after the service has stopped, leave the failure visible,
fix it in a worktree, and rerun `update.sh`; do not start a partially built
`dist` directory manually.

## Incremental media integrity

Normal releases still inspect every current manifest/catalog and every media path,
size and file identity. The three largest media gates reuse a completed byte-hash
receipt only when the expected SHA-256, resolved path, device, inode, size,
nanosecond mtime/ctime and verifier-source hash all match. A first run or any
changed identity hashes the actual bytes. Missing/corrupt caches safely require
full hashing; wrong or missing media still rejects publication.

Receipts live outside Git at
/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_media_integrity/v1.
UNIBENCH_MEDIA_INTEGRITY_CACHE_DIR can select an isolated validation cache.
Never manually manufacture receipts from a prior log: the verifier must read
and check the bytes itself. The cache is trusted derived state for normal file
operations, not protection against a privileged actor forging all metadata.

For a complete byte audit, explicitly run:

    npm run audit:media:full

This sets UNIBENCH_MEDIA_VERIFY_MODE=full for the full prebuild gate. The default
is incremental; unsupported modes fail. Each gate logs files/bytes rehashed or
reused, verifier identity, bindings and elapsed time. Cache entries are committed
only after that gate's manifest and generated-output checks succeed.

The staging Review page is separate from the admitted Datasets collection:
new-scene candidates can be visually reviewed before curated admission, without
changing their original physical, Action, fidelity, timing or selector verdicts.

## Media bundle

Dashboard videos and images live in the immutable generated dataset at
`/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-media/v1-20260819-a5b6a78`.
`public/media` is an ignored symlink created by
`bash ops/4090/link-media.sh`. The script validates the canonical storage role,
refuses to replace an unexpected path, and may be pointed at another verified
version through `DASHBOARD_MEDIA_BUNDLE_DIR`.

Use `bash ops/4090/start.sh` and `bash ops/4090/stop.sh` to start or stop the
service without rebuilding it. Runtime logs are stored at
`/mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.log`.

Joint and end-effector trace export uses the isolated Python environment at
`/mnt/gyc_ckp/benchmark2027/runtime/python/dashboard-traces`. Provision it with
`/usr/bin/uv venv --python /usr/bin/python3 <path>` and
`/usr/bin/uv pip install --python <path>/bin/python numpy==2.2.6 h5py==3.15.1`.
`update.sh` refuses to publish when this managed interpreter is missing.

## Browser access before an internal HTTP port is exposed

Open an SSH tunnel from the computer that runs the browser:

```bash
ssh -N -L 3100:127.0.0.1:3100 -p 6015 root@10.40.0.110
```

Then open `http://127.0.0.1:3100`. Keep the tunnel terminal open while using
the site. A later infrastructure step can expose port 3100 directly and remove
the need for this tunnel.

## Temporary public URL (emergency fallback only)

Start the Cloudflare Quick Tunnel with `bash ops/4090/start-public-tunnel.sh`.
Check it with `bash ops/4090/public-status.sh` and stop it with
`bash ops/4090/stop-public-tunnel.sh`. The current URL is recorded at
`/mnt/gyc_ckp/benchmark2027/runtime/dashboard/public-url.txt`.

The temporary `trycloudflare.com` URL changes whenever the tunnel is restarted.
It is not the canonical dashboard address and is not used to decide whether a
release is live. `public-status.sh` validates only this fallback.

## Host supervisor for the tmux sessions

The dashboard service, the Tailscale daemon and the release watchdog all run
inside tmux, because this host has no systemd and no cron. That leaves one
failure they cannot survive on their own: if the **tmux server itself** dies,
all three vanish at once and nothing is left running that could restart them.
This happened on 2026-09-17 and the public URL stayed down until a person
noticed.

`supervisor-loop.sh` closes that gap. `start-supervisor.sh` detaches it with
`setsid`, so it lives outside tmux and is reparented to PID 1 rather than
dying with tmux, the shell, or the SSH connection.

```bash
bash ops/4090/start-supervisor.sh
bash ops/4090/supervisor-status.sh
bash ops/4090/stop-supervisor.sh
```

Scope is deliberately narrow. The supervisor restores sessions that are
**absent** and does nothing else; release convergence, asset verification and
Funnel repair stay owned by `watchdog-loop.sh` and `ensure-fixed-funnel.sh`.
Duplicating those health checks here would put two repair loops on one
service.

| Missing session | Repair the supervisor runs |
|---|---|
| `unibench-dashboard` | `start.sh` |
| `unibench-tailscaled` | `ensure-fixed-funnel.sh` |
| `unibench-dashboard-watchdog` | `start-watchdog.sh` |

A `flock` on `supervisor.lock` keeps a single instance, and a per-session
repair cooldown (default 300s) stops a dependency that stays broken from
turning into a restart loop. State lives in
`/mnt/gyc_ckp/benchmark2027/runtime/dashboard/`: `supervisor.log`,
`supervisor-status.env`, `supervisor.pid`.

`supervisor-status.sh` reports `ok` only when all three guarded sessions are
present and the last cycle is recent. `repairing` means a repair ran but the
session has not come back yet; `failed` means a session is absent and its
cooldown has not elapsed. The supervisor is not a substitute for
`watchdog-status.sh`: a present session is not a healthy release.

A container restart kills every process here, the supervisor included, so two
things cover that case. `/root/.bashrc` on the 4090 survives a restart while
`/root/.bash_profile` is regenerated by aibox, so a bootstrap block there
restarts the supervisor on the next interactive login. For unattended
recovery, see the cross-host watch below.

## Cross-host watch on the A800 (`ops/a800/`)

Nothing inside the 4090 container can restore the supervisor after that
container restarts: there is no systemd, no cron and no aibox start hook. The
A800 dev box is a separate container on far steadier uptime (26 days against
the 4090's, which restarted twice on 2026-09-17) and already reaches the 4090
over passwordless SSH, so the outermost guard lives there.

Run on the **A800** (`ssh -p 685 root@10.40.0.110`):

```bash
bash /mnt/gyc_wjx/benchmark2027/dashboard/ops/a800/start-remote-supervisor.sh
bash /mnt/gyc_wjx/benchmark2027/dashboard/ops/a800/remote-supervisor-status.sh
bash /mnt/gyc_wjx/benchmark2027/dashboard/ops/a800/stop-remote-supervisor.sh
```

It does exactly one thing: if the 4090's own supervisor is not running, start
it. Session-level repair stays with that supervisor, which restores the
dashboard, tailscaled and watchdog sessions itself once it is back, so there
is still a single authority for them. The watch only ever **starts** work on
the 4090 - it never stops or kills anything, and a test asserts that.

State is local to the A800 under `/root/.unibench-remote-supervisor/`, not on
the project share, because a `flock` guarding one running process does not
belong on a network filesystem. Default cycle is 120s with a 600s repair
cooldown. `result` is `ok`, `repairing`, `down` or `unreachable`; an
unreachable 4090 is never reported as healthy.

The A800 carries the same `/root/.bashrc` bootstrap, so an A800 restart is
repaired on the next interactive login there.

## Publishing newly admitted episodes

Once episodes are admitted to `curated_simulation_data`, one command puts them
on the dashboard:

```bash
bash ops/4090/publish-curated.sh            # re-export and commit
bash ops/4090/publish-curated.sh --dry-run  # export and report only
```

It prints task/episode counts before and after with the clean, recovery and
OOD split, stages only the generated bundle, and refuses to run while
unrelated files are dirty so it can never sweep up someone else's work.

A brand new task also needs one entry in `scripts/curated-task-metadata.json`
giving its capability tags and Chinese instruction; without it the task
publishes untagged and cannot be reached from the capability filters. The
exporter warns by name when an entry is missing.

This changes no data gate. The exporter still checks every manifest and video identity, rehashing new or
changed files (or all files in explicit full-audit mode), byte sizes, official reward, task success, failure-semantics witness and
numbering registry entry, and still rejects any catalog row that is not
`strictly_selected`. The one gate that was removed is the per-task
`raw_target_met` flag, which recorded stage progress rather than episode
validity and blocked a task from appearing at all until its whole collection
target was reached.

## Release and recovery commands

```bash
# Reconcile a clean shared main, app process, and fixed URL once.
bash ops/4090/deploy-if-needed.sh

# Read-only gates.
bash ops/4090/status.sh
bash ops/4090/fixed-public-status.sh
bash ops/4090/watchdog-status.sh

# Idempotent fixed-entry repair without rebuilding the app.
bash ops/4090/ensure-fixed-funnel.sh

# Managed monitoring.
bash ops/4090/start-watchdog.sh
bash ops/4090/stop-watchdog.sh

# Host-level tmux supervisor (survives a dead tmux server).
bash ops/4090/start-supervisor.sh
bash ops/4090/supervisor-status.sh
bash ops/4090/stop-supervisor.sh
```

When a check fails, inspect
`/mnt/gyc_ckp/benchmark2027/runtime/dashboard/watchdog.log`. Do not use the
Quick Tunnel URL as evidence that the fixed URL is healthy, and do not infer
that a client needs Tailscale merely because the Funnel failed.
