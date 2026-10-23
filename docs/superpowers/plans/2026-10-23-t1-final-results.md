# GPT and DeepSeek final T1 publication

**Goal:** Publish the approved common v3/zero-unscorable results, all 140 native videos and their saved public VQA first answers, preserving every other model and track.

**Architecture:** Freeze a private source projection from AgentBench's sealed 14-task/70-scene/207-slot-per-model cohort. Validate hashes and exact model/run/attempt/question/video joins in an allowlisted exporter; existing typed UI and read-only media/VQA APIs consume generated public bundles. Preserve the current five-rollout gallery, metric dialogs, authentication, production URL and deployment workflow.

**Files:** Preparation in `scripts/prepare-t1-final-cohort.py`; source registry and exporter in `scripts/*t1-final-cohort*`; legacy export entry points route to this version. Public contracts remain results.v1/VQA.v1 with a new version string. Existing T1 components and API validators admit the two explicitly tagged policy-zero records while retaining observed statuses. Tests cover exact scope, original first-answer counts, cross-model isolation, unsafe content and unchanged legacy scores.

**Storage:** Publication role `evaluation_run`, validated with `/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py`, at `/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-robodojo14-gpt-deepseek-20261023-v3`. Private source and immutable media stay outside Git. Source code is developed in a personal worktree, validated in a separate Linux worktree and merged to clean canonical main. Never build in the serving checkout.

- [x] Verify canonical main, rules, current deployment and all 140 selected native videos; assign disjoint exporter/UI/media audit ownership.
- [x] Prepare hash-pinned cohort/VQA/media snapshots from the exact selected attempts and original visible first answers, without inference or resimulation.
- [x] Export two formal models, 140 episodes, 780 initial instances, 414 fixed slots and 82 real process first answers; keep other models and all other generated bundles byte-identical.
- [ ] Validate contracts, typecheck, lint, full Linux prebuild, build and rendered HTML; verify desktop/mobile interaction, five videos, metric dialogs and model/task/episode state resets.
- [ ] Stage shared publication source/media, preserve old runtime settings, merge to clean canonical main and let the existing managed watchdog deploy the complete release.
- [ ] Verify source/deployed/live commit markers, public hashed assets, all 140 video HEAD and VQA identities, video Range/playback and final scores. Save release evidence and report the unchanged public URL.

Publication is explicitly authorized by the user's request. No new model calls, evaluation runs, GPU jobs or secret changes are required. Private gold, hidden reasoning, full requests, histories and local paths never enter public bundles.
