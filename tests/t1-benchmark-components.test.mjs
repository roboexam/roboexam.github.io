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
  assert.doesNotMatch(viewer, /<video|data-episode-id|Selected execution|Subtask score|Failure|not available|missing|coming soon/i);
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
  assert.match(html, /0\.70 × 0\.00 \+ 0\.30 × 100\.00 = 30\.00/);
  assert.match(html, /Evaluation scope/);
  assert.match(html, /Process slots/);
  assert.match(html, /synthetic-fixture-v1/);
});

test("public metric headings describe abilities and expose a short explanation", () => {
  const { metricDisplayLabel, metricDisplayFormula, metricSummary } = loadComponents()(resolve(root, "app/components/t1/metric-presentation.ts"));
  const labels = { a1: "Recognition", a2: "Localization", a3: "Relations", b1: "Goals", b3: "Constraints", b_interaction: "Interaction", c1: "Planning", c2: "Task Tracking", c3: "Next Action" };
  for (const [id, label] of Object.entries(labels)) {
    assert.equal(metricDisplayLabel({ id, label: id }), label);
    assert.ok(metricSummary({ id }).length > 20);
  }
  assert.equal(metricDisplayFormula("(A + B + C1) / 3"), "(Perception + Understanding + Planning) / 3");
  assert.equal(metricDisplayFormula("(C1 + C2 + C3) / 3"), "(Planning + Task Tracking + Next Action) / 3");
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
