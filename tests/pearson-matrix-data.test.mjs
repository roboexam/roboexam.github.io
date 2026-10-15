import assert from "node:assert/strict";
import test from "node:test";
import { pearsonMatrixDashboardBundle } from "../app/data/pearson-matrix-results.ts";
import { validatePublishedBundle } from "../scripts/export-pearson-matrix-results.mjs";

const EPSILON = 1e-12;

test("publishes split episode-success and metric-only figures with pinned provenance", () => {
  assert.equal(pearsonMatrixDashboardBundle.schemaVersion, "unibench.dashboard.pearson-matrix.v3");
  assert.equal(
    pearsonMatrixDashboardBundle.figures.metricVsEpisodeSuccess.sha256,
    "0ef5c5b52a69ef532c2bec864a439a01f7de32c5e088324d21acb24786e3eca4",
  );
  assert.equal(
    pearsonMatrixDashboardBundle.figures.metricOnlyMatrices.sha256,
    "7d7a37d718d1f3f08b1de0456ae856bf0769f8acc0e826599b7881188c075f8c",
  );
  assert.deepEqual(pearsonMatrixDashboardBundle.panels.map((panel) => panel.episodeCount), [100, 100, 73, 73]);
  assert.deepEqual(pearsonMatrixDashboardBundle.panels.map((panel) => panel.successCorrelationAvailable), [true, true, false, false]);
  assert.equal(Object.keys(pearsonMatrixDashboardBundle.provenance.sourceSha256).length, 4);
  assert.equal(pearsonMatrixDashboardBundle.method.targetUnit, "episode");
  assert.equal(pearsonMatrixDashboardBundle.method.aggregateSuccessRateIsTarget, false);
});

test("derives cohort SR and GigaWorld-style mean(r) groups from metric rows", () => {
  const [pi05, fastwam] = pearsonMatrixDashboardBundle.vlaFindings;
  assert.equal(pi05.cohortSuccessRate, 0.76);
  assert.equal(fastwam.cohortSuccessRate, 0.12);
  assert.deepEqual(pi05.groups.map((group) => group.metricIds), [
    ["left_ee_sparc", "right_ee_sparc"],
    ["left_ee_speed_mean_m_s", "right_ee_speed_mean_m_s"],
  ]);
  assert.ok(Math.abs(pi05.groups[0].meanR - 0.02431619470068136) <= EPSILON);
  assert.ok(Math.abs(pi05.groups[1].meanR - 0.2027985347812504) <= EPSILON);
  assert.ok(Math.abs(fastwam.groups[0].meanR + 0.020948097418567305) <= EPSILON);
  assert.ok(Math.abs(fastwam.groups[1].meanR - 0.25228357623165054) <= EPSILON);
  for (const finding of [pi05, fastwam]) {
    for (const group of finding.groups) {
      const values = group.metricIds.map((metricId) => finding.metrics.find((metric) => metric.metricId === metricId)?.r ?? Number.NaN);
      const expected = values.reduce((sum, value) => sum + value, 0) / values.length;
      assert.ok(Math.abs(group.meanR - expected) <= EPSILON);
      assert.equal(group.aggregation, "arithmetic-mean-of-member-correlations");
    }
  }
});

test("publishes four finite symmetric metric-only matrices without outcome fields", () => {
  assert.equal(pearsonMatrixDashboardBundle.metricOnlyMatrices.length, 4);
  for (const matrix of pearsonMatrixDashboardBundle.metricOnlyMatrices) {
    assert.equal(matrix.outcomeFieldsExcluded, true);
    assert.equal(matrix.metricIds.some((metricId) => /success|outcome|ordinal|official|runtime|step|path|event/i.test(metricId)), false);
    assert.equal(matrix.values.length, matrix.metricIds.length);
    matrix.values.forEach((row, rowIndex) => {
      assert.equal(row.length, matrix.metricIds.length);
      assert.ok(Math.abs(row[rowIndex] - 1) <= EPSILON);
      row.forEach((value, columnIndex) => {
        assert.equal(Number.isFinite(value), true);
        assert.ok(Math.abs(value - matrix.values[columnIndex][rowIndex]) <= EPSILON);
      });
    });
  }
});

test("keeps ACWM metric-only because closed-loop success is unavailable", () => {
  for (const panel of pearsonMatrixDashboardBundle.panels.filter((item) => item.family === "ACWM")) {
    assert.equal(panel.relationship, "metric-to-metric");
    assert.equal(panel.successCorrelationAvailable, false);
    assert.equal(panel.split, "heldout73");
  }
  assert.ok(Math.abs(pearsonMatrixDashboardBundle.acwmFindings[0].pixelFidelityPairs[1].r + 0.9927879270174016) < EPSILON);
  assert.ok(Math.abs(pearsonMatrixDashboardBundle.acwmFindings[1].trajectoryMostRelated.r - 0.49454479733410067) < EPSILON);
});

test("does not leak server paths", () => {
  const serialized = JSON.stringify(pearsonMatrixDashboardBundle);
  assert.equal(serialized.includes("/mnt/"), false);
  assert.equal(/[A-Za-z]:\\\\/.test(serialized), false);
});

test("rejects wrong group means, target fields, corrupt matrices and path leaks", () => {
  const wrongGroup = structuredClone(pearsonMatrixDashboardBundle);
  wrongGroup.vlaFindings[0].groups[0].meanR += 0.1;
  assert.throws(() => validatePublishedBundle(wrongGroup));

  const targetLeak = structuredClone(pearsonMatrixDashboardBundle);
  targetLeak.metricOnlyMatrices[0].metricIds[0] = "success_binary";
  assert.throws(() => validatePublishedBundle(targetLeak));

  const asymmetric = structuredClone(pearsonMatrixDashboardBundle);
  asymmetric.metricOnlyMatrices[0].values[0][1] += 0.1;
  assert.throws(() => validatePublishedBundle(asymmetric));

  const wrongHash = structuredClone(pearsonMatrixDashboardBundle);
  wrongHash.figures.metricOnlyMatrices.sha256 = "0".repeat(64);
  assert.throws(() => validatePublishedBundle(wrongHash));

  const leakedPath = structuredClone(pearsonMatrixDashboardBundle);
  leakedPath.figures.metricVsEpisodeSuccess.url = "/mnt/private/figure.png";
  assert.throws(() => validatePublishedBundle(leakedPath));
});
