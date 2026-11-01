import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateUnibench } from "../scripts/export-t1-unibench.mjs";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const generated = (name) => JSON.parse(readFileSync(resolve(root, "app/data/generated", name), "utf8"));
const clone = (value) => structuredClone(value);

test("published UniBench bundle satisfies its aggregation and safety contract", () => {
  const results = generated("t1-unibench-results.json");
  const vqa = generated("t1-unibench-vqa.json");
  validateUnibench(results, vqa);
  assert.equal(results.models.length >= 5, true);
  for (const model of results.models) {
    // Overall exists only with all five settings; a missing setting stays null, never zero.
    assert.equal(model.overall !== null, model.splitsPresent.length === 5);
    for (const split of ["ID", "V", "S", "B", "REC"]) if (!model.splitsPresent.includes(split)) assert.equal(model.splits[split], null);
  }
  const ids = new Set(results.episodes.map((e) => e.id));
  assert.equal(ids.size, results.episodes.length);
});

test("validation rejects tampered totals, private text and duplicate episodes", () => {
  const results = generated("t1-unibench-results.json");
  const vqa = generated("t1-unibench-vqa.json");
  const withOverall = results.models.find((m) => m.overall);
  if (withOverall) {
    const bad = clone(results);
    bad.models.find((m) => m.id === withOverall.id).overall.overall += 1;
    assert.throws(() => validateUnibench(bad, vqa), /overall formula/);
  }
  const leak = clone(vqa);
  const row = leak.episodes.find((e) => e.initial.length);
  row.initial[0].response = "see /bh/zbh_ckp/runs/agentbench/x";
  assert.throws(() => validateUnibench(results, leak), /private/);
  const dup = clone(results);
  dup.episodes.push(dup.episodes[0]);
  assert.throws(() => validateUnibench(dup, vqa), /duplicate episode/);
  const recVqa = clone(results);
  const rec = recVqa.models.find((m) => m.splits.REC);
  if (rec) { rec.splits.REC.vqa = 50; assert.throws(() => validateUnibench(recVqa, vqa), /recovery has no VQA/); }
});

// Render the real component with a small synthetic board.
const metrics = (subtask, vqa) => ({ score: vqa === null ? subtask : 0.7 * subtask + 0.3 * vqa, subtask, success: 10, vqa,
  a: vqa, b: vqa, c1: vqa, c2: null, c3: null, scoreGain: null, tasks: 1, cases: 3,
  perTask: { task_a: { subtask, success: 10, vqa, cases: 3 } } });
const fixture = {
  schemaVersion: "roboexam.t1-unibench-results.v1", resultVersion: "synthetic-v1", generatedAt: "",
  splits: [], tasks: [{ id: "task_a", label: "Task A" }],
  models: [
    { id: "alpha", label: "Alpha", family: "alpha", overall: { overall: 1, subtask: 1, vqa: 1 },
      splits: { ID: metrics(20, 80), V: metrics(10, 70), S: metrics(10, 60), B: metrics(5, 60), REC: metrics(30, null) },
      splitsPresent: ["ID", "V", "S", "B", "REC"] },
    { id: "beta", label: "Beta", family: "beta", overall: null,
      splits: { ID: metrics(12, 75), V: null, S: null, B: null, REC: null }, splitsPresent: ["ID"] },
  ],
  episodes: [{ id: "e1", modelId: "alpha", split: "ID", taskId: "task_a", slot: "ID1", layoutId: 0,
    execution: { steps: 10, subtask: 20, success: false, elapsedSeconds: 61, endReason: "native_failure" },
    scores: { vqa: 80, a: 80, b: 80, c1: 80 }, recovery: null, notes: [], video: null, replayVideo: null }],
  coverage: {}, provenance: {},
};

function loadView() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    const mod = { exports: {} };
    cache.set(filename, mod.exports);
    const runtimeRequire = createRequire(filename);
    const requireModule = (name) => {
      if (name === "../../data/t1-unibench-results") return { t1UnibenchResults: fixture, T1_SPLITS: ["ID", "V", "S", "B", "REC"] };
      if (!name.startsWith(".")) return runtimeRequire(name);
      const base = resolve(dirname(filename), name);
      const target = [base, `${base}.tsx`, `${base}.ts`].find(existsSync);
      assert.ok(target, "missing dependency " + name);
      return load(target);
    };
    new Function("require", "module", "exports", compiled.outputText)(requireModule, mod, mod.exports);
    return mod.exports;
  }
  return load(resolve(root, "app/components/t1/t1-unibench-view.tsx"));
}

test("board renders five settings per metric and keeps unrun settings blank", () => {
  const { T1UnibenchView, firstUnibenchSelection } = loadView();
  const html = renderToStaticMarkup(React.createElement(T1UnibenchView, { results: fixture }));
  for (const label of ["ID", "V-OOD", "S-OOD", "B-OOD", "Recovery"]) assert.ok(html.includes(`>${label}<`), label);
  assert.ok(html.includes("Model performance by setting"));
  assert.ok(html.includes("1 of 5 settings"), "partial model is marked");
  assert.ok(html.includes("Recovery has no VQA"));
  const beta = firstUnibenchSelection(fixture, "beta", "V");
  assert.equal(beta.episodeId, null, "no episode is borrowed from another model");
});
