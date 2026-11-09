import assert from "node:assert/strict";
import test from "node:test";

import g05 from "../app/data/generated/policy-baselines-g05.json" with { type: "json" };
import hyvla from "../app/data/generated/policy-baselines-hyvla.json" with { type: "json" };
import xvla from "../app/data/generated/policy-baselines-xvla.json" with { type: "json" };
import pi05 from "../app/data/generated/policy-baselines-pi05.json" with { type: "json" };
import opendm from "../app/data/generated/policy-baselines-opendm.json" with { type: "json" };
import aggregates from "../app/data/generated/policy-baselines-aggregates.json" with { type: "json" };
import media from "../scripts/policy-baseline-media.json" with { type: "json" };
import { HEAD } from "../app/api/policy-baseline-media/[file]/route.ts";

const documents = [g05, hyvla, xvla, pi05, opendm];
const data = {
  ...g05,
  models: Object.assign({}, ...documents.map((document) => document.models)),
  overall: Object.assign({}, ...documents.map((document) => document.overall)),
};
import { policyBaselineModelIds, policyTaskIds } from "../app/data/policy-baselines.ts";
import { readResult } from "../app/data/track-results.ts";
import { tracks } from "../app/data/metric-plan.ts";

test("policy benchmark publishes exactly five complete 24-task baselines", () => {
  assert.equal(data.scoringRevision, "20261104_B01_B06_B08");
  assert.equal(data.efficiencyReferenceRevision, "20261104_exact_v3_parquet_source_episode_id");
  assert.equal(data.lossEventRevision, "20261105_six_task_loss_events");
  assert.equal(data.pi05OpenDmEfficiencyReferenceRevision, "20261106_exact_v3_parquet_source_episode_id");
  assert.equal(data.fiveModelCurrentRuleRevision, "20261106_current_rule_evidence_with_original_fallback");
  assert.match(data.fiveModelCurrentRuleFallback, /Insufficient saved physical evidence/);
  assert.match(data.officialResultScope, /current-rule success\/score/);
  assert.equal(data.recoveryAddedAt, "2026-11-07T10:14:11.786470+00:00");
  assert.match(data.recoveryScope, /missing classify_objects_by_language\/episode_4 retained/);
  assert.deepEqual(policyBaselineModelIds, ["G05", "HyVLA", "XVLA", "Pi0.5", "OpenDM"]);
  assert.deepEqual(tracks.find((track) => track.id === "T3").models.map((model) => model.id), policyBaselineModelIds);
  assert.equal(policyTaskIds.length, 24);
  assert.deepEqual(Object.keys(data.models), Object.keys(aggregates.models));
  assert.deepEqual(Object.keys(data.overall), policyBaselineModelIds);
  for (const model of policyBaselineModelIds) {
    assert.deepEqual(Object.keys(data.models[model]).sort(), ["behavior", "id", "recovery", "semantic", "visual"]);
    assert.equal(Object.values(data.models[model]).every((setting) => Object.keys(setting).length === 24), true);
  }
  const tasks = Object.values(data.models).flatMap((model) => Object.values(model).flatMap(Object.values));
  assert.equal(tasks.length, 5 * 5 * 24);
  assert.equal(tasks.reduce((sum, task) => sum + task.samples.length, 0), 2995);
  assert.equal(tasks.reduce((sum, task) => sum + task.samples.flatMap((sample) => sample.videos).length, 0), 8985);
  assert.doesNotMatch(JSON.stringify(data), /\/mnt\//);
});

test("all-scenario rows use the official 120-episode ID and OOD summaries", () => {
  const expected = {
    id: { once: "41.97%", end: "39.11%", drop: "8.33%", retention: "96.88%" },
    visual: { once: "36.25%", end: "32.94%", drop: "15.45%", retention: "95.83%" },
    semantic: { once: "44.97%", end: "42.78%", drop: "7.94%", retention: "96.97%" },
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
    G05: { id: "25.00%", visual: "15.00%", semantic: "30.00%", behavioral: "15.83%" },
    HyVLA: { id: "8.33%", visual: "6.67%", semantic: "10.83%", behavioral: "12.50%" },
    XVLA: { id: "7.50%", visual: "2.50%", semantic: "4.17%", behavioral: "8.33%" },
    "Pi0.5": { id: "9.17%", visual: "7.50%", semantic: "10.00%", behavioral: "10.83%" },
    OpenDM: { id: "12.50%", visual: "9.17%", semantic: "19.17%", behavioral: "6.67%" },
  };
  for (const model of policyBaselineModelIds) {
    const actual = Object.fromEntries(["id", "visual", "semantic", "behavioral"].map((setting) => [
      setting,
      readResult({ trackId: "T3", mode: "plan", modelId: model, taskId: "all", metricId: "TSR", setting }).primary,
    ]));
    assert.deepEqual(actual, expected[model]);
  }
});

test("Recovery publishes 119 verified episodes per model and preserves the missing episode", () => {
  const expected = { G05: "17.65%", HyVLA: "6.72%", XVLA: "9.24%", "Pi0.5": "9.24%", OpenDM: "9.24%" };
  for (const model of policyBaselineModelIds) {
    const result = readResult({ trackId: "T3", mode: "plan", modelId: model, taskId: "all", metricId: "TSR", setting: "recovery" });
    assert.equal(result.primary, expected[model]);
    assert.equal(result.sampleCount, 119);
    assert.match(result.cohort, /119\/120 episodes/);
    const missingTask = data.models[model].recovery.classify_objects_by_language;
    assert.equal(missingTask.episodes, 4);
    assert.equal(missingTask.incompleteEpisodes, 1);
    assert.equal(missingTask.samples.some((sample) => sample.sourceEpisode === "episode_4"), false);
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
