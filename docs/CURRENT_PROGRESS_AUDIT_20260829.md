# UniEmbodied-Bench Current Progress Audit

Date: 2026-08-29

> **Superseded snapshot.** This audit records the pre-Pilot dashboard state.
> Its L1 collection-only and “not deployed” statements were superseded later
> on 2026-08-29 by the immutable Native L1 Pilot publication. The current L1
> contract, scores, hashes, validation, and maintenance path are in
> [VLM_L1_PILOT_DASHBOARD_HANDOFF_20260829.md](VLM_L1_PILOT_DASHBOARD_HANDOFF_20260829.md).
> Current production status must be read from `bash ops/4090/status.sh`.

This document separates published benchmark evidence from collection smoke tests, diagnostic analyses, and pending work. It is the handoff companion for the dashboard rather than a replacement for versioned result bundles.

## 1. Authoritative locations

- Dashboard source: `/mnt/gyc/benchmark2027/dashboard`
- Large experiment artifacts: `/mnt/gyc_ckp/benchmark2027`
- Shared official checkpoints: `/mnt/public_ckp/benchmark2027/checkpoints`
- Public dashboard: `https://unibench-dashboard.tail4ada12.ts.net/`
- Shared repository: `https://github.com/Ricardo520nono/Benchmark2027`

The live dashboard checkout and the shared GitHub repository are not currently the same Git history. The live checkout contains the latest Pearson-matrix integration. Synchronizing the two histories is a separate governance task and must not be done by copying generated artifacts blindly.

## 2. Published formal results

All current formal scores are for `stack_bowls`. The data explorer contains additional tasks, but they must not be described as formally scored benchmark tasks yet.

| Family | Model | Cohort | Headline result | Published evidence |
| --- | --- | --- | --- | --- |
| VLA | Pi0.5 | 100 episodes, 100 unique seeds | Task SR 76% | 26 VLA/WAM metrics |
| WAM | FastWAM | 100 episodes, 100 unique seeds | Task SR 12% | 26 VLA/WAM metrics |
| ACWM | Cosmos Predict 2.5 | 100 samples | 8/10 metrics available | Interaction not run; Action Following input missing |
| ACWM | CtrlWorld | 100 samples | 9/10 metrics available | Action Following input missing |

Oracle is a reference and GT-generation protocol. It is not a learned baseline and must not be ranked beside Pi0.5, FastWAM, Cosmos Predict 2.5, or CtrlWorld.

## 3. Dataset inventory

The browser bundle exposes three tasks and five protocol cohorts per task. `stack_bowls` has verified same-seed alignment across Oracle, Pi0.5, FastWAM, Cosmos Predict 2.5, and CtrlWorld. For `arrange_largest_number` and `sort_nesting_dolls_by_size`, the current pairing is source-episode based; `requested_seed` is not yet a verified simulator-seed identity.

Therefore:

- three tasks are available for artifact browsing;
- one task is currently eligible for formal model comparison;
- cross-task aggregate ranking is not yet supported.

## 4. Work in progress

### L1 collection

Qwen3-VL-8B-Instruct Native L1 completed 350/350 terminal predictions with no collection errors. This validates collection only. `item_scores.jsonl` and `summary.json` are not available, so no L1 accuracy or IoU claim is valid yet.

### Robustness smoke

Pi0.5 object-pose variation has two baseline and two 20 cm-perturbed episodes. The paired contract works, but N=4 is not a formal robustness cohort. The observed result must remain a smoke-test note rather than a leaderboard value.

### Explainability and statistics

Pi0.5 P0 contains 100 episodes and 16 diagnostic quantities. The Pearson matrix covers Pi0.5, FastWAM, Cosmos Predict 2.5, and CtrlWorld, but the interpretation differs by family:

- VLA/WAM panels relate metrics to task outcomes;
- ACWM panels are metric-to-metric analyses because the inputs are Oracle-success and closed-loop success does not vary;
- correlation is not causation and is not proof that a metric is a reliable cross-task proxy.

## 5. Verified observations and open questions

Verified:

- Pi0.5 and FastWAM use complete 100-seed Stack Bowls cohorts.
- Missing metrics are represented as unavailable states, not zero.
- left mean EE speed is the only repeated significant positive association across the two current VLA/WAM panels.
- ACWM pixel-fidelity metrics are highly redundant; Trajectory Accuracy is comparatively independent.

Open or not yet justified:

- L1 model quality before the scorer is frozen;
- formal robustness performance from the four-episode smoke;
- cross-task unified ranking;
- whether current ACWM metrics predict downstream closed-loop success;
- whether path length can be interpreted as efficiency without correcting for early success termination and 500-step failure horizons.

## 6. Dashboard changes in this audit branch

- Replaced the stale recent-run table with an evidence ledger.
- Separated formal results, collected-but-unscored work, smoke analyses, and missing evidence.
- Reorganized the metric registry around project L1-L4 semantics instead of internal implementation L0-L6 labels.
- Added Level filters and bilingual/source-aware metric search.
- Marked Oracle as a reference protocol rather than a pending baseline.
- Added explicit reading guidance for formal scope and N/A semantics.

No production deployment is performed by this audit branch until the changes are explicitly approved for release.
