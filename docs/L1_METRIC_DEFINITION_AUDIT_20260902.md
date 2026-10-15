# Level 1 Metric Definition Audit

Date: 2026-09-02

Definition baseline: [Level 1 VLM matrix](https://my.feishu.cn/wiki/WYndwB32gi2gcAkwuDxceIeGnge), revision 264

Dashboard contract: `benchmark2027-l1-metric-contracts-v0.2-doc-r264`

Dashboard bundle: `l1-minimal-cosmos3-retry1-doc-r264-whitelist-v1-20260902`

Selection policy: the numbered metric sections in the Feishu document are the
only allowlist for the dashboard's Level 1 matrix. Source-run metrics may be
used as implementation evidence, but they are not additional dashboard
metrics.

## Conclusion

The previous dashboard was not a faithful rendering of the reviewed matrix. It combined an immutable candidate-audit artifact whose semantics had drifted with a second, manually maintained frontend narrative map. That duplication allowed names, formulas, sources, examples, and evidence grades to disagree. The clearest symptom was expanding RoA as “Relative Object Accuracy”; the reviewed definition is **Relative Orientation Accuracy**.

The dashboard now consumes one repository-owned semantic contract for all 29 entries. The original candidate artifact remains immutable and is retained only as provenance. A metric is published with a score only when the reviewed definition and an existing E3 evaluator result are an exact semantic match. Formula fixtures, recoverable predictions without a frozen evaluator, and design placeholders remain scoreless.

Labels such as `Benchmark2027 task-stage contract` and `Benchmark2027
structured task-graph contract` were not external benchmark citations. They
described project-internal adapters created for the Cosmos3 minimal run and
were easy to misread as independent sources. The dashboard now separates the
two questions: every entry first names its Feishu section as the selection
authority, then names the calculation-method provenance. Internal methods are
explicitly marked as non-native to any external benchmark.

## Evidence policy

| Grade | Meaning in the dashboard |
|---|---|
| E3 | Exact input, prompt, model prediction, GT, scorer and ItemScore are traceable in an immutable run. A score may be shown. |
| E2 | Real data/code/output exists, but the displayed question–metric pair lacks a complete frozen ItemScore chain. No score is published. |
| E1 | The formula can be demonstrated with a constructed prediction or toy cohort. It is explicitly a fixture, not a model result. |
| E0 | Design placeholder; required output, GT, evaluator or execution path is not yet complete. |

## Metric-by-metric audit

| Layer | Metric | Canonical meaning / calculation | Source status | Current evidence |
|---|---|---|---|---|
| L1-A | RynnBrain Object / State Score | Semantic correctness of object, attribute, count and state answers; frozen Judge Accuracy or normalized 0–5 score | RynnBrain native semantic rubric; Judge not frozen | E2 |
| L1-A | RoboBrain / OpenEQA LLM Alignment Score | Semantic alignment of free text; `(judge rating-1)/4` for ratings 1–5 | Adapted semantic Judge | E2 |
| L1-A | Text Spatial Cognition Score | Current published adapter is normalized relation-triple set F1; native free text remains Judge-dependent | RynnBrain Spatial + Benchmark2027 structured adapter | E3 for Relation F1 only |
| L1-A | MRA · Distance / Size Relative Accuracy | Relative numeric error over distance, length or size, scored over ten strict thresholds from 0.50 to 0.05 | RynnBrain official evaluator, reproduced | E1 |
| L1-A | RoA · Relative Orientation Accuracy | Shortest circular direction error; normalize by 90° or three clock positions, then apply MRA's ten thresholds | RynnBrain official evaluator, reproduced | E1 |
| L1-A | RefSpatial Location / Placement / Unseen Point-in-Mask | Fraction of predicted points lying inside the private GT mask; splits are reported separately | RoboRefer / RefSpatial-Bench native metric | E1 |
| L1-A | Direct Acc@0.5 | Correct frame plus bbox whose IoU is strictly greater than 0.5 | RynnBrain Direct Referring native metric | E1 |
| L1-A | PIO S1 Repo-Code Box IoU | Convert polygon GT to its tight bbox, then compute continuous box IoU | Point-It-Out `eval_s1s2.py` | E1 |
| L1-B | Situational Acc@0.5 | Infer the next interaction target from context, then require correct frame and bbox IoU strictly greater than 0.5 | RynnBrain Situational Referring native metric | E1 |
| L1-B | Area Hit Ratio | Number of predicted points inside the valid polygon divided by valid predicted point count | RynnBrain Area native metric | E1 |
| L1-B | Affordance Similarity | `exp(-mean nearest distance)` from predicted points to the GT affordance point set | RynnBrain Affordance native metric | E1 |
| L1-B | PIO S2 Repo-Code Box IoU | Same repo-code box IoU as S1; S2 differs in task-driven question semantics, not its formula | Point-It-Out `eval_s1s2.py` | E1 |
| L1-B | Affordance AP | Confidence-ranked matching of multiple affordance instances followed by area under the precision–recall curve | RoboBrain candidate metric | E0 |
| L1-C | Stage Accuracy | Exact match against the frozen five-stage vocabulary: not started, early, middle, late, complete | Project-internal use of standard Accuracy; not an external benchmark native metric | E3 |
| L1-C | Next-Subgoal Accuracy | Prediction belongs to the frozen legal successor set in the task DAG | Project-internal candidate; not an external benchmark native metric | E0 |
| L1-C | Stage Macro-F1 | Per-stage F1 followed by an unweighted mean across the complete frozen cohort | Standard aggregate over project stage labels; not benchmark-specific | E1 |
| L1-C | Plan Step-F1 | Set F1 over normalized action–object–destination plan steps | Project structured-plan adapter; not an external benchmark native metric | E3 |
| L1-C | Plan Edit Similarity | `100 × (1-Levenshtein/max sequence length)` over normalized ordered steps | Project-internal normalized Levenshtein adapter | E3 |
| L1-C | Dependency F1 | Set F1 over normalized `before → after` task-DAG edges | Project-internal task-DAG edge adapter | E3 |
| L1-C | RoboVQA BLEU-1 | Tokenized plan-text overlap up to 1-grams, including brevity penalty | RoboBrain planning-text baseline adaptation | E1 |
| L1-C | RoboVQA BLEU-2 | Tokenized plan-text overlap up to 2-grams, including brevity penalty | RoboBrain planning-text baseline adaptation | E1 |
| L1-C | RoboVQA BLEU-3 | Tokenized plan-text overlap up to 3-grams, including brevity penalty | RoboBrain planning-text baseline adaptation | E1 |
| L1-C | RoboVQA BLEU-4 | Tokenized plan-text overlap up to 4-grams, including brevity penalty | RoboBrain planning-text baseline adaptation | E1 |
| L1-C | Planning LLM Alignment Score | Overall semantic plan quality rated 1–5 by a frozen Judge, normalized with `(rating-1)/4` | RoboBrain Judge adaptation | E2 |
| L1-D | Failure Occurrence Macro-F1 | Mean of class F1 for failure and no-failure | Project-internal use of standard binary Macro-F1 | E3 |
| L1-D | Failure Type Macro-F1 | Macro-F1 over the frozen taxonomy `[none, in air drop, premature halt]` | Project-internal failure taxonomy plus standard Macro-F1 | E3 |
| L1-D | Failure Onset Similarity | `100 × clamp(1-|pred onset-GT onset|,0,1)` on true-failure episodes | Project-internal normalized time-error adapter | E3 |
| L1-D | Recovery-Subgoal Accuracy | Predicted `next_subgoal` belongs to the legal recovery successor set | Project-internal recovery-DAG candidate | E0 |
| L1-D | Recovery Plan Quality | Report Step-F1, order quality and constraint satisfaction separately; no synthetic weighted total is defined | Project-internal recovery-plan candidate | E0 |

The resulting evidence distribution is E3=8, E2=3, E1=14 and E0=4. Because L1-B currently has no E3 score, the candidate matrix must not publish a Level 1 aggregate.

## Material corrections from the previous dashboard

- **RoA:** changed from the invented “Relative Object Accuracy” point-localization interpretation to circular **Relative Orientation Accuracy**.
- **MRA:** changed from coordinate/point accuracy to relative numeric accuracy for distance, length and size.
- **RefSpatial:** corrected the source to RoboRefer / RefSpatial-Bench and the score to point-in-mask, split by Location, Placement and Unseen.
- **Direct and Situational:** restored the frame-plus-bbox contract and strict `IoU > 0.5` boundary.
- **PIO S1/S2:** corrected the source to Point-It-Out and the official code path to polygon-tight-bbox versus predicted bbox IoU. S2 does not use point output.
- **Stage:** restored the five-stage vocabulary. Stage Macro-F1 is a cohort fixture until its formal aggregate receipt is frozen.
- **BLEU-1–4:** retained as candidate baselines but removed the previously promoted post-hoc values from formal display.
- **Failure:** restored the actual `has_failure`, `failure_type` and `onset_fraction` schemas and the frozen failure taxonomy.
- **Recovery Plan:** removed the invented weighted total. Step, order and constraint diagnostics remain separate until a formal contract exists.

## Implementation guardrails

- `scripts/l1-metric-contracts.mjs` is the only semantic source for the 29 candidate metrics.
- `l1MetricDocumentWhitelist` freezes the ordered 29-ID projection of Feishu
  revision 264. Export and tests fail if a contract is added, removed, or
  reordered without updating the reviewed document baseline.
- Frontend narratives are projected from that generated contract rather than maintained as another hand-written map.
- The exporter asserts that all 29 stable IDs and four layers match the immutable candidate artifact.
- Stable IDs such as `l1d.recovery_plan_score` are retained as legacy URL/data aliases; they do not authorize the old semantics.
- Regression tests reject “Relative Object Accuracy” and other known stale interpretations.
- The reviewed document uses two distinct scopes: its “formal immutable Cosmos3 minimal run” lists the 12 metrics actually computed there (including Completed-Subtask F1 and Progress Agreement), while the detailed four-layer candidate matrix contains 29 design entries (including Stage Macro-F1 and BLEU candidates). The dashboard preserves that distinction instead of silently substituting one list for the other.
