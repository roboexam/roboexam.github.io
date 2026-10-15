# Scenario and metric review · 2026-10-10

## Assessment

The proposed simulation tasks support overlapping tags. These tags describe task requirements, not independent, experimentally isolated model abilities. The main problems were stale website assignments, unqualified history/order claims, and mixing scenario properties with evaluation conditions. The metric proposals are suitable as a layered reporting framework; they are not a justified equal-weight overall score.

Sources reviewed: `UniEmbodied-Bench (RoboExam).md` (canonical four-track table, task-scene axes v2, simulation batch plan V1, hardware/manual-review sections), `level1 VLM metrics设计最新（初步final）.md`, `ACWM metrics设计方案.md` (v2), and `Policy Model指标（优化）.md`. These source documents live in the parent `bmk` directory. They were not edited.

The simulation batch table has **31 scenario entries**, including the proposed board-pattern task. **26** match the local episode catalog. The remaining five are Board Pattern Placement, Match and Pick from Conveyor, Swap Blocks, Swap T, and Fill Pen Holder. A local recording proves neither compliance with a revised instruction nor readiness of a new split. The earlier nine-task scene-axis examples are not the full batch-plan inventory.

## Tag decisions

The website now uses a separate proposal annotation layer. Generated catalogs, episode hashes, original tags, and result bundles remain intact. `?` means candidate eligibility, `*` means variant-only; unmarked tags still describe the plan, not completed validation.

| Tag | Keep when | Do not infer from |
| --- | --- | --- |
| G · Object grounding | Identity, category, or attribute selects the target | Incidental texture or color |
| R · Spatial goals | A goal region or object relation is checked | A claim that spatial reasoning has been isolated |
| F · Functional interaction | A functional part/interaction is required | Ordinary grasping or the presence of a tool |
| P · Pose alignment | A specified pose or insertion tolerance matters | Every successful placement |
| S · Order & stages | A temporal order or transition is specified and checked | Left-to-right final arrangement; “one by one” |
| M · Multiple objects | Multiple target objects must meet the goal | Props, repeated button presses, or memory |
| H · History dependence | Earlier observations are necessary without current-observation shortcuts | Occlusion alone or repeated training layouts |

| Scenario | Website correction / remaining assessment |
| --- | --- |
| Imitate Sorting Sequence | G/S/M, H candidate. Remove the old generic R assignment; verify demonstration playback and full-order holdout. |
| Cover Blocks | G/R/S/M, H candidate. Audit head and wrist cameras and every model-visible state field for color leakage. |
| Press by Number | G/F/S, H candidate; remove M. Parameterize the checker for both stage orders; audit counters and visible button state. |
| Insert Key | F/P, S candidate; remove M. Final depth/pose does not verify handover or insert-before-turn. |
| Make Toast | F/P/M, S candidate. Verify the lever follows insertion; do not claim physical cooking fidelity. |
| Pour by Language | G/R/F/M, S candidate. Resolve trigger-query semantics and record stage events. |
| Arrange Largest Number | G/R/P/M. No S/H from final order or a recovery initial state. |
| Solve Equation | G/R/P for the base task; M only for the three-equation variant. Keep arithmetic reasoning in the task specification. |
| Hang Mugs / Insert Tubes | F/P/M. Hook/slot geometry matters; repeated insertion alone does not establish S. |
| Stack Blocks | R/M. Incidental textures do not establish G; do not invent an order constraint. |
| Fold Clothes | Keep R from the batch table; physical setting is deformable. Audit the stage checker before promoting S from the scene-axis narrative. |
| Play Stacking Toy | Preserve G/F/P/M. The new ordered-group variant needs explicit S eligibility and a process checker; the source tag column and variant description are not fully aligned. |
| Pack Objects into Box | Preserve R/M. Left-facing orientation motivates a P review, but the tolerance/checker must be frozen. |
| Store Tools in Toolbox | Preserve G/R/F/P/M from the proposal; review whether F measures functional interaction or only shape-slot matching. It is not tool use. |
| Pick from Conveyor by Image | G/R; dynamic physical setting. Resolve the instruction/checker mismatch about which object must rise 8 cm. |
| Tic-Tac-Toe | G/R/P/S/M. Alternating legal moves to fill a board, not game-winning ability; no adopted behavioral OOD. |
| Board Pattern Placement | R/P/M remain candidates. Separate task contract; no opponent and free placement order. |
| Sweep / Key / Pen Holder / Bottles | Handover or support requirements need process evidence. Do not infer synchronized bimanual coordination from terminal success. |

All six H assignments remain candidates: Imitate, Cover, Press, Match-and-Pick, Swap Blocks, and Swap T. To qualify H, specify the observation interface, construct cases with ambiguous current observations and different required actions, check all sensors/state for leakage, and compare current-observation and history-enabled baselines. This is episode memory, not memorization of training layouts.

Multiple-tag filters use intersection. Tag-level sample sets overlap: report each set's task/episode denominator, compute an overall task average from unique tasks, and do not sum tag counts or treat tag averages as independent votes. R intentionally includes explicit goal regions; it should not be marketed as a pure test of relational reasoning.

## Split and replay requirements

