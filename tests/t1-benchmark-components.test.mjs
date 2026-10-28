import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const scores = { overall: 30, vqa: 100, subtask: 0, success: 0, a: 100, b: 100, c: 100, a1: 100, a2: 100, c1: 100, c2: 100, c3: 100 };
const metrics = Object.keys(scores).map((id) => ({ id, label: id === "overall" ? "Overall" : id.toUpperCase(), definition: "Synthetic test definition", formula: id === "overall" ? "Overall = 0.7 × Subtask + 0.3 × VQA" : "Synthetic formula", aggregation: "Synthetic aggregation", unit: "percent" }));
function episode(modelId, taskId, layoutId) {
  const id = `${modelId}-${taskId}-${layoutId}`;
  return { id, modelId, taskId, layoutId, attempt: "attempt_02", scores,
    execution: { steps: 123, subtask: 0, success: false, elapsedSeconds: 61 },
    video: { id, url: `/api/t1-benchmark-media/${id}`, sha256: "a".repeat(64), bytes: 100, frames: 250, fps: 25 } };
}
const fixture = {
  schemaVersion: "roboexam.t1-benchmark-results.v1", resultVersion: "synthetic-fixture-v1", generatedAt: "2026-10-21",
  scope: { taskCount: 2, sceneCount: 10, processSlotCount: 10, layoutIds: [100000, 100001, 100002, 100003, 100004, 100007, 100012], taskIds: ["task-a", "task-b"] },
  models: ["alpha", "beta"].map((id) => ({ id, label: `Fixture ${id}`, requestModel: id, scores })),
  tasks: [{ id: "task-a", label: "Fixture task A" }, { id: "task-b", label: "Fixture task B" }],
  episodes: [
    ...[100000, 100001, 100002, 100003, 100004].map((layoutId) => episode("alpha", "task-a", layoutId)),
    ...[100000, 100001, 100003, 100007, 100012].map((layoutId) => episode("alpha", "task-b", layoutId)),
    episode("beta", "task-b", 100000),
  ],
  metrics, provenance: { sourceHashes: {}, publicationScopeId: "synthetic-only" },
};

// Load actual components with only their formal-data import replaced by a named fixture.
function loadComponents() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } });
    const compiledModule = { exports: {} };
    cache.set(filename, compiledModule.exports);
    const runtimeRequire = createRequire(filename);
    function requireModule(name) {
      if (name === "../../data/t1-benchmark-results") return { t1BenchmarkResults: fixture };
      if (name === "../../data/t1-leaderboard-results") return { t1LeaderboardResults: fixture };
      if (!name.startsWith(".")) return runtimeRequire(name);
      const base = resolve(dirname(filename), name);
      const target = [base, `${base}.tsx`, `${base}.ts`].find(existsSync);
      assert.ok(target, "Missing actual component dependency: " + name);
      return load(target);
    }
    new Function("require", "module", "exports", compiled.outputText)(requireModule, compiledModule, compiledModule.exports);
    cache.set(filename, compiledModule.exports);
    return compiledModule.exports;
  }
  return load;
}
const component = (name) => resolve(root, "app/components/t1", `${name}.tsx`);

test("model switches preserve the shared task scope without borrowing another model's episode", () => {
  const { firstBenchmarkSelection, findBenchmarkEpisode } = loadComponents()(component("t1-benchmark-view"));
  const first = firstBenchmarkSelection(fixture, "alpha");
  assert.deepEqual(first, { modelId: "alpha", taskId: "task-a", layoutId: 100000 });
  assert.equal(findBenchmarkEpisode(fixture, { ...first, taskId: "task-b" }).id, "alpha-task-b-100000");
  const blank = firstBenchmarkSelection(fixture, "beta", "task-a");
  assert.deepEqual(blank, { modelId: "beta", taskId: "task-a", layoutId: 100000 });
  assert.equal(findBenchmarkEpisode(fixture, blank), undefined);
  const switched = firstBenchmarkSelection(fixture, "beta", "task-b");
  assert.deepEqual(switched, { modelId: "beta", taskId: "task-b", layoutId: 100000 });
  assert.equal(findBenchmarkEpisode(fixture, switched).id, "beta-task-b-100000");
  assert.equal(findBenchmarkEpisode(fixture, { ...switched, taskId: "task-a" }), undefined);
  assert.equal(findBenchmarkEpisode(fixture, { ...switched, layoutId: 100012 }), undefined);
});

