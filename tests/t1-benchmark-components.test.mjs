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
  scope: { taskCount: 2, sceneCount: 4, processSlotCount: 10, layoutIds: [100000, 100012], taskIds: ["task-a", "task-b"] },
  models: ["alpha", "beta"].map((id) => ({ id, label: `Fixture ${id}`, requestModel: id, scores })),
  tasks: [{ id: "task-a", label: "Fixture task A" }, { id: "task-b", label: "Fixture task B" }],
  episodes: [episode("alpha", "task-a", 100000), episode("alpha", "task-b", 100000), episode("alpha", "task-b", 100012), episode("beta", "task-b", 100000)],
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

test("repeated scene IDs join on both model and task; parent switches choose a valid first scene", () => {
  const { firstBenchmarkSelection, findBenchmarkEpisode } = loadComponents()(component("t1-benchmark-view"));
  const first = firstBenchmarkSelection(fixture, "alpha");
  assert.deepEqual(first, { modelId: "alpha", taskId: "task-a", layoutId: 100000 });
  assert.equal(findBenchmarkEpisode(fixture, { ...first, taskId: "task-b" }).id, "alpha-task-b-100000");
  const switched = firstBenchmarkSelection(fixture, "beta");
  assert.deepEqual(switched, { modelId: "beta", taskId: "task-b", layoutId: 100000 });
  assert.equal(findBenchmarkEpisode(fixture, switched).id, "beta-task-b-100000");
  assert.equal(findBenchmarkEpisode(fixture, { ...switched, taskId: "task-a" }), undefined);
  assert.equal(findBenchmarkEpisode(fixture, { ...switched, layoutId: 100012 }), undefined);
});

test("current page uses the requested column order and only its exact default video", () => {
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
});

test("video and execution facts preserve selected task identity and a measured zero", () => {
  const { T1BenchmarkViewer } = loadComponents()(component("t1-benchmark-viewer"));
  const selected = fixture.episodes[2];
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
