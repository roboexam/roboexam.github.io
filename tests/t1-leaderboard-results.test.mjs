import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const currentFile = new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url);
const oldFile = new URL("../app/data/generated/t1-agent-results.json", import.meta.url);
const currentBytes = await readFile(currentFile), oldBytes = await readFile(oldFile);
const digest = value => createHash("sha256").update(value).digest("hex");
const { t1BenchmarkResults: current } = await import("../app/data/t1-benchmark-results.ts");
const { t1AgentResults: old } = await import("../app/data/t1-agent-results.ts");
const sourceCurrent = structuredClone(current), sourceOld = structuredClone(old);
const { t1LeaderboardResults: displayed } = await import("../app/data/t1-leaderboard-results.ts");

test("retains six model identities while excluding old DeepSeek and Kimi from the public catalog", () => {
  assert.deepEqual(displayed.models.map(row => row.id), ["deepseek", "mimo", "gpt6-astra", "glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"]);
  assert.equal(new Set(displayed.models.map(row => row.id)).size, 6);
  assert.equal(displayed.models.find(row => row.id === "deepseek").requestModel, "deepseek-flash");
  assert.ok(!displayed.models.some(row => row.requestModel === "ciyuan/deepseek-v4.1-flash"));
  assert.ok(!displayed.models.some(row => /qwen/i.test(row.id)));
  assert.ok(!displayed.models.some(row => /kimi/i.test(row.id + row.label + row.requestModel)));
});

test("the new DeepSeek scores and source publication remain unchanged", () => {
  const row = displayed.models.find(model => model.id === "deepseek");
  assert.deepEqual(row.scores, current.models[0].scores);
  assert.deepEqual(row.publication, {
    resultVersion: current.resultVersion, sourceModelId: "deepseek",
    scope: { taskCount: 14, sceneCount: 70, processSlotCount: 207 },
    sourceHashes: current.provenance.sourceHashes,
    scorerPolicy: current.provenance.initialScorerPolicy,
  });
  assert.deepEqual(displayed.scope, current.scope);
  assert.deepEqual(displayed.provenance, current.provenance);
});

test("legacy numeric values are copied individually without averaging or filling absent scores", () => {
  for (const id of ["mimo", "gpt6-astra"]) {
    const source = old.models.find(model => model.id === id), row = displayed.models.find(model => model.id === id);
    assert.equal(row.label, source.label); assert.equal(row.requestModel, source.requestModel);
    assert.equal(row.scores.vqa, source.scores.composite);
    for (const metric of ["a", "b", "c", "a1", "a2", "b1", "c1", "count", "color"]) assert.equal(row.scores[metric], source.scores[metric], id + ":" + metric);
    for (const absent of ["overall", "subtask", "success", "a3", "b3", "b_interaction", "c2", "c3"]) assert.equal(row.scores[absent], null, id + ":" + absent);
    assert.equal(row.scores.c1, 0, "a measured zero must not become empty");
    assert.deepEqual(row.publication.scope, { taskCount: 1, sceneCount: 5, processSlotCount: null });
    assert.equal(row.publication.resultVersion, old.resultVersion); assert.equal(row.publication.sourceModelId, id);
    assert.deepEqual(row.publication.sourceHashes, { ...old.sourceHashes, scoreReport: old.scorer.reportSha256 });
    assert.equal(row.publication.scorerPolicy, old.scorer.policy);
    assert.equal(row.publication.scorerCommit, old.scorer.commit);
  }
});

test("old protocols override initial-only formulas instead of inheriting combined planning", () => {
  for (const row of displayed.models.filter(model => ["mimo", "gpt6-astra"].includes(model.id))) {
    const metrics = row.publication.metricOverrides;
    assert.equal(metrics.vqa.label, "Initial VQA"); assert.equal(metrics.vqa.formula, "(A + B + C1) / 3");
    assert.equal(metrics.a.formula, "(A1 + A2) / 2"); assert.equal(metrics.b.formula, "B1");
    assert.equal(metrics.c.formula, "C1"); assert.equal(metrics.a1.formula, "(count + color) / 2");
  }
});

test("GLM, MiniMax and Cosmos stay empty rather than borrowing pilot or other-model measurements", () => {
  for (const id of ["glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"]) {
    const row = displayed.models.find(model => model.id === id);
    assert.ok(Object.values(row.scores).every(value => value === null));
    assert.deepEqual(row.publication, { resultVersion: null, sourceModelId: id, scope: null });
    assert.equal(displayed.episodes.some(episode => episode.modelId === id), false);
  }
});

test("other models expose no saved rollouts from the superseded trajectory protocol", () => {
  assert.equal(displayed.episodes.filter(episode => episode.resultVersion === old.resultVersion).length, 0);
  for (const model of displayed.models.filter(row => row.id !== "deepseek")) {
    assert.equal(displayed.episodes.some(episode => episode.modelId === model.id), false, model.id);
  }
  assert.ok(!displayed.episodes.some(row => old.episodes.some(source => source.id === row.id)));
});

test("current rollouts remain bound to their own seventy records and publication version", () => {
  const rows = displayed.episodes.filter(episode => episode.resultVersion === current.resultVersion);
  assert.equal(rows.length, 70);
  for (const row of rows) {
    const source = current.episodes.find(episode => episode.id === row.id);
    assert.deepEqual(row, { ...source, resultVersion: current.resultVersion });
  }
  assert.deepEqual(displayed.tasks, current.tasks);
  assert.equal(displayed.tasks.length, 14);
  assert.equal(displayed.tasks.some(task => task.id === "stack_bowls"), false);
  assert.equal(displayed.episodes.length, 70);
});

test("importing the presentation adapter never mutates either source object or source JSON", async () => {
  assert.deepEqual(current, sourceCurrent); assert.deepEqual(old, sourceOld);
  assert.equal(digest(await readFile(currentFile)), digest(currentBytes));
  assert.equal(digest(await readFile(oldFile)), digest(oldBytes));
  for (const metric of current.metrics) assert.deepEqual(displayed.metrics.find(row => row.id === metric.id), metric);
  assert.deepEqual(displayed.metrics, current.metrics);
});

test("Peak Progress is absent from every displayed metric, model and episode score", () => {
  assert.equal(displayed.metrics.some(metric => metric.id === "peak"), false);
  for (const model of displayed.models) {
    assert.equal(Object.hasOwn(model.scores, "peak"), false);
    assert.equal(Object.hasOwn(model.publication?.metricOverrides ?? {}, "peak"), false);
  }
  for (const episode of displayed.episodes) assert.equal(Object.hasOwn(episode.scores, "peak"), false);
});