test("current page shows five scene previews and the exact selected main video", () => {
  const { T1BenchmarkView } = loadComponents()(component("t1-benchmark-view"));
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkView, { results: fixture }));
  const headers = [...html.matchAll(/class="t1bMetricHeading"[^>]*[\s\S]*?<span>(.*?)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(headers.slice(0, 4), ["Overall", "VQA", "Subtask", "Success"]);
  assert.match(html, /data-episode-id="alpha-task-a-100000"/);
  assert.match(html, /src="\/api\/t1-benchmark-media\/alpha-task-a-100000"/);
  assert.doesNotMatch(html, /src="[^"]*(?:beta|alpha-task-b)/);
  assert.doesNotMatch(html, /not measured|not yet included|missing|incomplete|autoplay/i);
  assert.match(html, /preload="metadata"/);
  assert.match(html, /playsInline=""/i);
  assert.deepEqual([...html.matchAll(/data-rollout-slot="(\d+)"/g)].map((match) => match[1]), ["1", "2", "3", "4", "5"]);
  assert.equal([...html.matchAll(/<video\b/g)].length, 6);
  assert.match(html, /aria-label="Select scene 100000" aria-pressed="true"/);
  assert.doesNotMatch(html, /Rollout scene<|aria-label="Rollout scene"/);
});

test("the five scene positions are task-specific rather than the union of every task's IDs", () => {
  const { benchmarkTaskLayoutIds, firstBenchmarkSelection } = loadComponents()(component("t1-benchmark-view"));
  assert.deepEqual(benchmarkTaskLayoutIds(fixture, "task-a"), [100000, 100001, 100002, 100003, 100004]);
  assert.deepEqual(benchmarkTaskLayoutIds(fixture, "task-b"), [100000, 100001, 100003, 100007, 100012]);
  assert.deepEqual(firstBenchmarkSelection(fixture, "alpha", "task-b"), { modelId: "alpha", taskId: "task-b", layoutId: 100000 });
});

test("a model without recordings keeps five blank scene cards and clears all prior video and execution facts", () => {
  const { T1BenchmarkView } = loadComponents()(component("t1-benchmark-view"));
  const blankResults = { ...fixture, models: [fixture.models[1], fixture.models[0]] };
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkView, { results: blankResults }));
  const viewer = html.slice(html.indexOf('<section class="t1bViewerSection"'));
  assert.equal([...viewer.matchAll(/data-rollout-slot=/g)].length, 5);
  assert.equal([...viewer.matchAll(/disabled=""/g)].length, 5);
  assert.match(viewer, /Fixture beta, Fixture task A, rollout player/);
  assert.match(viewer, /value="task-b"/);
  assert.match(viewer, /value="alpha"/);
  assert.doesNotMatch(viewer, /<video|data-episode-id|data-vqa-episode-id|VQA results|Selected execution|Subtask score|Failure|not available|missing|coming soon/i);
});

test("video and execution facts preserve selected task identity and a measured zero", () => {
  const { T1BenchmarkViewer } = loadComponents()(component("t1-benchmark-viewer"));
  const selected = fixture.episodes.find((item) => item.id === "alpha-task-b-100012");
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkViewer, {
    episode: selected, modelLabel: "Fixture alpha", taskLabel: "Fixture task B", resultVersion: fixture.resultVersion,
  }));
  assert.match(html, /data-task-id="task-b"/);
  assert.match(html, /data-layout-id="100012"/);
  assert.match(html, /data-result-version="synthetic-fixture-v1"/);
  assert.match(html, /src="\/api\/t1-benchmark-media\/alpha-task-b-100012"/);
  assert.match(html, /<dd>0\.00<small> \/ 100<\/small>/);
  assert.match(html, /Failure/);
  assert.doesNotMatch(html, /beta-task|alpha-task-a/);
});

test("metric details expose the real weighting and scoped calculation without page footnotes", () => {
  const { T1BenchmarkMetricDialog } = loadComponents()(component("t1-benchmark-metric-dialog"));
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkMetricDialog, {
    metric: metrics[0], model: fixture.models[0], results: fixture, onClose() {}, onMetric() {},
  }));
  assert.match(html, /Overall = 0\.7 × Subtask \+ 0\.3 × VQA/);
  assert.match(html, /0\.70 × 0\.00 \+ 0\.30 × 100\.00 ≈ 30\.00/);
  assert.match(html, /综合衡量原生任务执行与视觉问答推理表现/);
  assert.match(html, /Input &amp; output · 输入与输出/);
  assert.match(html, /Published Subtask and VQA scores/);
  assert.match(html, /Evaluation scope/);
  assert.match(html, /Process slots/);
  assert.match(html, /synthetic-fixture-v1/);
});

