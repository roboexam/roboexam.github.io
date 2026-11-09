# Scenario and metric review · updated 2026-11-04

## Current simulation requirement tags: scheme A

The adopted Feishu “仿真批量方案V2” contains 24 final simulation scenes. On 2026-11-04 the user adopted scheme A: merge H and S into T, preserving memory, task-level order/prerequisites, and duration/event timing as temporal subtypes. These are overlapping task requirements, not independently isolated model abilities or accepted-episode counts. The separate C1–C7 model-capability spectrum remains unchanged.

Source: https://zitd5je6f7j.feishu.cn/wiki/NtdQw2iUDi4pUqkUJFVcvyEFnxe . The Feishu V2 table and `app/data/scenario-plan.ts` are aligned. `simulationV2ScenarioIds` explicitly scopes the 24-scene coverage; the 39-entry registry retains historical catalog tasks for browsing. Generated catalogs, original episode tags/hashes, formal result bundles, task mechanics, and training/evaluation splits are unchanged.

| Main tag | Keep when | Planned scenes / 24 |
| --- | --- | --- |
| G · Object grounding | Identity, category, or attribute selects the target | 12 / 24 (50.0%) |
| R · Spatial goals | An object–region or object–object goal relation is checked | 13 / 24 (54.2%) |
| F · Functional interaction | A functional part or interaction matters beyond ordinary grasping | 10 / 24 (41.7%) |
| P · Pose alignment | A specified pose or insertion tolerance matters beyond reaching a region | 11 / 24 (45.8%) |
| T · Temporal & stage control | History, task-level order/prerequisites, or a task-specific hold/event window matters | 13 / 24 (54.2%) |
| M · Multiple objects | Several target objects must satisfy goals | 14 / 24 (58.3%) |

Do not infer T from a final left-to-right arrangement, freely ordered object completion, generic pick/move/place steps, or ordinary terminal settling. Behavioral OOD eligibility is independent of T eligibility. The same scene counts once for T even when it has several temporal subtypes.

| Temporal attribute | Meaning | Qualification |
| --- | --- | --- |
| T-H · History dependence | Earlier information cannot be recovered from the current model-visible observation | All four current memory assignments remain candidates pending camera/state leakage and history-interface checks |
| T-S · Order & prerequisite stages | A prescribed program, semantic stage, or physical prerequisite constrains the process | Some event checkers and handover evidence still need validation; the tag is planned coverage |
| T-D · Hold duration & event timing | Sustained validity, an external cue, or a task-specific response window matters | Retain continuous-time, contact and irreversible-failure conditions; ordinary placement settling is insufficient |

| Final V2 scene | Main tags | Temporal attribute / scope |
| --- | --- | --- |
| Imitate Sorting Sequence | G/T/M | T-H candidate; T-S |
| Classify Objects by Language | G/R/M | Free execution order |
| Pour Liquid into Cup | R/F/T | T-S: align → pour → return upright |
| Arrange Largest Number | G/R/P/M | Final descending arrangement, free grasp order |
| Solve Equation | G/R/P/M* | M only in the three-equation behavioral variant |
| Pack Mixed Objects into Box | R/T/M | T-S: specified four-role program |
| Hang Mugs | F/P/M | Free order and available hooks |
| Cover Blocks | G/R/T/M | T-H candidate; T-S |
| Press by Number | G/F/T | T-H candidate; T-S; repeated presses do not imply M |
| Play Stacking Toy | G/F/P/T/M | T-S: finish each shape group before the next |
| Store Tools in Toolbox | G/R/F/P/M | Shape-slot storage, not tool use |
| Fold Clothes | R/T | T-S: instructed three-part fold program; process/B qualification remains conditional |
| Stack Bowls | R/M | No prescribed bowl order |
| Match and Pick from Conveyor | G/T | T-H candidate; no basket or placement requirement |
| Push T | R/P | A rigid T block; enforce the no-lifting rule |
| Insert Key | F/P/T | T-S: insert before turning; verify process/handover evidence |
| Build Tower | R/P/T/M | T-S: supports before boards/upper layers; equivalent placements remain free |
| Find Category Outlier | G | Three candidates, one target |
| Set Button Colors | G/F/M* | M only when both buttons need changes; free button order |
| Place Between References | R | One target, no fine orientation or language-based selection |
| Mirror Pair Layout | G/R/P/M | Visible reference; free placement order |
| Clear Keyboard, Then Close Laptop | F/T/M | T-S: release/settle obstacle before closing |
| Hold Water Mug | F/P/T | T-D: continuous valid hold with native fluid/tilt constraints |
| Hold Button Until Cue | F/P/T | T-S and T-D: mallet contact → cue → timed release |

The T-H candidates are Imitate Sorting Sequence, Cover Blocks, Press by Number, and Match and Pick from Conveyor. Historical Swap Blocks / Swap T memory annotations remain available outside the final 24-scene denominator. Moving a visible-object completion checklist into T-H is not justified. No memory variants or new collection runs were added by this migration.

Overview coverage includes explicitly scoped variants, so it does not imply every episode in a tagged scene tests that requirement. `*` means variant-only; `?` marks candidate eligibility. Tag filters use intersection. Report each task/episode denominator, average overall results from unique scenes, and do not sum overlapping tag counts as independent evidence.

## Earlier metric review scope

The 2026-10-10 review used the V1 batch plan and metric proposals in `UniEmbodied-Bench (RoboExam).md`, `level1 VLM metrics设计最新（初步final）.md`, `ACWM metrics设计方案.md`, and `Policy Model指标（优化）.md`. The metric assessment below is retained separately from the current V2 tag migration. Metrics remain a layered reporting framework rather than an arbitrary equal-weight average of raw fields.

## Split and replay requirements

- Keep ID, visual OOD, semantic OOD, behavioral OOD, and recovery in cohort metadata, outside the capability tag list.
- V1–V7 test individual visual factors; V8 is combined. Pair clean/shifted initial layouts and keep geometry/physics fixed when testing only appearance. Replacing geometry is an object/physics shift, not automatically a visual-only intervention.
- Semantic paraphrases preserve the exact goal. A changed mapping or instruction rule is not merely a paraphrase.
- Distinguish held-out combinations, length/count transfer, and unseen rules. Current Arrange Largest Number uses descending four/five-digit training support and four-digit set holdouts; Solve Equation retains the one-to-three independent-equation behavioral variant. Do not pool distinct mechanisms as “compositional generalization.”
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
