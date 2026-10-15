import assert from "node:assert/strict";
import test from "node:test";
import { vlaWamDashboardBundle } from "../app/data/vla-wam-results.ts";
import { validatePublishedBundle } from "../scripts/export-vla-wam-results.mjs";

test("publishes the latest 100-seed VLA/WAM formal results", () => {
  assert.equal(vlaWamDashboardBundle.schemaVersion, "unibench.dashboard.vla-wam.v1");
  assert.equal(JSON.stringify(vlaWamDashboardBundle).includes("/mnt/"), false);
  assert.deepEqual(Object.keys(vlaWamDashboardBundle.models).sort(), ["FastWAM", "Pi0.5"]);

  const pi05 = vlaWamDashboardBundle.models["Pi0.5"];
  const fastwam = vlaWamDashboardBundle.models.FastWAM;
  assert.deepEqual(pi05.cohort, { episodes: 100, uniqueSeeds: 100, success: 76, partial: 22, failure: 2 });
  assert.deepEqual(fastwam.cohort, { episodes: 100, uniqueSeeds: 100, success: 12, partial: 31, failure: 57 });
  assert.equal(pi05.values.TSR.value, 0.76);
  assert.equal(fastwam.values.TSR.value, 0.12);
  assert.equal(pi05.values.SET.n, 76);
  assert.equal(fastwam.values.SET.n, 12);
});

test("preserves computed zero events separately from unavailable evidence", () => {
  for (const result of Object.values(vlaWamDashboardBundle.models)) {
    for (const id of ["TAE", "SLIP", "ENV_COLL", "SELF_COLL"]) {
      assert.equal(result.values[id].availability, "available");
      assert.equal(result.values[id].status, "computed");
      assert.equal(result.values[id].n, 100);
    }
    assert.equal(result.values.ROBUSTNESS.availability, "input_missing");
    assert.equal(result.values.ROBUSTNESS.status, "input_missing");
    assert.equal(result.values.ROBUSTNESS.value, null);
    assert.equal(result.values.ROBUSTNESS.primary, "N/A");
  }
  assert.equal(vlaWamDashboardBundle.models["Pi0.5"].values.TAE.value, 3);
  assert.equal(vlaWamDashboardBundle.models.FastWAM.values.TAE.value, 0);
});

test("rejects corrupt VLA/WAM browser bundles", () => {
  const wrongCohort = structuredClone(vlaWamDashboardBundle);
  wrongCohort.models.FastWAM.cohort.failure = 56;
  assert.throws(() => validatePublishedBundle(wrongCohort));

  const zeroFilledMissing = structuredClone(vlaWamDashboardBundle);
  zeroFilledMissing.models.FastWAM.values.ROBUSTNESS.value = 0;
  assert.throws(() => validatePublishedBundle(zeroFilledMissing));

  const collapsedMissingState = structuredClone(vlaWamDashboardBundle);
  collapsedMissingState.models.FastWAM.values.ROBUSTNESS.availability = "unavailable";
  assert.throws(() => validatePublishedBundle(collapsedMissingState), /availability/);

  const mismatchedFailureState = structuredClone(vlaWamDashboardBundle);
  mismatchedFailureState.models.FastWAM.values.ROBUSTNESS.availability = "evaluator_failed";
  assert.throws(() => validatePublishedBundle(mismatchedFailureState), /status must match availability/);

  const leakedPath = structuredClone(vlaWamDashboardBundle);
  leakedPath.models["Pi0.5"].resultVersion = "/mnt/private/result";
  assert.throws(() => validatePublishedBundle(leakedPath), /exposes a server path/);
});
