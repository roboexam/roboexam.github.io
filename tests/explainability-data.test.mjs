import assert from "node:assert/strict";
import test from "node:test";
import { explainabilityDashboardBundle } from "../app/data/explainability-results.ts";
import { validatePublishedBundle } from "../scripts/export-explainability-results.mjs";

test("publishes latest-cohort metric-success associations with formal provenance", () => {
  assert.equal(explainabilityDashboardBundle.schemaVersion, "unibench.dashboard.explainability.v1");
  assert.equal(JSON.stringify(explainabilityDashboardBundle).includes("/mnt/"), false);
  assert.deepEqual(Object.keys(explainabilityDashboardBundle.models).sort(), ["FastWAM", "Pi0.5"]);

  const pi05 = explainabilityDashboardBundle.models["Pi0.5"];
  const fastwam = explainabilityDashboardBundle.models.FastWAM;
  assert.deepEqual(pi05.cohort, {
    episodes: 100,
    uniqueSeeds: 100,
    success: 76,
    partial: 22,
    failure: 2,
    nonSuccess: 24,
    successRate: 0.76,
  });
  assert.deepEqual(fastwam.cohort, {
    episodes: 100,
    uniqueSeeds: 100,
    success: 12,
    partial: 31,
    failure: 57,
    nonSuccess: 88,
    successRate: 0.12,
  });
  assert.equal(pi05.method.preOutcomeSteps, 250);
  assert.equal(fastwam.method.preOutcomeSteps, 250);
  assert.equal(pi05.series.preOutcome.every((row) => row.status === "computed"), true);
  assert.equal(fastwam.series.preOutcome.every((row) => row.status === "computed"), true);
});

test("keeps raw sign, intended direction and corrected significance separate", () => {
  const pi05 = explainabilityDashboardBundle.models["Pi0.5"];
  const fastwam = explainabilityDashboardBundle.models.FastWAM;
  assert.equal(pi05.series.fullEpisode.filter((row) => row.significant).length, 8);
  assert.equal(pi05.series.preOutcome.filter((row) => row.significant).length, 2);
  assert.equal(fastwam.series.fullEpisode.filter((row) => row.significant).length, 4);
  assert.equal(fastwam.series.preOutcome.filter((row) => row.significant).length, 1);

  const pi05EarlyJoint = pi05.series.preOutcome.find(
    (row) => row.metricId === "pre_outcome.left.joint_path_length_rad",
  );
  assert.equal(pi05EarlyJoint.r > 0, true);
  assert.equal(pi05EarlyJoint.direction, "lower");
  assert.equal(pi05EarlyJoint.significant, true);

  const fastwamEarlyOrientation = fastwam.series.preOutcome.find(
    (row) => row.metricId === "pre_outcome.right.orientation_path_length_rad",
  );
  assert.equal(fastwamEarlyOrientation.r > 0, true);
  assert.equal(fastwamEarlyOrientation.qValue < 0.05, true);
});

test("preserves valid zero-event evidence without inventing correlations", () => {
  const pi05 = explainabilityDashboardBundle.models["Pi0.5"];
  const fastwam = explainabilityDashboardBundle.models.FastWAM;
  const pi05TaskAdherence = pi05.series.events.find(
    (row) => row.metricId === "event_count.task_adherence_event_count",
  );
  assert.equal(pi05TaskAdherence.status, "computed");
  assert.equal(pi05TaskAdherence.r < 0, true);
  assert.equal(pi05TaskAdherence.association.telemetry_coverage, 1);

  for (const row of fastwam.series.events) {
    assert.equal(row.status, "unavailable");
    assert.equal(row.r, null);
    assert.equal(row.association.telemetry_coverage, 1);
  }
});

test("rejects corrupt or path-leaking explainability bundles", () => {
  const wrongCohort = structuredClone(explainabilityDashboardBundle);
  wrongCohort.models.FastWAM.cohort.success = 13;
  assert.throws(() => validatePublishedBundle(wrongCohort));

  const leakedPath = structuredClone(explainabilityDashboardBundle);
  leakedPath.models["Pi0.5"].resultVersion = "/mnt/private/result";
  assert.throws(() => validatePublishedBundle(leakedPath), /exposes a server path/);
});
