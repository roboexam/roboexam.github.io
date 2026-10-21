# Track 1 DeepSeek benchmark publication

The requested first version replaces the current Track 1 table with the completed DeepSeek publication, retaining the dashboard's existing typography, track navigation, and metric dialogs. Other tracks retain their current data and formulas. Work is isolated from the shared deployment checkout and running evaluations.

## Approved publication contract

The user confirmed the common scope: 14 tasks, five scenes per task, 70 scenes, and 207 fixed process slots. The original native16 results remain unchanged. The result version is `t1-robodojo14-deepseek-20261021-v1`.

All displayed scores use a 0–100 scale. `C = (C1 + C2 + C3) / 3`, `VQA = (A + B + C) / 3`, and `Overall = 0.7 × Subtask + 0.3 × VQA`. Initial A and B retain the formal task/group weighting; they are not reconstructed from the old Stack Bowls metric subset. Process scores use fixed slots within each scene, then five equally weighted scenes, then equally weighted tasks. Normally unreached slots contribute zero; missing or blocked evidence never becomes zero.

## Presentation and interaction

The leaderboard begins with Model, Overall, VQA, Subtask, and Success, followed by the actual capability metrics. Headers and values open definitions, formulas, aggregation, and publication scope. Present the result directly, without missing-data or unfinished-work footnotes. Keep provenance available inside the metric details.

The rollout viewer offers model, task, and scene selection. Its video and execution facts join on model, task, scene, attempt, and result version. A parent selection resets dependent choices. Native sensor MP4s show the three saved views; playback never claims an unsuccessful episode was successful. Debug/controller videos are excluded.

## Data and media boundaries

A new SHA-pinned, allowlisted exporter reads the formal initial-v2 report, native16 scored slots, and exact final execution attempts. A typed public bundle contains safe metrics, identities, source hashes, and stable media IDs. Historical Stack Bowls data remains separate. No scores are entered as frontend constants.

Videos remain outside Git. `/api/t1-benchmark-media/[id]` serves only the public catalog through the existing range-aware media service. Client requests cannot supply filesystem paths. Local source snapshots and media reside in ignored `.local/t1-benchmark/`; a deployment can configure `T1_BENCHMARK_MEDIA_ROOT`.

## Verification and delivery

Validate source identity, exact scope, macro aggregation, fixed denominators, null semantics, and media isolation. Run typecheck, lint, build, relevant unit tests, and rendered route checks. Verify metric dialogs, real video playback, scene changes, track navigation, and desktop/mobile presentation in the browser. Deliver an isolated preview and reviewed commit; production deployment is a separate explicit action.