test("public metric headings describe abilities and expose a short explanation", () => {
  const { metricDisplayLabel, metricDisplayFormula, metricSummary, metricSummaryZh } = loadComponents()(resolve(root, "app/components/t1/metric-presentation.ts"));
  const labels = { a1: "Recognition", a2: "Localization", a3: "Relations", b1: "Goals", b3: "Constraints", b_interaction: "Interaction", c1: "Planning", c2: "Task Tracking", c3: "Next Action" };
  for (const [id, label] of Object.entries(labels)) {
    assert.equal(metricDisplayLabel({ id, label: id }), label);
    assert.ok(metricSummary({ id }).length > 20);
    assert.match(metricSummaryZh(id), /[\u4e00-\u9fff]/);
  }
  assert.equal(metricDisplayFormula("(A + B + C1) / 3"), "(Perception + Understanding + Planning) / 3");
  assert.equal(metricDisplayFormula("(C1 + C2 + C3) / 3"), "(Planning + Task Tracking + Next Action) / 3");
});

test("every VQA metric exposes a branch-sourced QA template while execution metrics expose input and output", () => {
  const { metricQaTemplate, metricIoContract, t1VqaMetricIds } = loadComponents()(resolve(root, "app/components/t1/metric-presentation.ts"));
  assert.equal(t1VqaMetricIds.length, 13);
  assert.equal(new Set(t1VqaMetricIds).size, 13);
  for (const id of t1VqaMetricIds) {
    const template = metricQaTemplate(id);
    assert.ok(template, id);
    assert.match(template.source, /ID24/);
    assert.ok(template.sourceId.length > 8);
    assert.ok(template.question.length > 20);
    assert.match(template.questionZh, /[\u4e00-\u9fff]/);
    assert.ok(template.answerFormat.startsWith("{"));
  }
  for (const id of ["overall", "subtask", "success"]) {
    const contract = metricIoContract(id);
    assert.ok(contract, id);
    assert.match(contract.input.zh + contract.output.zh, /[\u4e00-\u9fff]/);
  }
});

test("VQA metric details render a bilingual question and answer-format example, not a claimed answer", () => {
  const { T1BenchmarkMetricDialog } = loadComponents()(component("t1-benchmark-metric-dialog"));
  const metric = metrics.find((item) => item.id === "a1");
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkMetricDialog, {
    metric, model: fixture.models[0], results: fixture, onClose() {}, onMetric() {},
  }));
  assert.match(html, /QA template example · 问答模板样例/);
  assert.match(html, /arrange_largest_number\.revised\.total_digit_count/);
  assert.match(html, /需要把多少个数字块放到垫板上/);
  assert.match(html, /Answer format · 回答格式/);
  assert.match(html, /Format example only; it is not a scored answer/);
});

test("unknown scores render empty cells while measured zeros stay visible", () => {
  const { T1BenchmarkTable } = loadComponents()(component("t1-benchmark-table"));
  const unknown = { id: "unscored", label: "Fixture unscored", scores: Object.fromEntries(Object.keys(scores).map(id => [id, null])) };
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkTable, {
    models: [fixture.models[0], unknown], metrics, selectedModelId: "alpha", viewerId: "fixture-viewer", onMetric() {}, onSelectModel() {}, playableModelIds: new Set(["alpha"]),
  }));
  const unscoredRow = html.slice(html.indexOf("Fixture unscored"), html.lastIndexOf("</tr>"));
  assert.match(unscoredRow, /data-metric-id="overall" class="t1bOverall"><\/td>/);
  assert.match(unscoredRow, /data-metric-id="vqa"><\/td>/);
  assert.doesNotMatch(unscoredRow, /0\.00|—|N\/A|t1bScore/);
  assert.match(html, /Subtask: 0\.00/);
  assert.doesNotMatch(html, /Define A1|Define C2/);
});

test("an earlier result version never borrows current episode evidence", () => {
  const { findBenchmarkEpisode } = loadComponents()(component("t1-benchmark-view"));
  const scoped = structuredClone(fixture);
  scoped.models[0].publication = { resultVersion: "earlier-fixture", sourceModelId: "alpha", scope: { taskCount: 1, sceneCount: 1, processSlotCount: null } };
  assert.equal(findBenchmarkEpisode(scoped, { modelId: "alpha", taskId: "task-a", layoutId: 100000 }), undefined);
  scoped.episodes[0].resultVersion = "earlier-fixture";
  assert.equal(findBenchmarkEpisode(scoped, { modelId: "alpha", taskId: "task-a", layoutId: 100000 }).id, "alpha-task-a-100000");
});

