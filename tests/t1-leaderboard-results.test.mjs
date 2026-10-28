import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const currentFile = new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url);
const currentBytes = await readFile(currentFile);
const digest = value => createHash("sha256").update(value).digest("hex");
const { t1BenchmarkResults: current } = await import("../app/data/t1-benchmark-results.ts");
const sourceCurrent = structuredClone(current);
const { t1LeaderboardResults: displayed } = await import("../app/data/t1-leaderboard-results.ts");

test("shows only the current publication and scoreless planned models", () => {
  assert.deepEqual(displayed.models.map(row => row.id), [...current.models.map(row => row.id), "glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"]);
  assert.deepEqual(new Set(current.models.map(row => row.id)), new Set(["gpt-6-1-sol", "deepseek"]));
  assert.equal(new Set(displayed.models.map(row => row.id)).size, 5);
  assert.equal(displayed.models.find(row => row.id === "gpt-6-1-sol").label, "GPT-6.1-sol");
  assert.equal(displayed.models.find(row => row.id === "deepseek").requestModel, "deepseek-flash");
  assert.ok(!displayed.models.some(row => ["mimo", "gpt6-astra"].includes(row.id)));
  assert.ok(!displayed.models.some(row => row.requestModel === "ciyuan/deepseek-v4.1-flash"));
  assert.ok(!displayed.models.some(row => /qwen/i.test(row.id)));
  assert.ok(!displayed.models.some(row => /kimi/i.test(row.id + row.label + row.requestModel)));
});

test("both final models consume their exact saved scores and common source publication", () => {
  for (const source of current.models) {
    const row = displayed.models.find(model => model.id === source.id);
    assert.deepEqual(row.scores, source.scores);
    assert.deepEqual(row.publication, {
      resultVersion: current.resultVersion, sourceModelId: source.id,
      scope: { taskCount: 14, sceneCount: 70, processSlotCount: 207 },
      sourceHashes: current.provenance.sourceHashes,
      scorerPolicy: current.provenance.initialScorerPolicy,
    });
  }
  assert.deepEqual(displayed.scope, current.scope);
  assert.deepEqual(displayed.provenance, current.provenance);
});

test("GLM, MiniMax and Cosmos stay empty rather than borrowing pilot or other-model measurements", () => {
  for (const id of ["glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"]) {
    const row = displayed.models.find(model => model.id === id);
    assert.ok(Object.values(row.scores).every(value => value === null));
    assert.deepEqual(row.publication, { resultVersion: null, sourceModelId: id, scope: null });
    assert.equal(displayed.episodes.some(episode => episode.modelId === id), false);
  }
});

test("scoreless models expose no saved rollouts from another protocol", () => {
  for (const model of displayed.models.filter(row => !current.models.some(source => source.id === row.id))) {
    assert.equal(displayed.episodes.some(episode => episode.modelId === model.id), false, model.id);
  }
});

test("both final models retain seventy exact recordings and five per task", () => {
  const rows = displayed.episodes.filter(episode => episode.resultVersion === current.resultVersion);
  assert.equal(rows.length, 140);
  for (const model of current.models) {
    assert.equal(rows.filter(row => row.modelId === model.id).length, 70);
    for (const task of current.tasks) assert.equal(rows.filter(row => row.modelId === model.id && row.taskId === task.id).length, 5);
  }
  for (const row of rows) {
    const source = current.episodes.find(episode => episode.id === row.id);
    assert.deepEqual(row, { ...source, resultVersion: current.resultVersion });
  }
  assert.deepEqual(displayed.tasks, current.tasks);
  assert.equal(displayed.tasks.length, 14);
  assert.equal(displayed.tasks.some(task => task.id === "stack_bowls"), false);
  assert.equal(displayed.episodes.length, 140);
});

test("importing the presentation adapter never mutates either source object or source JSON", async () => {
  assert.deepEqual(current, sourceCurrent);
  assert.equal(digest(await readFile(currentFile)), digest(currentBytes));
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
