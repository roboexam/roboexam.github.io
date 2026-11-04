import assert from "node:assert/strict";
import test from "node:test";

import data from "../app/data/generated/policy-baselines.json" with { type: "json" };
import aggregates from "../app/data/generated/policy-baselines-aggregates.json" with { type: "json" };
import media from "../scripts/policy-baseline-media.json" with { type: "json" };
import { HEAD } from "../app/api/policy-baseline-media/[file]/route.ts";
import { policyBaselineModelIds, policyTaskIds } from "../app/data/policy-baselines.ts";
import { readResult } from "../app/data/track-results.ts";
import { tracks } from "../app/data/metric-plan.ts";

test("policy benchmark publishes exactly three complete 24-task baselines", () => {
  assert.deepEqual(policyBaselineModelIds, ["G05", "HyVLA", "XVLA"]);
  assert.deepEqual(tracks.find((track) => track.id === "T3").models.map((model) => model.id), policyBaselineModelIds);
  assert.equal(policyTaskIds.length, 24);
  assert.deepEqual(Object.keys(data.models), Object.keys(aggregates.models));
  assert.deepEqual(Object.keys(data.overall), policyBaselineModelIds);
  for (const model of policyBaselineModelIds) {
    assert.deepEqual(Object.keys(data.models[model]).sort(), ["behavior", "id", "semantic", "visual"]);
    assert.equal(Object.values(data.models[model]).every((setting) => Object.keys(setting).length === 24), true);
  }
  const tasks = Object.values(data.models).flatMap((model) => Object.values(model).flatMap(Object.values));
  assert.equal(tasks.length, 3 * 4 * 24);
  assert.equal(tasks.reduce((sum, task) => sum + task.samples.length, 0), 1440);
  assert.equal(tasks.reduce((sum, task) => sum + task.samples.flatMap((sample) => sample.videos).length, 0), 4320);
  assert.doesNotMatch(JSON.stringify(data), /\/mnt\//);
});

test("all-scenario rows use the official 120-episode ID and OOD summaries", () => {
  const expected = {
    id: { once: "41.02%", end: "39.11%", drop: "5.08%", retention: "96.77%" },
    visual: { once: "33.40%", end: "30.56%", drop: "14.42%", retention: "95.24%" },
    semantic: { once: "40.21%", end: "38.97%", drop: "6.90%", retention: "100.00%" },
    behavioral: { once: "29.00%", end: "28.49%", drop: "6.67%", retention: "100.00%" },
  };
  for (const [setting, values] of Object.entries(expected)) {
    const selection = { trackId: "T3", mode: "plan", modelId: "G05", taskId: "all", setting };
    assert.equal(readResult({ ...selection, metricId: "LOCAL_SUCCESS_ONCE" }).primary, values.once);
    assert.equal(readResult({ ...selection, metricId: "LOCAL_SUCCESS_AT_END" }).primary, values.end);
    assert.equal(readResult({ ...selection, metricId: "DROP_AFTER_SUCCESS" }).primary, values.drop);
    assert.equal(readResult({ ...selection, metricId: "GOAL_RETENTION" }).primary, values.retention);
    assert.equal(readResult({ ...selection, metricId: "TSR" }).sampleCount, 120);
  }
});

test("all-scenario TSR keeps ID and three OOD settings separate for every baseline", () => {
  const expected = {
    G05: { id: "24.17%", visual: "12.50%", semantic: "25.83%", behavioral: "15.83%" },
    HyVLA: { id: "4.17%", visual: "4.17%", semantic: "8.33%", behavioral: "11.67%" },
    XVLA: { id: "5.83%", visual: "2.50%", semantic: "1.67%", behavioral: "8.33%" },
  };
  for (const model of policyBaselineModelIds) {
    const actual = Object.fromEntries(["id", "visual", "semantic", "behavioral"].map((setting) => [
      setting,
      readResult({ trackId: "T3", mode: "plan", modelId: model, taskId: "all", metricId: "TSR", setting }).primary,
    ]));
    assert.deepEqual(actual, expected[model]);
  }
});

test("new event metrics preserve episode availability and task-level macro means", () => {
  const metricIds = ["LOCAL_SUCCESS_ONCE", "LOCAL_SUCCESS_AT_END", "DROP_AFTER_SUCCESS", "GOAL_RETENTION"];
  const available = Object.fromEntries(metricIds.map((metric) => [metric, 0]));
  for (const model of Object.values(data.models)) {
    for (const setting of Object.values(model)) {
      for (const task of Object.values(setting)) {
        for (const metric of metricIds) {
          const values = task.samples.map((sample) => sample.values[metric]).filter((value) => value !== null);
          assert.equal(task.values[metric].n, values.length);
          assert.equal(task.values[metric].available, values.length > 0);
          if (values.length) {
            available[metric] += 1;
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            assert.ok(Math.abs(task.values[metric].value - mean) < 1e-12);
          } else {
            assert.equal(task.values[metric].value, null);
          }
        }
      }
    }
  }
  assert.ok(available.LOCAL_SUCCESS_ONCE > 0);
  assert.ok(available.LOCAL_SUCCESS_AT_END > 0);
  assert.ok(available.DROP_AFTER_SUCCESS > 0);
  assert.ok(available.GOAL_RETENTION > 0);
});

test("policy baseline media is allowlisted, seekable, and rejects paths", async () => {
  const [file] = Object.keys(media);
  assert.ok(file);
  const context = { params: Promise.resolve({ file }) };
  const response = await HEAD(new Request(`http://localhost/api/policy-baseline-media/${file}`, {
    headers: { range: "bytes=0-31" },
  }), context);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-length"), "32");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal((await HEAD(new Request("http://localhost"), { params: Promise.resolve({ file: "../../etc/passwd" }) })).status, 404);
});
