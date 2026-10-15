import assert from "node:assert/strict";
import test from "node:test";
import { vlmDashboardBundle } from "../app/data/vlm-results.ts";
import { validatePublishedBundle } from "../scripts/export-vlm-results.mjs";

const expectedValues = {
  DIRECT: 0.26,
  SITUATIONAL: 0.1,
  "OBJ-REF": 0.18,
  MRA: 0.331578947368421,
  RoA: 0,
  AREA: 0.1775,
  AFF: 0.819750968850576,
  "PIO-S1": 0.5662993001990241,
  "PIO-S2": 0.3322422230116339,
  "RS-LOC": 0.48,
  "RS-PLACE": 0.41,
  "RS-UNSEEN": 0.2727272727272727,
};

test("publishes the frozen VLM L1 Pilot without collapsing pending or failures", () => {
  assert.equal(vlmDashboardBundle.schemaVersion, "unibench.dashboard.vlm-l1.v2");
  assert.equal(JSON.stringify(vlmDashboardBundle).includes("/mnt/"), false);
  const model = vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"];
  assert.equal(model.status, "PASS_DETERMINISTIC");
  assert.equal(model.completed, "12 / 12");
  assert.deepEqual(model.cohort, {
    memberships: 1277,
    canonicalPredictions: 1200,
    deterministicScored: 1089,
    judgePending: 177,
    parseFailures: 11,
    infrastructureFailures: 0,
  });
  assert.equal(model.judge.availability, "judge_pending");
  assert.equal(model.provenance.scoreRerunByteIdentical, true);
});

test("publishes all and only the twelve deterministic metric groups", () => {
  const values = vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"].values;
  assert.deepEqual(Object.keys(values), Object.keys(expectedValues));
  for (const [id, expected] of Object.entries(expectedValues)) {
    assert.equal(values[id].score, expected, id);
    assert.equal(values[id].availability, "available");
    assert.ok(values[id].parseRate > 0, id);
    assert.equal(values[id].infrastructureFailureN, 0, id);
  }
  assert.equal(values.RoA.primary, "0.00%", "computed zero must not become missing");
  assert.equal(values["RS-LOC"].parseFailureN, 5);
  assert.equal(values["PIO-S1"].plannedN, 229);
});

test("publishes one audited real question and model-visible media set per L1 metric", () => {
  const model = vlmDashboardBundle.models["Qwen3-VL-8B-Instruct"];
  assert.deepEqual(Object.keys(model.samples), Object.keys(expectedValues));
  assert.equal(model.samples.DIRECT.evaluationId, "rynnbrain_bench:grounding:1002");
  assert.match(model.samples.DIRECT.question, /LOTTE/);
  assert.match(model.samples.DIRECT.rawResponse, /<object><frame 2>/);
  for (const [id, sample] of Object.entries(model.samples)) {
    assert.equal(sample.metricId, id);
    assert.equal(sample.terminalState, "scored");
    assert.ok(sample.inputCount >= sample.displayedInputCount, id);
    assert.ok(sample.displayedInputCount > 0 && sample.displayedInputCount <= 7, id);
    assert.equal(sample.media.length, sample.displayedInputCount, id);
    assert.ok(sample.media.every((media) => media.url.startsWith("/vlm-l1-samples/")), id);
  }
  const serialized = JSON.stringify(model.samples);
  assert.doesNotMatch(serialized, /\/mnt\/|ground_truth|mask_path|\/mask\//);
});

test("rejects corrupt browser bundles instead of silently filling values", () => {
  const missingMetric = structuredClone(vlmDashboardBundle);
  delete missingMetric.models["Qwen3-VL-8B-Instruct"].values.MRA;
  assert.throws(() => validatePublishedBundle(missingMetric));

  const zeroParseRate = structuredClone(vlmDashboardBundle);
  zeroParseRate.models["Qwen3-VL-8B-Instruct"].values.DIRECT.parseRate = 0;
  assert.throws(() => validatePublishedBundle(zeroParseRate));

  const leakedPath = structuredClone(vlmDashboardBundle);
  leakedPath.bundleVersion = "/mnt/private/result";
  assert.throws(() => validatePublishedBundle(leakedPath), /exposes a server path/);

  const collapsedJudge = structuredClone(vlmDashboardBundle);
  collapsedJudge.models["Qwen3-VL-8B-Instruct"].judge.availability = "available";
  assert.throws(() => validatePublishedBundle(collapsedJudge));

  const missingSampleMedia = structuredClone(vlmDashboardBundle);
  missingSampleMedia.models["Qwen3-VL-8B-Instruct"].samples.DIRECT.media = [];
  assert.throws(() => validatePublishedBundle(missingSampleMedia));
});
