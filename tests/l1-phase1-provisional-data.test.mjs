import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const bundle = JSON.parse(await readFile(new URL("app/data/generated/l1-phase1-provisional.json", root), "utf8"));

test("publishes only the frozen internal Phase 1 provisional result", () => {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.l1-phase1-provisional.v3");
  assert.equal(bundle.run.id, "l1-all-metrics-cosmos3-native-phase1-provisional-12episodes-20260902-v1");
  assert.equal(bundle.run.testedModel, "nvidia/Cosmos3-Nano");
  assert.equal(bundle.run.predictionCount, 1070);
  assert.equal(bundle.run.predictionSha256, "2b2c5ca43c58b9151a2b74eb609bee36b7b63aeef6fd9f240403b888f6a110e3");
  assert.equal(bundle.run.resultTier, "provisional");
  assert.equal(bundle.run.publishScope, "internal_development_only");
  assert.equal(bundle.run.humanGtReview, "not_started");
  assert.equal(bundle.run.judgeHumanCalibration, "waived_for_provisional_run");
  assert.equal(bundle.run.crossLayerTotal, "forbidden");
  assert.equal(bundle.coverage.membershipCount, 2815);
  assert.equal(bundle.coverage.scoreBearingMembershipCount, 2793);
  assert.equal(bundle.coverage.nonNotApplicableMembershipCount, 2807);
  assert.equal(bundle.coverage.numericMetricCount, 26);
  assert.equal(bundle.coverage.infrastructureFailureCount, 0);
  assert.deepEqual(bundle.coverage.terminalCounts, {
    contract_pending: 14,
    not_applicable: 8,
    scored: 2514,
    scored_provisional_gt: 160,
    scored_provisional_judge: 119,
  });
});

test("binds all metrics to exact frozen Phase 1 inputs", () => {
  assert.equal(bundle.examples.length, 10);
  assert.equal(new Set(bundle.examples.map((example) => example.canonicalSampleId)).size, 10);
  assert.deepEqual(
    Object.keys(bundle.exampleByMetricId).sort(),
    bundle.metrics.map((metric) => metric.metricId).sort(),
  );
  for (const metric of bundle.metrics) {
    const sampleId = bundle.exampleByMetricId[metric.metricId];
    const example = bundle.examples.find((candidate) => candidate.canonicalSampleId === sampleId);
    assert.ok(example, `missing exact example for ${metric.metricId}`);
    assert.ok(example.metricMemberships.includes(metric.metricId));
    assert.ok(example.question.length > 0);
    assert.equal(example.frameIndices.length, example.media.length);
    assert.equal(example.reviewStatus, "automated_binding_verified");
    for (const [index, frame] of example.media.entries()) {
      assert.equal(frame.frameIndex, example.frameIndices[index]);
      assert.match(frame.url, /^\/api\/l1-phase1-media\/samples\/[a-f0-9]{64}\.png$/);
      assert.match(frame.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.ok(bundle.examples.filter((example) => example.queryType === "failure").every((example) => example.media.length === 8));
  assert.ok(bundle.examples.filter((example) => example.queryType === "recovery").every((example) => example.media.length === 8));
});

test("keeps all 29 metrics distinct and genuine gaps null", () => {
  assert.equal(bundle.metrics.length, 29);
  assert.equal(new Set(bundle.metrics.map((metric) => metric.metricId)).size, 29);
  assert.equal(bundle.metrics.filter((metric) => metric.score !== null).length, 26);
  assert.deepEqual(
    bundle.metrics.filter((metric) => metric.score === null).map((metric) => metric.metricId),
    ["l1d.failure_onset_similarity", "l1d.recovery_subgoal_accuracy", "l1d.recovery_plan_score"],
  );
  assert.ok(Math.abs(bundle.metrics.find((metric) => metric.metricId === "l1a.direct").score - 76.72099537889) < 1e-10);
  assert.equal(bundle.metrics.find((metric) => metric.metricId === "l1c.planning_llm_alignment").state, "scored_provisional_judge");
  assert.equal(bundle.metrics.find((metric) => metric.metricId === "l1b.affordance_ap").state, "scored_provisional_gt");
  const failureType = bundle.metrics.find((metric) => metric.metricId === "l1d.failure_type_macro_f1");
  assert.equal(failureType.score, 9.090909090909092);
  assert.deepEqual(failureType.terminalCounts, { contract_pending: 2, scored: 10 });
  assert.equal(bundle.layers["L1-D"].numericMetricCount, 2);
  assert.equal(bundle.layers["L1-D"].pendingMetricCount, 3);
});

test("does not expose raw predictions, private GT, Judge output, or a cross-layer total", () => {
  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(serialized, /raw_response|private_gt|judge_results|qwen_calibration_output/i);
  assert.doesNotMatch(serialized, /\/mnt\/|media_paths|episode_relpath|private_targets/i);
  assert.equal(bundle.run.crossLayerTotal, "forbidden");
  assert.equal("level1Score" in bundle, false);
  assert.equal("crossLayerScore" in bundle, false);
  assert.equal(bundle.forbiddenClaims.includes("cross-layer unified total"), true);
  assert.equal(bundle.forbiddenClaims.includes("cross-task generalization"), true);
});
