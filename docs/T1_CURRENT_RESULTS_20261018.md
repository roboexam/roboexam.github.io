# Track 1 VLM results · 2026-10-18

Current release: `t1-stack-bowls-20261018-v1`.
Public route: https://unibench-dashboard.tail4ada12.ts.net/track-1

## Scope

Track 1 defaults to four VLMs across five Stack Bowls layouts (124, 136, 125, 138, 134): DeepSeek v4.1 Flash, MiMo v2.6 Pro, Kimi K3 and GPT-6 Astra. The table and episode viewer consume one validated generated bundle. Previous protocol views and other tracks retain their existing behavior. C2/C3 are null until scored; no scores were fabricated or manually revised for this publication.

Initial VQA is the frozen semantic-v1 offline rescore at scorer commit `da4ab4e9b06a9d1450afb3a382618a8a27f52388`. It includes 97 normal answers of 100 expected. Each model/layout slot joins the selected initial-answer source and selected execution explicitly; different-run sources retain separate seals. Native observed progress is separate from task success. The expandable details retain scoring and source provenance.

## Source and media packet

Immutable publication root:
`/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-stack-bowls-20261018-v1`

- Manifest SHA-256: `43dee92183f4f29461225f643b12b43909b9f5bffaeb9296911f1e93b2955992`.
- Original score report SHA-256: `dbe0180c90a33e30fb8c6bf7318efbfee1c43cff927dc8c6fe7a9e026c65e294`.
- Public bundle SHA-256: `a8a39a5016eee1c1d6dcf9d8b5fbed3d848a9185989626badcee095e394daddc`.
- Twenty original MP4 copies, 27,995,409 bytes total. All copies were byte-hashed against their source identities.
- Private source metadata/seals stay outside Git. Public projection excludes filesystem paths, credentials, endpoints, raw truth and model context.
- Browser media route accepts unique allowlisted IDs only. It supports GET, HEAD, conditional requests and byte ranges. Default media root is the packet's media directory; server override: `DASHBOARD_T1_MEDIA_ROOT`.

## Reproduce and validate

Run in `third_party/dashboard` using the production toolchain:

```sh
export PATH=/mnt/gyc_ckp/benchmark2027/runtime/node/node-v22.14.0-linux-x64/bin:/mnt/gyc_ckp/benchmark2027/runtime/python/dashboard-traces/bin:$PATH
npm run check:t1
npm run test:t1
npm run check:prebuild
npm run typecheck
npm run lint
npm run build
npm run test:render
```

The pinned registry and exporter reject stale sources, duplicate/missing slots, inconsistent aggregates and mismatched video identities. `--check` does not rewrite the bundle. `scripts/build-t1-publication.py` stages a new external packet; it does not mutate original episodes.

Validation completed in the isolated worktree on 5403:
- Node 22.14.0 and managed Python 3.10.12; Python 3.11 embodied client environment used for orchestration.
- Full prebuild and 129 unit tests passed; typecheck and build passed.
- Lint passed with four unchanged existing image-element warnings.
- Built server render tests passed (9/9), including existing login/redirect checks.
- Desktop browser played GPT-6 Astra and MiMo videos; model/layout switching verified, including Kimi's static initial view and missing scores. Other-track navigation, previous protocols, expanded details and 390×844 responsive layout verified.
- No model API, simulation or GPU was used for publication.

## Integration and deployment

Development worktree: `/bh/zbh_self/projects/roboexam-t1-vlm-results-20261018`.
Integration source: `/mnt/gyc/benchmark2027/roboexam` main.
The existing 4090 watchdog deploys clean changed main through managed checks/build/restart and fixed-URL asset verification. It does not fetch or merge. Verify deployed-commit and live-verified-commit markers under `/mnt/gyc_ckp/benchmark2027/runtime/dashboard` separately from the Git merge.

Only the task's preview tmux session and local SSH forward are disposable. Original runs, shared runtime, source packets and worktrees are preserved.
