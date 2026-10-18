import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const scores = { count: 100, color: 100, a1: 100, a2: 25, b1: 50, c1: 0, a: 62.5, b: 50, c: 0, composite: 37.5 };
const models = ["deepseek", "mimo", "kimi", "gpt6-astra"].map((id) => ({
  id, label: id === "gpt6-astra" ? "GPT-6 Astra" : id, family: "VLM",
  requestModel: id, responseModel: id, answered: 25, expected: 25, scores, maxProgress: 15,
}));
const layouts = [124, 136, 125, 138, 134];
const episodes = models.flatMap((model) => layouts.map((layoutId) => ({
  id: model.id + "-" + layoutId, modelId: model.id, layoutId, answered: 5, expected: 5, scores,
  execution: { steps: 12, progress: 15, success: null, state: "budget_censored", reason: "request_budget", elapsedSeconds: 120 },
  video: { id: model.id + "-video-" + layoutId, url: "/api/t1-media/" + model.id + "-video-" + layoutId, sha256: "d".repeat(64), bytes: 100, frames: 13, fps: 25, hasMotion: true },
  provenance: { initialSealSha256: "a".repeat(64), executionSealSha256: "b".repeat(64), sameEpisode: true, attempt: "original" },
})));
const fixture = {
  schemaVersion: "roboexam.t1-results.v1", resultVersion: "fixture-only", generatedAt: "2026-10-18",
  task: { id: "stack_bowls", label: "Stack Bowls", layoutIds: layouts }, models, episodes,
  scorer: { commit: "fixture-scorer", policy: "semantic-v1", reportSha256: "c".repeat(64), notes: ["Saved-plan parameter matching limit."] },
  sourceHashes: {},
};

// Transpile the actual components in memory; only the result data is synthetic.
function components() {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    const compiledModule = { exports: {} };
    cache.set(path, compiledModule.exports);
    const runtimeRequire = createRequire(path);
    function requireModule(name) {
      if (name === "../../data/t1-agent-results") return { t1AgentResults: fixture };
      if (name.startsWith(".")) {
        const base = resolve(dirname(path), name);
        const target = [base, base + ".tsx", base + ".ts"].find((candidate) => existsSync(candidate));
        assert.ok(target, "Missing actual component dependency: " + name);
        return load(target);
      }
      return runtimeRequire(name);
    }
    new Function("require", "module", "exports", compiled.outputText)(requireModule, compiledModule, compiledModule.exports);
    cache.set(path, compiledModule.exports);
    return compiledModule.exports;
  }
  return load;
}

test("current results default to the exact GPT-6 Astra layout136 video without autoplay", () => {
  const { T1ResultsView } = components()(resolve(here, "t1-results-view.tsx"));
  const html = renderToStaticMarkup(React.createElement(T1ResultsView));
  assert.match(html, /Stack Bowls/);
  assert.match(html, /4 models/);
  assert.match(html, /5 layouts/);
  assert.match(html, /data-episode-id="gpt6-astra-136"/);
  assert.match(html, /src="\/api\/t1-media\/gpt6-astra-video-136"/);
  assert.doesNotMatch(html, /src="\/api\/t1-media\/(?:kimi|mimo|deepseek)-video/);
  assert.match(html, /preload="metadata"/);
  assert.match(html, /playsInline=""/i);
  assert.doesNotMatch(html, /autoplay/i);
});

test("measured plan zeros and unmeasured process columns retain distinct rendering", () => {
  const { T1ResultsView } = components()(resolve(here, "t1-results-view.tsx"));
  const html = renderToStaticMarkup(React.createElement(T1ResultsView));
  assert.match(html, /C1<small>Full plan/);
  assert.match(html, /<td>0\.00<\/td>/);
  assert.equal((html.match(/aria-label="C2 not measured">—/g) || []).length, 4);
  assert.equal((html.match(/aria-label="C3 not measured">—/g) || []).length, 4);
  assert.match(html, /Metric details &amp; provenance/);
  assert.match(html, /Saved-plan parameter matching limit/);
  assert.doesNotMatch(html, /Pilot|Provisional|5 × 20%|Acc@0\.5/);
});

test("one-frame source renders Initial view and never invents a failed terminal result", () => {
  const { T1EpisodeViewer } = components()(resolve(here, "t1-episode-viewer.tsx"));
  const episode = {
    ...episodes.find((entry) => entry.modelId === "kimi" && entry.layoutId === 124),
    execution: { steps: 0, progress: null, success: null, state: "infrastructure_error", reason: "initial_api_error", elapsedSeconds: null },
    video: { id: "kimi-static-124", url: "/api/t1-media/kimi-static-124", sha256: "e".repeat(64), bytes: 100, frames: 1, fps: 25, hasMotion: false },
  };
  const html = renderToStaticMarkup(React.createElement(T1EpisodeViewer, { episode, model: models.find((entry) => entry.id === "kimi") }));
  assert.match(html, /<span>Initial view<\/span>/);
  assert.match(html, /Unknown · stopped/);
  assert.doesNotMatch(html, /Not completed|Succeeded|<span>Execution<\/span>/);
  assert.match(html, /src="\/api\/t1-media\/kimi-static-124"/);
});

test("a selected episode renders only its own steps, progress and media identity", () => {
  const { T1EpisodeViewer } = components()(resolve(here, "t1-episode-viewer.tsx"));
  const episode = {
    ...episodes.find((entry) => entry.modelId === "deepseek" && entry.layoutId === 138),
    execution: { steps: 321, progress: 10, success: false, state: "policy_early_stopped", reason: "model_insufficient_control", elapsedSeconds: 600 },
  };
  const html = renderToStaticMarkup(React.createElement(T1EpisodeViewer, { episode, model: models[0] }));
  assert.match(html, /data-episode-id="deepseek-138"/);
  assert.match(html, /src="\/api\/t1-media\/deepseek-video-138"/);
  assert.match(html, /<dd>321<\/dd>/);
  assert.match(html, /<dd>10\.00<small> \/ 100<\/small>/);
  assert.match(html, /Not completed/);
  assert.doesNotMatch(html, /gpt6-astra-video|kimi-video/);
});