test("duplicate formal episodes never select an arbitrary attempt", () => {
  const { findBenchmarkEpisode } = loadComponents()(component("t1-benchmark-view"));
  const duplicate = structuredClone(fixture);
  duplicate.episodes.push({ ...duplicate.episodes[0], id: "different-attempt", attempt: "attempt_03" });
  assert.equal(findBenchmarkEpisode(duplicate, { modelId: "alpha", taskId: "task-a", layoutId: 100000 }), undefined);
});

test("legacy metric details use their saved formula and one-task scope", () => {
  const { T1BenchmarkMetricDialog } = loadComponents()(component("t1-benchmark-metric-dialog"));
  const initialMetric = { ...metrics.find(metric => metric.id === "vqa"), label: "Initial VQA", definition: "Saved initial questions", formula: "(A + B + C1) / 3" };
  const model = { ...fixture.models[0], publication: { resultVersion: "legacy-fixture", sourceModelId: "alpha", scope: { taskCount: 1, sceneCount: 5, processSlotCount: null }, metricOverrides: { vqa: initialMetric } } };
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkMetricDialog, { metric: initialMetric, model, results: fixture, onClose() {}, onMetric() {} }));
  assert.match(html, /Initial VQA/);
  assert.match(html, /\(Perception \+ Understanding \+ Planning\) \/ 3/);
  assert.match(html, /<dt>Tasks<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Scenes<\/dt><dd>5<\/dd>/);
  assert.match(html, /legacy-fixture/);
  assert.doesNotMatch(html, /Process slots|synthetic-fixture-v1/);
});

function vqaDetail() {
  return {
    episodeId: fixture.episodes[0].id, resultVersion: fixture.resultVersion,
    modelId: "alpha", taskId: "task-a", layoutId: 100000, attempt: "attempt_02",
    initial: [
      { questionId: "q-first", metricId: "a1", question: "How many <red> objects?", response: '{"count":2,"text":"<script>unsafe()</script>"}', score: 100, status: "scored", formatCompliant: true },
      { questionId: "q-excluded", metricId: "a2", question: "Excluded fixture question", response: null, score: null, status: "not_graded", formatCompliant: null },
    ],
    checkpoints: [
      { slotId: "task-a/100000/KEY_LIFTED", stageId: "KEY_LIFTED", status: "scored", questionId: "p-first", question: "What is completed, and what comes next?", response: '{"completed":["key lifted"]}', triggerStep: 158, returnStep: 192, scores: { c2: 100, c3: 66.66666666666666 } },
      { slotId: "task-a/100000/KEY_INSERTED", stageId: "KEY_INSERTED", status: "not_reached", questionId: null, question: null, response: null, triggerStep: null, returnStep: null, scores: { c2: 0, c3: 0 } },
    ],
  };
}

test("episode VQA overview displays the selected scene's saved scores, not the leaderboard mean", () => {
  const { T1BenchmarkEpisodeVqa } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const selected = { ...fixture.episodes[0], scores: { ...scores, vqa: 58.25, a: 80, b: 70, c: 24.75, c2: 0, c3: 50 } };
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkEpisodeVqa, {
    episode: selected, modelLabel: "Fixture alpha", taskLabel: "Fixture task A", resultVersion: fixture.resultVersion,
  }));
  assert.match(html, /VQA results/);
  assert.match(html, /VQA: 58\.25 out of 100/);
  assert.match(html, /Perception: 80\.00 out of 100/);
  assert.match(html, /Task Tracking/);
  assert.match(html, /Next Action/);
  assert.match(html, /data-vqa-episode-id="alpha-task-a-100000"/);
  assert.doesNotMatch(html, /VQA: 100\.00 out of 100|Fixture beta/);
});

test("question details preserve first answers as escaped text and keep excluded scores empty", () => {
  const { T1BenchmarkVqaEvidence } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkVqaEvidence, { detail: vqaDetail() }));
  assert.match(html, /How many &lt;red&gt; objects\?/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal([...html.matchAll(/Model first answer<\/h5>/g)].length, 2);
  const excluded = html.slice(html.indexOf("Excluded fixture question"), html.indexOf("Process checkpoints"));
  assert.match(excluded, /Not scored/);
  assert.doesNotMatch(excluded, /0\.00|Model first answer/);
});

