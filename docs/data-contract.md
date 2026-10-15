# Benchmark dashboard data contract

Formal, versioned evaluator output is authoritative. Frontend literals,
screenshots, modification times, filenames containing `latest`, and historical
handoffs are discovery evidence only.

## Identity

Every displayed result or evidence record must retain:

- model ID and display name;
- task and result version;
- split;
- metric ID and evaluator field;
- sample ID or distribution/group ID;
- evaluator revision;
- source file identity/hash;
- media identity/hash when media is shown.

Dependent UI state is keyed by model + task + result version + split + metric +
sample and resets when a parent selection changes.

## Availability

Use explicit states:

- `available`
- `not_run`
- `input_missing`
- `evaluator_failed`
- `partial`
- `unsupported`

Missing values remain `null`/N/A and are never converted to zero.

## Granularity

- Episode metrics: MSE, M-MSE, PSNR, SSIM, IQ, MS, and TA.
- Distribution/group metric: JEPA/JEDi; do not fabricate episode values.
- Judge episode metric: Interaction; preserve raw score, normalized score,
  reason, sampled-frame count, evaluator, error, and media evidence.
- Counterfactual group metric: Action Following; no eligible group means
  `input_missing`, `eligibleGroupCount = 0`, and `value = null`.
- VLM membership aggregate: publish the frozen deterministic group score,
  planned/effective N, parse rate, distribution statistics, and failures.
  `judge_pending` is a distinct state and never becomes zero.

## Leaderboard Overall

The leaderboard Overall is a strict macro over five already-normalized
setting-level scores:

```text
Overall = 0.2 × ID
        + 0.2 × Visual OOD
        + 0.2 × Semantic OOD
        + 0.2 × Behavioral OOD
        + 0.2 × Recovery
```

Each input is a formal 0–100 score produced upstream after metric
normalization and capability-dimension macro averaging. Raw values with
different units, diagnostics, gates, sample counts, and confidence intervals
never enter this formula. Aggregation order is episode → unique scene →
capability dimension → setting → Overall. A multi-tag scene is counted once.

Overall is emitted only when all five settings cover every selected unique
scene under one protocol version. A missing setting, scene, version/hash,
duplicate scene-setting record, or score outside 0–100 makes Overall `null`.
Missing values are never zero and the remaining weights are never
renormalized. Scene selection may recompute Overall; metric search, hidden
columns, and metric facets may not.

## Join and split invariants

- Sidecar evidence joins by exact `sample_id`, never array position or fuzzy
  filename.
- Duplicate and unknown IDs are release-blocking errors.
- Formal ACWM bundles require 100 distinct samples, heldout73 = 73, and
  all100 = 100.
- The frozen VLM L1 Pilot requires 1,277 memberships, 1,200 canonical
  predictions, 1,277 terminal ItemScores, 12 deterministic metric groups,
  177 Judge pending, and zero infrastructure failures.
- Aggregate values must agree with the declared source records at the
  documented precision.
- Evidence may not cross model or result-version boundaries.

## Publication

The exporter or API owns the absolute result allowlist. Browser requests use
stable IDs only. A publishable bundle records schema version, result version,
source revisions, source hashes, counts, and the media mapping. Incomplete
bundles fail closed and do not fall back to older frontend constants.

For ACWM, the allowlist is `scripts/acwm-result-registry.mjs`. Run
`npm run export:acwm` only when intentionally publishing a reviewed formal
result version. The exporter requires 100 unique samples, heldout73 = 73,
finite episode fields, documented aggregate agreement, an exact Interaction
`sample_id` join, legal JEPA/AF granularity, source hashes, and no `/mnt/...`
path in the browser bundle. `npm run check:data` is the read-only freshness
gate used by `npm run check` and deployment.

For VLM L1, the allowlist is `scripts/vlm-result-registry.mjs`. Run
`npm run export:vlm` only when intentionally publishing a reviewed immutable
run. The exporter verifies exact source SHA-256 values, run/config/runtime/Gate
D schemas, memberships and canonical counts, byte-identical scoring, the exact
12-metric identity set, positive parse rate for every deterministic family,
separate Judge pending semantics, and no `/mnt/...` path in the browser bundle.
Private GT, RefSpatial masks, private manifests, and per-item raw responses are
not browser-published by this aggregate contract.

## Episode catalog

Episode catalogs preserve task, model, result version, protocol kind, stable
episode identity, seed or source episode identity, outcome semantics, pairing
status, source hash, and media hash. `oracle_gt`, `policy_rollout`, and
`acwm_open_loop` are distinct protocols: a successful Oracle source trajectory
does not make an ACWM open-loop prediction a successful policy rollout.

The allowlist is `scripts/dataset-episode-registry.mjs`. The Stack Bowls smoke
export requires five 100-episode formal cohorts with an identical 100-seed set,
publishes only seeds 12, 0, and 110, and rejects duplicate IDs, partial cohorts,
missing media, unsafe URLs, hash drift, and any browser-visible `/mnt/...` path.
