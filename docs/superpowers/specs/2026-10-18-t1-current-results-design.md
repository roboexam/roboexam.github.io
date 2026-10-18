# Track 1 current results and execution evidence

Approved direction: user on 2026-10-18 requests publishing the four-model Stack Bowls results to Track 1, treating this as the current release, with minimal labeling and gradual task expansion. Stack Bowls supplies the currently available Track 1 overview; it does not fabricate measurements for other tasks or regimes.

## Scope

Only Track 1 presentation, its versioned data adapter/exporter, and allowlisted media. Preserve Track 2/3/4 values, legacy VLM sources, navigation style, and existing production topology. Source baseline main@8137a0f2039f52ccd3c8b45eb4e8e89a24281e0f; implementation worktree /bh/zbh_self/projects/roboexam-t1-vlm-results-20261018 on codex/t1-vlm-results-20261018. Never build in the shared live checkout.

## Product

Track 1 opens on a compact four-model results table and an execution viewer. Use the existing English visual language. Header: Stack Bowls, 5 layouts, 4 models. Main columns: Initial VQA score, A1, A2, B1, C1, C2, C3, answer coverage, observed native progress, and an episode action. C2/C3 are null and shown as an em dash. Label the first score Initial VQA, not the existing five-regime Overall. Other tasks are added when measurements exist. Keep old September plans and old Qwen/Cosmos results reachable under one secondary Previous protocols control; do not label the new page Pilot or Provisional.

Model selection and layout selection expose the exact chosen video, steps, observed native progress, stop reason and question coverage. Default to GPT-6 Astra/layout136, with all five layouts selectable. Reset player state when the model/layout/record changes. One-frame Kimi records show Initial view, not a moving execution claim. Render controls, playsInline and metadata preload, never autoplay every video. Details contain scorer provenance and concise interpretation, including the existing C1 parameter matching limit and historical initial-answer reuse. Do not flood the main page with warnings. Native progress 15/100 is distinct from task success; null outcomes remain null. A rerun attempt is not the benchmark Recovery regime.

No new inference, simulation, rescoring, manual score correction, or changes to frozen source records. Use offline report dbe0180c90a33e30fb8c6bf7318efbfee1c43cff927dc8c6fe7a9e026c65e294 exactly. Model aggregate A/B/C/composite and question rows come from that report. Keep Kimi 22/25 coverage; nulls are not zeros. C1 measured zeros remain zeros with the scoring interpretation in Details. Public data has stable IDs, units, hashes and result versions, no private truth, context transcripts, API credentials/endpoints or absolute filesystem paths.

## Shared publication contract

Source publication root, subject to layout_guard evaluation_run validation:
/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-stack-bowls-20261018-v1

Immutable source packet contains sources/initial-rescore.json, selected historical execution metadata, and media/<videoId>.mp4 plus publication-manifest.json. Source files and original episodes remain read-only. Media is copied and hashed, not committed to Git. Exporter checks source hashes, 20 unique model/layout records, 4 models x 5 layouts, 100 expected questions, 97 normal first answers, null states, aggregate agreement and exact media identity. It must not inherit old ACWM 100-episode or old VLM 12-metric schemas.

Public bundle file: app/data/generated/t1-agent-results.json
Typed adapter: app/data/t1-agent-results.ts
Exports: t1AgentResults, type T1Scores, type T1Model, type T1Episode.

T1Scores fields (all number|null, 0-100): count, color, a1, a2, b1, c1, a, b, c, composite.
T1Model: id, label, family, requestModel, responseModel, answered, expected, scores:T1Scores, maxProgress:number|null.
T1Episode: id, modelId, layoutId:number, answered, expected, scores:T1Scores, execution:{steps:number,progress:number|null,success:boolean|null,state:string,reason:string,elapsedSeconds:number|null}, video:{id,url,sha256,bytes,frames:number|null,fps:number|null,hasMotion:boolean}, provenance:{initialSealSha256,executionSealSha256,sameEpisode:boolean,attempt:string}.
Top-level: schemaVersion='roboexam.t1-results.v1', resultVersion='t1-stack-bowls-20261018-v1', generatedAt, task:{id:'stack_bowls',label:'Stack Bowls',layoutIds:[124,136,125,138,134]}, models:T1Model[], episodes:T1Episode[], scorer:{commit,policy,reportSha256,notes:string[]}, sourceHashes:{[name:string]:string}.
Model IDs: deepseek, mimo, kimi, gpt6-astra. Labels: DeepSeek v4.1 Flash, MiMo v2.6 Pro, Kimi K3, GPT-6 Astra. These IDs belong to this results adapter and do not overwrite old protocols' model identities.

MP4 URLs: /api/t1-media/<video.id>. Media route resolves only IDs from the generated bundle, under DASHBOARD_T1_MEDIA_ROOT or the source publication root's media subdirectory. Serve GET/HEAD with byte ranges and immutable cache headers; reject traversal/unknown IDs, wrong physical size and cross-record mappings. Runtime root stays server-side.

## Implementation boundaries

Data worker owns scripts/t1-agent-result-registry.mjs, scripts/export-t1-agent-results.mjs, app/data/t1-agent-results.ts, app/data/generated/t1-agent-results.json and tests/t1-agent-results.test.mjs.
UI worker owns app/components/t1/, app/t1-results.css and Track1-only integration in app/components/leaderboard-view.tsx (add CSS import in app/layout.tsx if necessary). Shared old Track2/3/4 render path stays unchanged. Do not edit global old metric formulas to fit this new contract.
Media worker owns only the external immutable publication root and a source-packet builder under scripts/build-t1-publication.py; it reports actual source/manifest hashes to the data worker.
Root owns media route, package scripts/gates, docs, dependency/build setup, integration, browser validation and production release.

## Acceptance

Data tests reject duplicate IDs, null-to-zero substitutions, source/media hash drift, unsafe URLs/paths, aggregate disagreement and mismatched model/layout videos. npm run typecheck, lint, test, build and test:render pass in the independent worktree; unrelated pre-existing failures are recorded without weakening gates. Browser verifies Track1 default, all model/layout switches, nulls, video Range/seek, metric details, narrow layout, and navigation to other tracks. Existing media receipts can be reused for unchanged files; new files require actual hashing. Merge only into clean main after checking intervening changes. Deployment uses the existing managed ops script and fixed URL checks, with separately reported committed/merged/deployed/live-verified states. No additional approval is required for already requested publication after these checks.
