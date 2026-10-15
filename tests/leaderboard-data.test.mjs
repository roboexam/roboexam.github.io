import assert from "node:assert/strict";
import test from "node:test";
import { leaderboardLevelDefinitions, leaderboardLevels } from "../app/data/leaderboard.ts";

function model(level, modelId) {
  const result = leaderboardLevels[level].models.find((item) => item.modelId === modelId);
  assert.ok(result, `${level} ${modelId} must exist`);
  return result;
}

test("defines one transparent 100-point weight budget per supported Level", () => {
  assert.deepEqual(leaderboardLevelDefinitions.map((definition) => definition.id), ["L2", "L3", "L4"]);
  for (const definition of leaderboardLevelDefinitions) {
    assert.equal(definition.rules.reduce((sum, rule) => sum + rule.weight, 0), 100, `${definition.id} weights`);
    assert.equal(new Set(definition.rules.map((rule) => rule.id)).size, definition.rules.length, `${definition.id} metric IDs`);
    assert.match(definition.scoreVersion, /^leaderboard-l[234]-v0\.1-20260819$/);
  }
});
test("uses only metrics shared by the frozen reference pool and never treats missing as zero", () => {
  assert.equal(leaderboardLevels.L2.activeWeight, 100);
  assert.equal(leaderboardLevels.L3.activeWeight, 80);
  assert.equal(leaderboardLevels.L3.deferredWeight, 20);
  assert.equal(leaderboardLevels.L4.activeWeight, 100);

  for (const modelId of ["Cosmos Predict 2.5", "CtrlWorld"]) {
    const result = model("L3", modelId);
    assert.equal(result.availableWeight, 80);
    assert.equal(result.metrics.INTERACT.included, false);
    assert.equal(result.metrics.AF.included, false);
  }
  assert.equal(model("L3", "Cosmos Predict 2.5").metrics.INTERACT.rawDisplay, "N/A");
  assert.notEqual(model("L3", "CtrlWorld").metrics.INTERACT.rawDisplay, "N/A");
});

test("computes deterministic v0 Level indices from generated formal-result adapters", () => {
  assert.ok(Math.abs(model("L2", "Pi0.5").totalScore - 59.01918718823857) < 1e-9);
  assert.ok(Math.abs(model("L2", "FastWAM").totalScore - 58.58081281176144) < 1e-9);
  assert.ok(Math.abs(model("L3", "Cosmos Predict 2.5").totalScore - 50.935397691866626) < 1e-9);
  assert.ok(Math.abs(model("L3", "CtrlWorld").totalScore - 49.06460230813339) < 1e-9);
  assert.ok(Math.abs(model("L4", "Pi0.5").totalScore - 72.98649995685443) < 1e-9);
  assert.ok(Math.abs(model("L4", "FastWAM").totalScore - 18.801000043145567) < 1e-9);
});

test("keeps diagnostic and derived metrics visible without double-counting them", () => {
  for (const metricId of ["LSPEED", "RSPEED", "TJPL", "TOPL"]) {
    assert.equal(model("L2", "Pi0.5").metrics[metricId].weight, 0);
    assert.equal(model("L2", "Pi0.5").metrics[metricId].subscore, null);
  }
  assert.equal(model("L3", "Cosmos Predict 2.5").metrics.PSNR.weight, 0);
  assert.equal(model("L4", "Pi0.5").metrics.SR95.weight, 0);
});