test("process details distinguish trigger/context steps and unreached protocol zeros without inventing answers", () => {
  const { T1BenchmarkVqaEvidence } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkVqaEvidence, { detail: vqaDetail() }));
  assert.match(html, /1 answered · 2 checkpoints/);
  assert.match(html, /Native trigger step<\/dt><dd>158/);
  assert.match(html, /Returned context step<\/dt><dd>192/);
  assert.match(html, /Next Action: 66\.67 out of 100/);
  const unreached = html.slice(html.indexOf('data-vqa-slot-id="task-a/100000/KEY_INSERTED"'));
  assert.match(unreached, /Not reached/);
  assert.match(unreached, /Task Tracking: 0\.00 out of 100/);
  assert.match(unreached, /Next Action: 0\.00 out of 100/);
  assert.doesNotMatch(unreached, /Model first answer|<pre|Native trigger step/);
});

test("VQA evidence rejects stale versions, other models/scenes and different attempts", () => {
  const { sameVqaEpisode } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const detail = vqaDetail();
  assert.equal(sameVqaEpisode(detail, fixture.episodes[0], fixture.resultVersion), true);
  for (const patch of [{ modelId: "beta" }, { taskId: "task-b" }, { layoutId: 100001 }, { attempt: "attempt_01" }, { resultVersion: "stale" }, { episodeId: "stale-id" }]) {
    assert.equal(sameVqaEpisode({ ...detail, ...patch }, fixture.episodes[0], fixture.resultVersion), false, JSON.stringify(patch));
  }
  assert.equal(sameVqaEpisode(detail, { ...fixture.episodes[0], resultVersion: "different-publication" }, fixture.resultVersion), false);
});

test("VQA request state is keyed by every episode identity field", () => {
  const { vqaEpisodeIdentity } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const selected = fixture.episodes[0], original = vqaEpisodeIdentity(selected, fixture.resultVersion);
  for (const patch of [{ id: "different-episode" }, { modelId: "beta" }, { taskId: "task-b" }, { layoutId: 100001 }, { attempt: "attempt_03" }]) {
    assert.notEqual(vqaEpisodeIdentity({ ...selected, ...patch }, fixture.resultVersion), original);
  }
  assert.notEqual(vqaEpisodeIdentity(selected, "different-version"), original);
});

test("policy zeros display saved scores without fabricating answers or counting a model call", () => {
  const { T1BenchmarkVqaEvidence } = loadComponents()(component("t1-benchmark-episode-vqa"));
  const detail = vqaDetail();
  detail.initial.push({ questionId: "q-policy", metricId: "b1", question: "Policy fixture question", response: null,
    score: 0, status: "infrastructure_missing", formatCompliant: null, scoreOrigin: "policy_zero", observedScore: null });
  detail.checkpoints.push({ slotId: "task-a/100000/POLICY_STAGE", stageId: "POLICY_STAGE", status: "reached_reference_blocked",
    questionId: "p-policy", question: null, response: null, triggerStep: 1099, returnStep: 1100,
    scores: { c2: 0, c3: 0 }, scoreOrigin: "policy_zero", observedScores: { c2: null, c3: null } });
  const shared = { ...detail.checkpoints[0], slotId: "task-a/100000/SHARED_STAGE", stageId: "SHARED_STAGE", triggerStep: 161 };
  detail.checkpoints.push(shared);
  const html = renderToStaticMarkup(React.createElement(T1BenchmarkVqaEvidence, { detail }));
  assert.match(html, /1 answered · 4 checkpoints/);
  const policyInitial = html.slice(html.indexOf("Policy fixture question"), html.indexOf("Process checkpoints"));
  assert.match(policyInitial, /Goals: 0\.00 out of 100/);
  assert.doesNotMatch(policyInitial, /Model first answer|Not scored|<pre/);
  const policyCheckpoint = html.slice(html.indexOf('data-vqa-slot-id="task-a/100000/POLICY_STAGE"'), html.indexOf('data-vqa-slot-id="task-a/100000/SHARED_STAGE"'));
  assert.match(policyCheckpoint, /data-score-origin="policy_zero"/);
  assert.match(policyCheckpoint, /Checkpoint/);
  assert.match(policyCheckpoint, /Returned context step<\/dt><dd>1100/);
  assert.match(policyCheckpoint, /Task Tracking: 0\.00 out of 100/);
  assert.doesNotMatch(policyCheckpoint, /Answered|Model first answer|<pre/);
});
