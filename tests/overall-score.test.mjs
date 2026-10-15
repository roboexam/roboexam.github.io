import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERALL_SETTINGS,
  OVERALL_SETTING_WEIGHTS,
  calculateOverallScore,
} from "../app/data/overall-score.ts";

function record(setting, sceneId, score100, overrides = {}) {
  return {
    trackId: "T1",
    reportMode: "plan",
    modelId: "model-a",
    sceneId,
    setting,
    score100,
    protocolVersion: "overall-v1",
    sourceHash: "sha256:test",
    ...overrides,
  };
}

function completeRecords(settingValues, scenes = ["scene-a", "scene-b"]) {
  return OVERALL_SETTINGS.flatMap((setting) =>
    scenes.map((sceneId) => record(setting, sceneId, settingValues[setting])));
}

function score(records, sceneIds = ["scene-a", "scene-b"]) {
  return calculateOverallScore({
    trackId: "T1",
    reportMode: "plan",
    modelId: "model-a",
    sceneIds,
    records,
  });
}

test("uses five fixed 0.2 weights after unique-scene macro averaging", () => {
  assert.deepEqual(Object.values(OVERALL_SETTING_WEIGHTS), [0.2, 0.2, 0.2, 0.2, 0.2]);
  const values = { id: 100, visual: 90, semantic: 80, behavioral: 70, recovery: 60 };
  const result = score(completeRecords(values));

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "complete");
  assert.equal(result.overall, 80);
  assert.deepEqual(result.settingScores, values);
  assert.deepEqual(result.settingCoverage, {
    id: 2,
    visual: 2,
    semantic: 2,
    behavioral: 2,
    recovery: 2,
  });
});

test("fails closed when any setting is absent and never reweights available settings", () => {
  const records = completeRecords({
    id: 100,
    visual: 90,
    semantic: 80,
    behavioral: 70,
    recovery: 60,
  }).filter((item) => item.setting !== "recovery");
  const result = score(records);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "missing_setting");
  assert.equal(result.overall, null);
  assert.equal(result.settingScores.recovery, null);
});

test("rejects duplicate scene-setting rows and out-of-range or unversioned scores", () => {
  const complete = completeRecords({
    id: 50,
    visual: 50,
    semantic: 50,
    behavioral: 50,
    recovery: 50,
  });

  const duplicate = score([...complete, record("id", "scene-a", 50)]);
  assert.equal(duplicate.reason, "invalid_record");
  assert.equal(duplicate.overall, null);

  const outOfRange = score(
    complete.map((item) =>
      item.setting === "visual" && item.sceneId === "scene-a"
        ? { ...item, score100: 101 }
        : item),
  );
  assert.equal(outOfRange.reason, "invalid_record");

  const unversioned = score(
    complete.map((item) =>
      item.setting === "semantic" && item.sceneId === "scene-b"
        ? { ...item, sourceHash: "" }
        : item),
  );
  assert.equal(unversioned.reason, "invalid_record");

  const mixedProtocol = score(
    complete.map((item) =>
      item.setting === "recovery"
        ? { ...item, protocolVersion: "overall-v2" }
        : item),
  );
  assert.equal(mixedProtocol.reason, "invalid_record");
});

test("counts a multi-tag scene once and averages scenes before settings", () => {
  const records = OVERALL_SETTINGS.flatMap((setting) => [
    record(setting, "scene-a", setting === "id" ? 100 : 50),
    record(setting, "scene-b", setting === "id" ? 0 : 50),
  ]);
  const result = score(records, ["scene-a", "scene-a", "scene-b"]);

  assert.equal(result.requiredSceneCount, 2);
  assert.equal(result.settingScores.id, 50);
  assert.equal(result.overall, 50);
});

test("requires at least one selected scene", () => {
  const result = score([], []);
  assert.equal(result.reason, "no_scenes");
  assert.equal(result.overall, null);
  assert.equal(result.eligible, false);
});
