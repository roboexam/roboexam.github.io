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

test("restores exactly seven original model identities while replacing the old DeepSeek row", () => {
  assert.deepEqual(displayed.models.map(row => row.id), ["deepseek", "mimo", "kimi", "gpt6-astra", "glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"]);
  assert.equal(new Set(displayed.models.map(row => row.id)).size, 7);
  assert.equal(displayed.models.find(row => row.id === "deepseek").requestModel, "deepseek-flash");
  assert.ok(!displayed.models.some(row => row.requestModel === "ciyuan/deepseek-v4.1-flash"));
  assert.ok(!displayed.models.some(row => /qwen/i.test(row.id)));
});

test("the new DeepSeek scores and source publication remain unchanged", () => {
  const row = displayed.models.find(model => model.id === "deepseek");
  assert.deepEqual(row.scores, { ...current.models[0].scores, peak: null });
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
  for (const id of ["mimo", "kimi", "gpt6-astra"]) {
    const source = old.models.find(model => model.id === id), row = displayed.models.find(model => model.id === id);
    assert.equal(row.label, source.label); assert.equal(row.requestModel, source.requestModel);
    assert.equal(row.scores.vqa, source.scores.composite);
    assert.equal(row.scores.peak, source.maxProgress);
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
  for (const row of displayed.models.filter(model => ["mimo", "kimi", "gpt6-astra"].includes(model.id))) {
    const metrics = row.publication.metricOverrides;
    assert.equal(metrics.vqa.label, "Initial VQA"); assert.equal(metrics.vqa.formula, "(A + B + C1) / 3");
    assert.equal(metrics.a.formula, "(A1 + A2) / 2"); assert.equal(metrics.b.formula, "B1");
    assert.equal(metrics.c.formula, "C1"); assert.equal(metrics.a1.formula, "(count + color) / 2");
    assert.match(metrics.peak.definition, /distinct from mean subtask/);
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

test("fifteen legacy rollouts keep exact model, version, attempt and complete original video identity", () => {
  const legacy = displayed.episodes.filter(episode => episode.resultVersion === old.resultVersion);
  assert.equal(legacy.length, 15);
  assert.equal(new Set(legacy.map(episode => episode.id)).size, 15);
  for (const row of legacy) {
    const source = old.episodes.find(episode => episode.id === row.id);
    assert.ok(source); assert.notEqual(row.modelId, "deepseek");
    assert.equal(row.modelId, source.modelId); assert.equal(row.taskId, "stack_bowls");
    assert.equal(row.layoutId, source.layoutId); assert.equal(row.attempt, source.provenance.attempt);
    assert.deepEqual(row.video, source.video);
    assert.deepEqual(row.execution, { steps: source.execution.steps, subtask: source.execution.progress, success: source.execution.success, elapsedSeconds: source.execution.elapsedSeconds });
    assert.equal(row.scores.subtask, null); assert.equal(row.scores.peak, null);
    assert.equal(row.scores.vqa, source.scores.composite);
  }
  const incomplete = legacy.find(row => row.modelId === "kimi" && row.layoutId === 124);
  assert.equal(incomplete.scores.vqa, null); assert.equal(incomplete.scores.a2, null);
  assert.equal(incomplete.execution.success, null);
  assert.ok(!displayed.episodes.some(row => row.id.startsWith(old.resultVersion + "-deepseek-")));
});

test("current rollouts remain bound to their own seventy records and publication version", () => {
  const rows = displayed.episodes.filter(episode => episode.resultVersion === current.resultVersion);
  assert.equal(rows.length, 70);
  for (const row of rows) {
    const source = current.episodes.find(episode => episode.id === row.id);
    assert.deepEqual(row, { ...source, resultVersion: current.resultVersion });
  }
  assert.equal(displayed.tasks.length, 15);
  assert.equal(displayed.tasks.filter(task => task.id === "stack_bowls").length, 1);
  assert.equal(displayed.episodes.length, 85);
});

test("importing the presentation adapter never mutates either source object or source JSON", async () => {
  assert.deepEqual(current, sourceCurrent); assert.deepEqual(old, sourceOld);
  assert.equal(digest(await readFile(currentFile)), digest(currentBytes));
  assert.equal(digest(await readFile(oldFile)), digest(oldBytes));
  for (const metric of current.metrics) assert.deepEqual(displayed.metrics.find(row => row.id === metric.id), metric);
  assert.equal(displayed.metrics.filter(row => row.id === "peak").length, 1);
});