- Keep ID, visual OOD, semantic OOD, behavioral OOD, and recovery in cohort metadata, outside the capability tag list.
- V1–V7 test individual visual factors; V8 is combined. Pair clean/shifted initial layouts and keep geometry/physics fixed when testing only appearance. Replacing geometry is an object/physics shift, not automatically a visual-only intervention.
- Semantic paraphrases preserve the exact goal. A changed mapping or instruction rule is not merely a paraphrase.
- Distinguish held-out combinations (e.g. complete demonstration orders), length/count transfer (four to five digits; one to three independent equations), and unseen rules (descending to ascending). Do not pool all three as “compositional generalization.”
- The Imitate pilot's 100 official episodes yield 69 orders; the proposed 80/20 split retains those orders in training. The behavioral holdout needs independently reserved full orders. A small pilot budget does not prove generalization.
- A wrong initial arrangement tests correction from a supplied state. Online recovery additionally needs a physical error prefix, full simulator and task-controller state (counters/history included), a controlled handover point, and a fixed remaining budget. Select eligible recovery opportunities independently of later model success.
- Pin task/checker revision, asset hashes, initial state, seed, camera configuration, demonstration trajectory/playback, control frequency, action chunk length, and time budget. Validate outcomes and event logs, not bit-identical videos alone.

## Metric assessment and presentation

| Track | Suitable core structure | Qualification |
| --- | --- | --- |
| T1 · Embodied Agency | A/B/C, nine subdimensions | A shared harness compares VLM agents and records structured next-action outputs. The 32 displayed entries are not 32 independent main metrics. A3 and B1 each contain alternative protocols. AS-F1/POA cover the full planning set; EPR/CGS use a symbolic audit subset. CPE and RoA remain deferred; BF1/mMAE are diagnostics. |
| T2 · Physical Foresight | A video, B actions, C interaction, D intervention | Preserve all 18 report items. AF-div measures conditional sensitivity, not correctness. Brier/boundary error are extensions. Correlated PSNR/M-MSE do not receive two independent votes. JEPA remains distribution-level; AF evidence remains counterfactual-group-level. |
| T3 · Simulation Deployment | Outcome + L1/L2/L3 + generalization, safety, efficiency | 88 entries are report fields, not a flat leaderboard score. Keep target/action accuracy, local once/end completion, subgoal progress, stage transitions, retention, chain success and recovery central. Components, trajectory diagnostics, and optional reference-based efficiency remain separately discoverable. |
| T4 · Real-World Deployment | Success/progress plus observable manual review | Use trial videos, event logs and a frozen rubric. Three independent evaluators score each rubric item 1–3; report agreement/disagreements alongside means. Safety/rubric ratings do not replace capability outcomes. Telemetry-dependent quantities remain unavailable without sensors. |

### Leaderboard Overall amendment · 2026-10-12

The report-field cautions above still apply: heterogeneous raw metrics are not
averaged. The cross-setting leaderboard may additionally show one Overall only
after each Track has exported a frozen 0–100 dimension-macro score for every
selected unique scene and each of the five regimes:

`Overall = 0.2 × ID + 0.2 × Visual OOD + 0.2 × Semantic OOD + 0.2 × Behavioral OOD + 0.2 × Recovery`.

Aggregation is episode → unique scene → capability dimension → setting →
Overall. Diagnostics, gates, coverage, sample counts, and confidence intervals
do not enter the formula. Missing or duplicate scene-setting evidence, an
incomplete regime, or a score outside 0–100 yields `—`; it is never zero and
the other weights are not renormalized. Scene filters may change the selected
unique-scene macro. Metric search, hidden columns, and metric facets may not
change it.

Additional interpretation requirements:

- Report TSR with N, uncertainty, exclusions and cohort identity. The default key view retains N/SR95/artifact quality as context, not capability measures.
- Target accuracy requires eligible first-selection opportunities and coverage. Intention proximity is a diagnostic/extension, not correctness.
- Structured-action components are not independent of exact match. Preserve their denominators and missing-component masks.
- Local once/end completion, their difference, and drop rate are related; do not count their arithmetic redundancy as new abilities. Distinguish grasp stability from transport drop and defined contact loss.
- Freeze stage vocabulary, temporal tolerance, retained predicates, and recovery eligibility. Stage reach and conditional completion have different denominators. Natural and injected failures require separate cohorts.
- Path length, smoothness, time and speed need success-conditioned interpretation, safety context, sampling/chunk contracts and censored failures. No universal “faster is better” for speed or displacement. PRIDE's scorer/filters and Action Efficiency's effective-action contract remain pending.
- Retention, absolute drop and relative drop derive from the same paired SRs; include raw clean/shifted SR. A retention ratio is undefined when clean SR is zero. Cross-embodiment and sim-to-real gaps require genuinely comparable paired tasks.
- Counts (collision/slip/intervention totals), per-episode event rates and severity are different quantities. Safety monitors and manual review rules must define admissible contact and adjudication.
- Historical T1/T2 results remain under their original protocols. They do not fill blank cells in new contracts. Hardware never borrows simulation scores.

Navigation separates **dimension**, **required evidence**, **protocol state**, and **result availability**. “In the plan” does not assert implementation readiness. All entries remain available; no scores were created or recomputed.

The interval description was also corrected: a narrower success-rate interval means less posterior uncertainty under its sample/prior assumptions, not more stable robot control.
