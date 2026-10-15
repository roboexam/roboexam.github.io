import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pearsonMatrixPublishConfig,
  pearsonMatrixResultRegistry,
} from "./pearson-matrix-result-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const MATRIX_EPSILON = 1e-12;
const BANNED_MATRIX_FIELD = /success|outcome|ordinal|official|runtime|step|path|event/i;
const VLA_METRIC_IDS = [
  "left_ee_sparc",
  "right_ee_sparc",
  "left_ee_speed_mean_m_s",
  "right_ee_speed_mean_m_s",
];
const ACWM_METRIC_IDS = [
  "mse",
  "masked_mse",
  "psnr",
  "ssim",
  "image_quality",
  "motion_smoothness",
  "trajectory_accuracy",
];

const metricLabels = {
  left_ee_sparc: "L-SPARC",
  right_ee_sparc: "R-SPARC",
  left_ee_speed_mean_m_s: "L-Speed",
  right_ee_speed_mean_m_s: "R-Speed",
  mse: "MSE",
  masked_mse: "M-MSE",
  psnr: "PSNR",
  ssim: "SSIM",
  image_quality: "IQ",
  motion_smoothness: "MS",
  trajectory_accuracy: "TA",
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadBytes(file) {
  const bytes = await readFile(file);
  return { bytes, sha256: sha256(bytes) };
}

async function loadJson(file) {
  const source = await loadBytes(file);
  return { ...source, document: JSON.parse(source.bytes.toString("utf8")) };
}

function assertNoServerPaths(value, location = "bundle") {
  if (typeof value === "string") {
    assert.equal(value.includes("/mnt/"), false, `${location} exposes a server path`);
    assert.equal(/^[A-Za-z]:\\/.test(value), false, `${location} exposes a local path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoServerPaths(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertNoServerPaths(item, `${location}.${key}`));
  }
}

function correlationStrength(r) {
  const magnitude = Math.abs(r);
  if (magnitude < 0.1) return "negligible";
  if (magnitude < 0.3) return "weak";
  if (magnitude < 0.5) return "moderate";
  return "strong";
}

function parseMatrixCsv(bytes) {
  const rows = bytes
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  const metricIds = rows[0].slice(1);
  const rowIds = [];
  const values = [];
  for (const row of rows.slice(1)) {
    assert.equal(row.length, metricIds.length + 1, `invalid matrix row ${row[0]}`);
    rowIds.push(row[0]);
    values.push(row.slice(1).map(Number));
  }
  assert.deepEqual(rowIds, metricIds, "matrix row/column order mismatch");
  return { metricIds, values };
}

function validateMatrix(matrix, expectedMetricIds, location) {
  assert.deepEqual(matrix.metricIds, expectedMetricIds, `${location} metric contract`);
  matrix.metricIds.forEach((metricId) => {
    assert.equal(BANNED_MATRIX_FIELD.test(metricId), false, `${location} contains target-derived field ${metricId}`);
  });
  assert.equal(matrix.values.length, matrix.metricIds.length, `${location} row count`);
  matrix.values.forEach((row, rowIndex) => {
    assert.equal(row.length, matrix.metricIds.length, `${location} column count`);
    row.forEach((value, columnIndex) => {
      assert.equal(Number.isFinite(value), true, `${location}[${rowIndex}][${columnIndex}] is not finite`);
      assert.ok(Math.abs(value - matrix.values[columnIndex][rowIndex]) <= MATRIX_EPSILON, `${location} is not symmetric`);
    });
    assert.ok(Math.abs(row[rowIndex] - 1) <= MATRIX_EPSILON, `${location} diagonal is not 1`);
  });
  return matrix;
}

function vlaFinding(modelId, displayName, family, source) {
  const sourceMetrics = Object.fromEntries(
    source.primary_success_correlations.map((item) => [item.metric, item]),
  );
  const metrics = VLA_METRIC_IDS.map((metricId) => {
    const item = sourceMetrics[metricId];
    assert.ok(item, `${modelId} missing ${metricId}`);
    return {
      metricId,
      displayName: metricLabels[metricId],
      r: item.r,
      qValue: item.q_value_bh,
      ci95: [item.ci95_low, item.ci95_high],
      successMean: item.success_mean,
      nonSuccessMean: item.nonsuccess_mean,
      significant: item.q_value_bh < 0.05,
      direction: item.r >= 0 ? "positive" : "negative",
      strength: correlationStrength(item.r),
    };
  });
  const classificationTotal = Object.values(source.classification_counts).reduce(
    (total, count) => total + count,
    0,
  );
  const cohortSuccessRate = source.classification_counts.success / classificationTotal;
  assert.equal(classificationTotal, source.episode_count, `${modelId} classification total`);
  assert.ok(Math.abs(cohortSuccessRate - source.cohort_success_rate) <= MATRIX_EPSILON, `${modelId} cohort SR`);

  const groups = source.metric_groups.map((group) => {
    const memberValues = group.metric_ids.map((metricId) => {
      const metric = metrics.find((item) => item.metricId === metricId);
      assert.ok(metric, `${modelId}/${group.group_id} unknown member ${metricId}`);
      return metric.r;
    });
    const meanR = memberValues.reduce((sum, value) => sum + value, 0) / memberValues.length;
    assert.ok(Math.abs(meanR - group.mean_r) <= MATRIX_EPSILON, `${modelId}/${group.group_id} mean(r)`);
    return {
      groupId: group.group_id,
      displayName: group.display_name,
      metricIds: group.metric_ids,
      aggregation: "arithmetic-mean-of-member-correlations",
      meanR,
    };
  });

  return {
    modelId,
    displayName,
    family,
    episodeCount: source.episode_count,
    cohortSuccessRate,
    classificationCounts: source.classification_counts,
    target: {
      unit: "episode",
      kind: "strict-binary-success",
      definition: source.success_target.definition,
      aggregateSuccessRateIsTarget: false,
    },
    groups,
    metrics,
  };
}

function matrixPair(matrix, left, right) {
  const leftIndex = matrix.metricIds.indexOf(left);
  const rightIndex = matrix.metricIds.indexOf(right);
  assert.notEqual(leftIndex, -1, `missing Pearson metric ${left}`);
  assert.notEqual(rightIndex, -1, `missing Pearson metric ${right}`);
  const r = matrix.values[leftIndex][rightIndex];
  return {
    leftMetricId: left,
    leftDisplayName: metricLabels[left],
    rightMetricId: right,
    rightDisplayName: metricLabels[right],
    r,
    strength: correlationStrength(r),
  };
}

function acwmFinding(modelId, displayName, source, matrix) {
  const trajectoryIndex = matrix.metricIds.indexOf("trajectory_accuracy");
  const trajectoryPeers = matrix.metricIds
    .filter((metricId) => metricId !== "trajectory_accuracy")
    .map((metricId) => ({
      metricId,
      r: matrix.values[trajectoryIndex][matrix.metricIds.indexOf(metricId)],
    }));
  const trajectoryMax = trajectoryPeers.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  return {
    modelId,
    displayName,
    episodeCount: source.heldout73_episode_count,
    successCorrelationAvailable: false,
    pixelFidelityPairs: [
      matrixPair(matrix, "mse", "masked_mse"),
      matrixPair(matrix, "mse", "psnr"),
      matrixPair(matrix, "psnr", "ssim"),
    ],
    trajectoryMostRelated: matrixPair(matrix, "trajectory_accuracy", trajectoryMax.metricId),
  };
}

function matrixRecord(modelId, displayName, family, episodeCount, split, matrix) {
  return {
    modelId,
    displayName,
    family,
    episodeCount,
    split,
    metricIds: matrix.metricIds,
    metricLabels: matrix.metricIds.map((metricId) => metricLabels[metricId]),
    values: matrix.values,
    outcomeFieldsExcluded: true,
  };
}

function validateFormalSummary(manifest, analysis) {
  assert.equal(manifest.schema_version, "benchmark2027-analysis-artifact-manifest-v2");
  assert.equal(manifest.result_version, pearsonMatrixResultRegistry.resultVersion);
  assert.equal(manifest.task, pearsonMatrixResultRegistry.task);
  assert.equal(
    manifest.figures.metric_vs_episode_success.sha256,
    pearsonMatrixResultRegistry.figures.metricVsEpisodeSuccess.expectedSha256,
  );
  assert.equal(
    manifest.figures.metric_only_matrices.sha256,
    pearsonMatrixResultRegistry.figures.metricOnlyMatrices.expectedSha256,
  );
  assert.equal(analysis.schema_version, "benchmark2027-metrics-pearson-analysis-v2");
  assert.equal(analysis.task, "stack_bowls");
  assert.equal(analysis.method.pearson, "pairwise-complete Pearson r");
  assert.equal(analysis.method.headline_target_unit, "episode");
  assert.equal(analysis.method.aggregate_success_rate_is_target, false);
  assert.equal(analysis.vla.pi05.episode_count, 100);
  assert.equal(analysis.vla.pi05.distinct_seeds, 100);
  assert.equal(analysis.vla.fastwam.episode_count, 100);
  assert.equal(analysis.vla.fastwam.distinct_seeds, 100);
  assert.equal(analysis.acwm.cosmos_predict2_5.heldout73_episode_count, 73);
  assert.equal(analysis.acwm.ctrlworld.heldout73_episode_count, 73);
  assert.equal(
    analysis.acwm.cosmos_predict2_5.success_correlation_status,
    "undefined_no_variable_closed_loop_outcome",
  );
  assert.equal(
    analysis.acwm.ctrlworld.success_correlation_status,
    "undefined_no_variable_closed_loop_outcome",
  );
}

function validateFigure(figure, expected, publicConfig, location) {
  assert.equal(figure.url, publicConfig.url, `${location} URL`);
  assert.equal(figure.sha256, expected.expectedSha256, `${location} SHA256`);
  assert.equal(figure.bytes, expected.expectedBytes, `${location} bytes`);
  assert.equal(figure.width, expected.expectedWidth, `${location} width`);
  assert.equal(figure.height, expected.expectedHeight, `${location} height`);
}

export function validatePublishedBundle(bundle) {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.pearson-matrix.v3");
  assert.equal(bundle.bundleVersion, pearsonMatrixPublishConfig.bundleVersion);
  assert.equal(bundle.task, "stack_bowls");
  assert.equal(bundle.method.targetUnit, "episode");
  assert.equal(bundle.method.aggregateSuccessRateIsTarget, false);
  validateFigure(
    bundle.figures.metricVsEpisodeSuccess,
    pearsonMatrixResultRegistry.figures.metricVsEpisodeSuccess,
    pearsonMatrixPublishConfig.figures.metricVsEpisodeSuccess,
    "metric-vs-success figure",
  );
  validateFigure(
    bundle.figures.metricOnlyMatrices,
    pearsonMatrixResultRegistry.figures.metricOnlyMatrices,
    pearsonMatrixPublishConfig.figures.metricOnlyMatrices,
    "metric-only figure",
  );
  assert.deepEqual(bundle.panels.map((panel) => panel.modelId), [
    "pi05",
    "fastwam",
    "cosmos_predict2_5",
    "ctrlworld",
  ]);
  assert.deepEqual(bundle.panels.map((panel) => panel.episodeCount), [100, 100, 73, 73]);
  assert.deepEqual(bundle.panels.map((panel) => panel.successCorrelationAvailable), [true, true, false, false]);
  assert.deepEqual(bundle.vlaFindings.map((model) => model.metrics.length), [4, 4]);
  assert.deepEqual(bundle.vlaFindings.map((model) => model.groups.length), [2, 2]);
  assert.deepEqual(bundle.vlaFindings[0].groups.map((group) => group.metricIds), [
    ["left_ee_sparc", "right_ee_sparc"],
    ["left_ee_speed_mean_m_s", "right_ee_speed_mean_m_s"],
  ]);
  assert.ok(Math.abs(bundle.vlaFindings[0].groups[0].meanR - 0.02431619470068136) <= MATRIX_EPSILON);
  assert.ok(Math.abs(bundle.vlaFindings[0].groups[1].meanR - 0.2027985347812504) <= MATRIX_EPSILON);
  assert.ok(Math.abs(bundle.vlaFindings[1].groups[0].meanR + 0.020948097418567305) <= MATRIX_EPSILON);
  assert.ok(Math.abs(bundle.vlaFindings[1].groups[1].meanR - 0.25228357623165054) <= MATRIX_EPSILON);
  bundle.vlaFindings.forEach((finding) => {
    const total = Object.values(finding.classificationCounts).reduce((sum, count) => sum + count, 0);
    assert.equal(total, 100);
    assert.ok(Math.abs(finding.cohortSuccessRate - finding.classificationCounts.success / total) <= MATRIX_EPSILON);
    assert.equal(finding.target.aggregateSuccessRateIsTarget, false);
  });
  assert.deepEqual(bundle.crossModel.repeatedSignificantMetricIds, ["left_ee_speed_mean_m_s"]);
  assert.equal(bundle.crossModel.pairedSeedSuccess.pairedSeedCount, 100);
  assert.equal(bundle.acwmFindings.length, 2);
  assert.equal(bundle.metricOnlyMatrices.length, 4);
  bundle.metricOnlyMatrices.forEach((matrix) => {
    validateMatrix(
      { metricIds: matrix.metricIds, values: matrix.values },
      matrix.family === "ACWM" ? ACWM_METRIC_IDS : VLA_METRIC_IDS,
      `bundle/${matrix.modelId}`,
    );
    assert.equal(matrix.outcomeFieldsExcluded, true);
  });
  Object.values(bundle.provenance.sourceSha256).forEach((hash) => assert.match(hash, SHA256));
  assertNoServerPaths(bundle);
  return bundle;
}

export async function buildPublishedBundle() {
  const [manifest, analysis, successFigure, matrixFigure, pi05MatrixSource, fastwamMatrixSource, cosmosMatrixSource, ctrlworldMatrixSource] =
    await Promise.all([
      loadJson(pearsonMatrixResultRegistry.manifestFile),
      loadJson(pearsonMatrixResultRegistry.analysisFile),
      loadBytes(pearsonMatrixResultRegistry.figures.metricVsEpisodeSuccess.file),
      loadBytes(pearsonMatrixResultRegistry.figures.metricOnlyMatrices.file),
      loadBytes(pearsonMatrixResultRegistry.matrixFiles.pi05.file),
      loadBytes(pearsonMatrixResultRegistry.matrixFiles.fastwam.file),
      loadBytes(pearsonMatrixResultRegistry.matrixFiles.cosmosPredict25.file),
      loadBytes(pearsonMatrixResultRegistry.matrixFiles.ctrlworld.file),
    ]);
  assert.equal(manifest.sha256, pearsonMatrixResultRegistry.expectedManifestSha256, "manifest SHA256");
  assert.equal(analysis.sha256, pearsonMatrixResultRegistry.expectedAnalysisSha256, "analysis SHA256");
  const figureSources = {
    metricVsEpisodeSuccess: successFigure,
    metricOnlyMatrices: matrixFigure,
  };
  for (const [figureId, source] of Object.entries(figureSources)) {
    const expected = pearsonMatrixResultRegistry.figures[figureId];
    assert.equal(source.sha256, expected.expectedSha256, `${figureId} SHA256`);
    assert.equal(source.bytes.length, expected.expectedBytes, `${figureId} bytes`);
  }
  const matrixSources = {
    pi05: pi05MatrixSource,
    fastwam: fastwamMatrixSource,
    cosmosPredict25: cosmosMatrixSource,
    ctrlworld: ctrlworldMatrixSource,
  };
  for (const [matrixId, source] of Object.entries(matrixSources)) {
    assert.equal(source.sha256, pearsonMatrixResultRegistry.matrixFiles[matrixId].expectedSha256, `${matrixId} matrix SHA256`);
  }
  validateFormalSummary(manifest.document, analysis.document);

  const matrices = {
    pi05: validateMatrix(parseMatrixCsv(pi05MatrixSource.bytes), VLA_METRIC_IDS, "pi05"),
    fastwam: validateMatrix(parseMatrixCsv(fastwamMatrixSource.bytes), VLA_METRIC_IDS, "fastwam"),
    cosmos: validateMatrix(parseMatrixCsv(cosmosMatrixSource.bytes), ACWM_METRIC_IDS, "cosmos"),
    ctrlworld: validateMatrix(parseMatrixCsv(ctrlworldMatrixSource.bytes), ACWM_METRIC_IDS, "ctrlworld"),
  };
  const pi05Finding = vlaFinding("pi05", "Pi0.5", "VLA", analysis.document.vla.pi05);
  const fastWamFinding = vlaFinding("fastwam", "FastWAM", "WAM", analysis.document.vla.fastwam);
  const repeatedSignificantMetricIds = pi05Finding.metrics
    .filter((metric) => metric.significant)
    .map((metric) => metric.metricId)
    .filter((metricId) => fastWamFinding.metrics.some((metric) => metric.metricId === metricId && metric.significant));

  const formalSourceHashes = {};
  for (const source of pearsonMatrixResultRegistry.formalSources) {
    const current = await loadBytes(source.file);
    assert.equal(current.sha256, source.expectedSha256, `${source.modelId} source SHA256`);
    formalSourceHashes[source.modelId] = current.sha256;
  }

  function figureRecord(figureId, title, alt) {
    const expected = pearsonMatrixResultRegistry.figures[figureId];
    const source = figureSources[figureId];
    return {
      title,
      alt,
      url: pearsonMatrixPublishConfig.figures[figureId].url,
      sha256: source.sha256,
      bytes: source.bytes.length,
      width: expected.expectedWidth,
      height: expected.expectedHeight,
    };
  }

  return validatePublishedBundle({
    schemaVersion: "unibench.dashboard.pearson-matrix.v3",
    bundleVersion: pearsonMatrixPublishConfig.bundleVersion,
    generatedBy: "scripts/export-pearson-matrix-results.mjs",
    task: "stack_bowls",
    title: "Stack Bowls Pearson Correlation Analysis",
    method: {
      correlation: analysis.document.method.pearson,
      targetUnit: "episode",
      targetKind: "strict-binary-success",
      binaryOutcome: analysis.document.method.binary_outcome,
      aggregateSuccessRateIsTarget: false,
      groupAggregation: "arithmetic mean of member metric Pearson r values",
      ordinalSensitivity: analysis.document.method.ordinal_sensitivity,
      confidenceInterval: analysis.document.method.confidence_interval,
      multiplicity: analysis.document.method.multiplicity,
      causalityClaim: false,
    },
    figures: {
      metricVsEpisodeSuccess: figureRecord(
        "metricVsEpisodeSuccess",
        "Pearson Correlation with Episode Success",
        "Pi0.5 与 FastWAM 的 primary metrics 对逐 episode 严格成功标签的 Pearson 相关",
      ),
      metricOnlyMatrices: figureRecord(
        "metricOnlyMatrices",
        "Metric-only Pearson Correlation Matrices",
        "Pi0.5、FastWAM、Cosmos Predict 2.5 与 CtrlWorld 的 metric-only Pearson 矩阵，不含 outcome 字段",
      ),
    },
    panels: [
      { modelId: "pi05", displayName: "Pi0.5", family: "VLA", episodeCount: 100, split: "formal100", relationship: "metric-to-episode-success-and-metric-to-metric", successCorrelationAvailable: true },
      { modelId: "fastwam", displayName: "FastWAM", family: "WAM", episodeCount: 100, split: "formal100", relationship: "metric-to-episode-success-and-metric-to-metric", successCorrelationAvailable: true },
      { modelId: "cosmos_predict2_5", displayName: "Cosmos Predict 2.5", family: "ACWM", episodeCount: 73, split: "heldout73", relationship: "metric-to-metric", successCorrelationAvailable: false },
      { modelId: "ctrlworld", displayName: "CtrlWorld", family: "ACWM", episodeCount: 73, split: "heldout73", relationship: "metric-to-metric", successCorrelationAvailable: false },
    ],
    vlaFindings: [pi05Finding, fastWamFinding],
    metricOnlyMatrices: [
      matrixRecord("pi05", "Pi0.5", "VLA", 100, "formal100", matrices.pi05),
      matrixRecord("fastwam", "FastWAM", "WAM", 100, "formal100", matrices.fastwam),
      matrixRecord("cosmos_predict2_5", "Cosmos Predict 2.5", "ACWM", 73, "heldout73", matrices.cosmos),
      matrixRecord("ctrlworld", "CtrlWorld", "ACWM", 73, "heldout73", matrices.ctrlworld),
    ],
    crossModel: {
      repeatedSignificantMetricIds,
      pairedSeedSuccess: {
        pairedSeedCount: analysis.document.vla_paired_seed_analysis.paired_seed_count,
        r: analysis.document.vla_paired_seed_analysis.success_phi_pearson_r,
        pValue: analysis.document.vla_paired_seed_analysis.success_phi_p_value,
        contingency: analysis.document.vla_paired_seed_analysis.contingency,
      },
    },
    acwmFindings: [
      acwmFinding("cosmos_predict2_5", "Cosmos Predict 2.5", analysis.document.acwm.cosmos_predict2_5, matrices.cosmos),
      acwmFinding("ctrlworld", "CtrlWorld", analysis.document.acwm.ctrlworld, matrices.ctrlworld),
    ],
    provenance: {
      resultManifestSha256: manifest.sha256,
      analysisSummarySha256: analysis.sha256,
      sourceSha256: formalSourceHashes,
    },
  });
}

async function main() {
  const serialized = `${JSON.stringify(await buildPublishedBundle(), null, 2)}\n`;
  const figureEntries = Object.entries(pearsonMatrixPublishConfig.figures);
  if (process.argv.includes("--check")) {
    const currentBundle = await readFile(pearsonMatrixPublishConfig.outputFile, "utf8");
    assert.equal(currentBundle, serialized, "published Pearson bundle is stale; run npm run export:pearson");
    for (const [figureId, publishConfig] of figureEntries) {
      const current = await readFile(publishConfig.outputFile);
      assert.equal(sha256(current), pearsonMatrixResultRegistry.figures[figureId].expectedSha256, `${figureId} public SHA256`);
    }
    console.log("Published Pearson bundle and both figures match the allowlisted v2 analysis.");
    return;
  }
  await Promise.all([
    mkdir(path.dirname(pearsonMatrixPublishConfig.outputFile), { recursive: true }),
    ...figureEntries.map(([, config]) => mkdir(path.dirname(config.outputFile), { recursive: true })),
  ]);
  await Promise.all([
    writeFile(pearsonMatrixPublishConfig.outputFile, serialized),
    ...figureEntries.map(([figureId, config]) =>
      copyFile(pearsonMatrixResultRegistry.figures[figureId].file, config.outputFile),
    ),
  ]);
  console.log(`Published Pearson bundle: ${pearsonMatrixPublishConfig.outputFile}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
