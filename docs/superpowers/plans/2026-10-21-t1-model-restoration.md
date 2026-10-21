# T1 model restoration and public metric names

**Goal:** Restore the other models' existing scores, leave unrecorded values empty, and describe metrics in public-facing capability names. The user's final instruction excludes the old DeepSeek row.

**Architecture:** A presentation-only adapter combines the unchanged result bundles and existing catalog. Model-specific publication metadata selects the saved formula, scope and episode version. The table and dialogs use a small label/summary dictionary without changing metric IDs or scores.

**Constraints:** No scoring/exporter/model run, no new production scores, no zero filling, no new aggregates. Preserve exact video identity and the distinction between peak and mean progress. Keep work on the existing isolated feature branch; do not deploy.

- [x] Add `app/data/t1-leaderboard-results.ts` and its eight tests: seven model identities, direct score copies, empty cells, immutable source JSON and exact legacy episode joins.
- [x] Extend model/episode types with optional publication and result-version metadata; use that metadata for formulas, scope and selection.
- [x] Add `metric-presentation.ts`, capability headings, tooltips and simple metric summaries; preserve the underlying scoring-rule text.
- [x] Show recorded zero as `0.00`, unrecorded cells as empty, and saved peak progress in its own column.
- [x] Restore fifteen existing videos to ignored local media storage, verify copied bytes and SHA, and extend the Vite bridge to the existing legacy media route.
- [x] Test stale-version rejection, missing-cell rendering, capability names, initial-only formulas and the original five-scene scope.
- [x] Run focused tests, built-route checks, typecheck, lint, build and browser desktop/mobile/model-switching verification.
- [x] Review and commit the owned diff, sync the feature branch to 5403, and deliver the updated preview.
