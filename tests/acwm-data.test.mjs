import assert from "node:assert/strict";
import test from "node:test";
import { acwmDashboardBundle } from "../app/data/acwm-results.ts";
import { validatePublishedBundle } from "../scripts/export-acwm-results.mjs";

const episodeMetrics = new Set(["MSE", "M-MSE", "PSNR", "SSIM", "IQ", "MS", "TA", "INTERACT"]);

test("publishes completion and provenance from explicit availability", () => {
  assert.equal(acwmDashboardBundle.schemaVersion, "unibench.dashboard.acwm.v1");
  assert.match(acwmDashboardBundle.mediaManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(acwmDashboardBundle).includes("/mnt/"), false);

  for (const [model, result] of Object.entries(acwmDashboardBundle.models)) {
    const available = Object.values(result.values).filter((metric) => metric.availability === "available");
    const [reported] = result.completed.split("/").map((value) => Number(value.trim()));
    assert.equal(reported, available.length, `${model} completion must match available metrics`);
    assert.match(result.provenance.result.sha256, /^[a-f0-9]{64}$/);

    for (const [metricId, metric] of Object.entries(result.values)) {
      if (metric.availability === "available") {
        assert.ok(Number.isFinite(Number(metric.primary)), `${model} ${metricId} must be numeric`);
      } else {
        assert.ok(metric.primary === "NOT_RUN" || metric.primary === "INPUT_MISSING");
      }
    }
  }
});

test("publishes all formal samples with exact split and granularity semantics", () => {
  for (const [model, result] of Object.entries(acwmDashboardBundle.models)) {
    const ids = result.samples.map((sample) => sample.id);
    assert.equal(result.samples.length, 100, `${model} must publish all formal episodes`);
    assert.equal(new Set(ids).size, 100, `${model} sample IDs must be unique`);
    assert.equal(result.samples.filter((sample) => sample.heldout73).length, 73);

    for (const sample of result.samples) {
      assert.match(sample.id, /^stack_bowls_\d{3}$/);
      for (const [metricId, value] of Object.entries(sample.values)) {
        assert.ok(episodeMetrics.has(metricId), `${metricId} must have episode granularity`);
        assert.ok(Number.isFinite(Number(value)), `${model} ${sample.id} ${metricId} must be finite`);
      }
      assert.equal("JEPA" in sample.values, false);
      assert.equal("AF" in sample.values, false);
      if (sample.media) {
        assert.match(sample.media.prediction.url, /^\/media\/acwm\//);
        assert.match(sample.media.prediction.sha256, /^[a-f0-9]{64}$/);
      }
    }
  }
});

test("preserves legal missing states and exact Interaction joins", () => {
  const cosmos = acwmDashboardBundle.models["Cosmos Predict 2.5"];
  const ctrlworld = acwmDashboardBundle.models.CtrlWorld;

  assert.equal(cosmos.values.INTERACT.availability, "not_run");
  assert.equal(cosmos.values.AF.availability, "input_missing");
  assert.equal(cosmos.values.JEPA.granularity, "distribution");
  assert.equal(ctrlworld.values.AF.groups.all100.value, null);
  assert.equal(ctrlworld.values.AF.missingEvidence.eligibleGroupCount, 0);
  assert.equal(ctrlworld.values.INTERACT.availability, "available");
  assert.equal(ctrlworld.samples.filter((sample) => sample.interaction).length, 100);
  assert.equal(ctrlworld.values.INTERACT.groups.heldout73.value, 0.6410958904109596);

  for (const sample of ctrlworld.samples) {
    assert.equal(sample.values.INTERACT, sample.interaction.normalizedScore.toFixed(8));
    assert.equal(sample.interaction.error, null);
    assert.ok(sample.interaction.reason.length > 0);
  }
});

test("rejects corrupt published bundles instead of silently falling back", () => {
  const duplicate = structuredClone(acwmDashboardBundle);
  duplicate.models.CtrlWorld.samples[99].id = duplicate.models.CtrlWorld.samples[0].id;
  assert.throws(() => validatePublishedBundle(duplicate), /unique samples/);

  const wrongSplit = structuredClone(acwmDashboardBundle);
  wrongSplit.models.CtrlWorld.samples[0].heldout73 = !wrongSplit.models.CtrlWorld.samples[0].heldout73;
  assert.throws(() => validatePublishedBundle(wrongSplit), /heldout73/);

  const fakeEpisodeJepa = structuredClone(acwmDashboardBundle);
  fakeEpisodeJepa.models.CtrlWorld.samples[0].values.JEPA = "0.5";
  assert.throws(() => validatePublishedBundle(fakeEpisodeJepa), /episode JEPA/);

  const zeroFilledAf = structuredClone(acwmDashboardBundle);
  zeroFilledAf.models.CtrlWorld.values.AF.groups.all100.value = 0;
  assert.throws(() => validatePublishedBundle(zeroFilledAf));

  const missingInteractionJoin = structuredClone(acwmDashboardBundle);
  missingInteractionJoin.models.CtrlWorld.samples[0].interaction = null;
  assert.throws(() => validatePublishedBundle(missingInteractionJoin), /Interaction join/);

  const leakedPath = structuredClone(acwmDashboardBundle);
  leakedPath.bundleVersion = "/mnt/private/result";
  assert.throws(() => validatePublishedBundle(leakedPath), /exposes a server path/);

  const collapsedMissingState = structuredClone(acwmDashboardBundle);
  collapsedMissingState.models["Cosmos Predict 2.5"].values.AF.availability = "unavailable";
  assert.throws(() => validatePublishedBundle(collapsedMissingState));

  const mismatchedFailureState = structuredClone(acwmDashboardBundle);
  mismatchedFailureState.models["Cosmos Predict 2.5"].values.AF.availability = "evaluator_failed";
  assert.throws(() => validatePublishedBundle(mismatchedFailureState));
});
