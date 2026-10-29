import assert from "node:assert/strict";
import test from "node:test";
import { trackCorrelationResults } from "../app/data/track-correlation-results.ts";

test("derives T1 correlations from the current per-episode leaderboard cohort", () => {
  const result = trackCorrelationResults.T1;
  assert.equal(result.episodeCount, 140);
  assert.deepEqual(result.models.map((model) => model.episodeCount), [70, 70]);
  assert.deepEqual(result.models.map((model) => model.strictSuccessCount), [1, 0]);
  assert.equal(result.strictSuccessCorrelationAvailable, false);
  for (const model of result.models) {
    assert.ok(model.metrics.length > 0);
    assert.ok(model.metrics.every((metric) => metric.sampleCount > 2 && metric.sampleCount <= 70));
    assert.equal(model.metrics.some((metric) => ["overall", "subtask", "success"].includes(metric.metricId)), false);
    assert.ok(model.metrics.every((metric) => Number.isFinite(metric.r) && Math.abs(metric.r) <= 1));
  }
  const deepseekC3 = result.models[1].metrics.find((metric) => metric.metricId === "c3");
  assert.ok(deepseekC3.r > 0.99);
});

test("recomputes T2 metric-only matrices from current heldout73 samples", () => {
  const result = trackCorrelationResults.T2;
  assert.equal(result.successCorrelationAvailable, false);
  assert.equal(result.matrices.length, 2);
  for (const matrix of result.matrices) {
    assert.equal(matrix.episodeCount, 73);
    assert.equal(matrix.outcomeFieldsExcluded, true);
    assert.equal(matrix.values.length, matrix.metricIds.length);
    matrix.values.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      assert.ok(Number.isFinite(value));
      assert.ok(Math.abs(value - matrix.values[columnIndex][rowIndex]) < 1e-12);
      if (rowIndex === columnIndex) assert.ok(Math.abs(value - 1) < 1e-12);
    }));
  }
});

test("keeps T3 aligned with leaderboard versions and leaves T4 unavailable", () => {
  assert.equal(trackCorrelationResults.T3.models.length, 2);
  for (const model of trackCorrelationResults.T3.models) {
    assert.equal(model.inputManifestAligned, true);
    assert.ok(model.resultVersion);
    assert.ok(model.leaderboardResultVersion);
    assert.equal(model.episodeCount, 100);
  }
  assert.equal(trackCorrelationResults.T4.relationship, "unavailable");
  assert.equal(trackCorrelationResults.T4.models.length, 6);
  assert.equal(JSON.stringify(trackCorrelationResults).includes("/mnt/"), false);
});
