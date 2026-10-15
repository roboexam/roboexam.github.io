import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { l1MetricContracts } from "./l1-metric-contracts.mjs";
import { l1Phase1ProvisionalRegistry } from "./l1-phase1-provisional-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "app/data/generated/l1-phase1-provisional.json");
const checkOnly = process.argv.includes("--check");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readPinned(relativePath, expectedSha256) {
  const bytes = await readFile(path.join(l1Phase1ProvisionalRegistry.resultRoot, relativePath));
  assert.equal(sha256(bytes), expectedSha256, `Phase 1 artifact hash drift: ${relativePath}`);
  return { bytes, value: JSON.parse(bytes) };
}

async function readAbsolutePinned(absolutePath, expectedSha256, label) {
  const bytes = await readFile(absolutePath);
  assert.equal(sha256(bytes), expectedSha256, `Phase 1 artifact hash drift: ${label}`);
  return bytes;
}

function parseJsonl(bytes, label) {
  return bytes.toString("utf8").split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is invalid JSON`, { cause: error });
    }
  });
}

function terminalTotal(counts) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value), 0);
}

function scoreBearingCount(counts) {
  return Number(counts.scored ?? 0)
    + Number(counts.scored_provisional_gt ?? 0)
    + Number(counts.scored_provisional_judge ?? 0);
}

function resultState(counts, score) {
  if (score === null) return "contract_pending";
  if (counts.scored_provisional_judge) return "scored_provisional_judge";
  if (counts.scored_provisional_gt) return "scored_provisional_gt";
  if (counts.contract_pending) return "scored_with_contract_pending";
  return "scored";
}

function scoreTier(state) {
  if (state === "scored_provisional_judge") return "provisional_judge_uncalibrated";
  if (state === "scored_provisional_gt") return "provisional_gt_not_human_signed_off";
  if (state === "scored_with_contract_pending") return "frozen_deterministic_with_contract_pending";
  if (state === "contract_pending") return "contract_pending";
  return "frozen_deterministic";
}

async function build() {
  const { value: summary } = await readPinned(
    "summary.provisional.json",
    l1Phase1ProvisionalRegistry.expectedSha256["summary.provisional.json"],
  );
  const { value: experimentManifest } = await readPinned(
    "experiment_manifest.json",
    l1Phase1ProvisionalRegistry.expectedSha256["experiment_manifest.json"],
  );
  const readSummaryArtifact = (relativePath) => {
    const expected = summary.artifact_sha256[relativePath];
    assert.match(expected, /^[a-f0-9]{64}$/, `missing Phase 1 artifact pin: ${relativePath}`);
    return readPinned(relativePath, expected);
  };
  const [coverageSource, aggregateSource, publishabilitySource, validationSource] = await Promise.all([
    readSummaryArtifact("coverage.json"),
    readSummaryArtifact("aggregate.combined_pilot_descriptive.json"),
    readSummaryArtifact("publishability_report.json"),
    readSummaryArtifact("validation.json"),
  ]);
  const coverage = coverageSource.value;
  const aggregate = aggregateSource.value;
  const publishability = publishabilitySource.value;
  const validation = validationSource.value;
  const [publicBytes, predictionBytes] = await Promise.all([
    readAbsolutePinned(
      l1Phase1ProvisionalRegistry.publicManifest,
      l1Phase1ProvisionalRegistry.publicManifestSha256,
      "public.jsonl",
    ),
    readAbsolutePinned(
      path.join(l1Phase1ProvisionalRegistry.resultRoot, "predictions.jsonl"),
      l1Phase1ProvisionalRegistry.expectedSha256["predictions.jsonl"],
      "predictions.jsonl",
    ),
  ]);
  const publicRows = parseJsonl(publicBytes, "public.jsonl");
  const predictionRows = parseJsonl(predictionBytes, "predictions.jsonl");

  assert.equal(summary.status, "PASS");
  assert.equal(summary.result_tier, "provisional");
  assert.equal(summary.publish_scope, "internal_development_only");
  assert.equal(summary.human_gt_review, "not_started");
  assert.equal(summary.judge_human_calibration, "waived_for_provisional_run");
  assert.equal(summary.cross_layer_total, "forbidden");
  assert.equal(summary.tested_model, "nvidia/Cosmos3-Nano");
  assert.equal(summary.prediction_count, 1070);
  assert.equal(summary.prediction_sha256, "2b2c5ca43c58b9151a2b74eb609bee36b7b63aeef6fd9f240403b888f6a110e3");
  assert.equal(summary.prediction_sha256, l1Phase1ProvisionalRegistry.expectedSha256["predictions.jsonl"]);
  assert.equal(experimentManifest.tested_model, "nvidia/Cosmos3-Nano");
  assert.equal(experimentManifest.judge_model, "Qwen/Qwen3-VL-8B-Instruct");
  assert.equal(aggregate.contract_version, "benchmark2027-cosmos3-native-l1-all-metrics-v0.2");
  assert.equal(aggregate.cross_layer_total, "forbidden");
  assert.equal(publishability.external_publication_ready, false);
  assert.equal(publishability.internal_development_release, true);
  assert.equal(validation.status, "PASS");
  assert.ok(Object.values(validation.checks).every(Boolean));
  assert.equal(coverage.infrastructure_failure_count, 0);
  assert.equal(coverage.membership_count, summary.membership_count);
  assert.deepEqual(coverage.terminal_counts, summary.terminal_counts);
  assert.equal(publicRows.length, summary.prediction_count);
  assert.equal(predictionRows.length, summary.prediction_count);

  const publicById = new Map(publicRows.map((row) => [row.canonical_sample_id, row]));
  const predictionById = new Map(predictionRows.map((row) => [row.canonical_sample_id, row]));
  assert.equal(publicById.size, publicRows.length, "duplicate canonical_sample_id in public manifest");
  assert.equal(predictionById.size, predictionRows.length, "duplicate canonical_sample_id in predictions");
  assert.deepEqual([...publicById.keys()].sort(), [...predictionById.keys()].sort());

  const contractIds = l1MetricContracts.map((metric) => metric.metric_id);
  assert.deepEqual(Object.keys(summary.metric_scores).sort(), [...contractIds].sort());
  assert.deepEqual(Object.keys(coverage.per_metric_terminal_counts).sort(), [...contractIds].sort());
  const aggregateMetrics = aggregate.per_split.combined_development_pilot.metric_scores;
  assert.deepEqual(Object.keys(aggregateMetrics).sort(), [...contractIds].sort());

  const representativeEntries = Object.entries(l1Phase1ProvisionalRegistry.representativeSampleIds);
  assert.equal(representativeEntries.length, 10, "expected one representative for each canonical query type");
  assert.equal(new Set(representativeEntries.map(([, sampleId]) => sampleId)).size, representativeEntries.length);
  for (const [queryType, sampleId] of representativeEntries) {
    const row = publicById.get(sampleId);
    assert.ok(row, `representative sample is absent from public.jsonl: ${sampleId}`);
    assert.equal(row.query_type, queryType, `query type drift for representative ${sampleId}`);
  }

  const examples = representativeEntries
    .map(([, sampleId]) => publicById.get(sampleId))
    .sort((left, right) => left.canonical_sample_id.localeCompare(right.canonical_sample_id))
    .map((row) => {
    const sampleId = row.canonical_sample_id;
    const prediction = predictionById.get(sampleId);
    assert.ok(prediction, `sample is absent from predictions.jsonl: ${sampleId}`);
    assert.equal(row.task_id, "stack_bowls");
    assert.equal(row.camera.startsWith("cam_"), true);
    assert.ok(typeof row.question === "string" && row.question.length > 0);
    assert.ok(typeof row.instruction === "string" && row.instruction.length > 0);
    assert.ok(Array.isArray(row.frame_indices) && row.frame_indices.length > 0);
    assert.equal(row.frame_indices.length, row.media_paths.length);
    assert.deepEqual(prediction.frame_indices, row.frame_indices, `prediction frame drift: ${sampleId}`);
    assert.deepEqual(prediction.media_paths, row.media_paths, `prediction media drift: ${sampleId}`);
    assert.equal(prediction.collection_status, "ok", `prediction collection failure: ${sampleId}`);
    const media = row.media_paths.map((mediaPath, index) => {
      const mediaSha256 = row.media_sha256[mediaPath];
      assert.match(mediaSha256, /^[a-f0-9]{64}$/, `missing media hash: ${sampleId}`);
      return {
        url: `/api/l1-phase1-media/samples/${mediaSha256}.png`,
        sha256: mediaSha256,
        frameIndex: row.frame_indices[index],
      };
    });
    return {
      canonicalSampleId: sampleId,
      taskId: row.task_id,
      episodeBlueprintId: row.episode_blueprint_id,
      seed: row.seed,
      split: row.split,
      instruction: row.instruction,
      question: row.question,
      queryType: row.query_type,
      promptFamily: row.prompt_family,
      camera: row.camera,
      frameIndices: row.frame_indices,
      media,
      metricMemberships: row.metric_memberships,
      reviewStatus: "automated_binding_verified",
    };
  });
  assert.equal(examples.length, representativeEntries.length);

  const exampleByMetricId = {};
  for (const [, sampleId] of representativeEntries) {
    const example = examples.find((candidate) => candidate.canonicalSampleId === sampleId);
    assert.ok(example);
    for (const metricId of example.metricMemberships) {
      assert.equal(exampleByMetricId[metricId], undefined, `metric has multiple default examples: ${metricId}`);
      exampleByMetricId[metricId] = example.canonicalSampleId;
    }
  }
  assert.deepEqual(Object.keys(exampleByMetricId).sort(), [...contractIds].sort());

  const metrics = l1MetricContracts.map((contract) => {
    const rawScore = summary.metric_scores[contract.metric_id];
    const terminalCounts = coverage.per_metric_terminal_counts[contract.metric_id];
    const aggregateMetric = aggregateMetrics[contract.metric_id];
    const state = resultState(terminalCounts, rawScore);
    if (rawScore === null) {
      assert.equal(aggregateMetric, null, `${contract.metric_id} null score drift`);
      assert.equal(scoreBearingCount(terminalCounts), 0, `${contract.metric_id} unexpectedly has score-bearing items`);
      assert.ok(terminalCounts.contract_pending > 0, `${contract.metric_id} lacks a genuine pending state`);
    } else {
      assert.ok(Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 1, `${contract.metric_id} score is invalid`);
      assert.equal(aggregateMetric.score, rawScore, `${contract.metric_id} aggregate score drift`);
      assert.ok(scoreBearingCount(terminalCounts) > 0, `${contract.metric_id} lacks score-bearing items`);
    }
    return {
      metricId: contract.metric_id,
      layer: contract.layer,
      score: rawScore === null ? null : rawScore * 100,
      rawScore,
      state,
      scoreTier: scoreTier(state),
      lane: state === "scored_provisional_judge" ? "judge" : "deterministic",
      scoreBearingN: scoreBearingCount(terminalCounts),
      membershipN: terminalTotal(terminalCounts),
      terminalCounts,
      aggregationProfile: aggregateMetric?.profile ?? null,
    };
  });
  assert.equal(metrics.filter((metric) => metric.score !== null).length, 26);
  assert.equal(metrics.filter((metric) => metric.score === null).length, 3);
  assert.equal(metrics.reduce((sum, metric) => sum + metric.membershipN, 0), summary.membership_count);

  const layers = Object.fromEntries(["L1-A", "L1-B", "L1-C", "L1-D"].map((layer) => {
    const layerMetrics = metrics.filter((metric) => metric.layer === layer);
    return [layer, {
      metricCount: layerMetrics.length,
      numericMetricCount: layerMetrics.filter((metric) => metric.score !== null).length,
      pendingMetricCount: layerMetrics.filter((metric) => metric.score === null).length,
    }];
  }));

  return {
    schemaVersion: l1Phase1ProvisionalRegistry.schemaVersion,
    bundleVersion: l1Phase1ProvisionalRegistry.bundleVersion,
    generatedAt: l1Phase1ProvisionalRegistry.generatedAt,
    run: {
      id: summary.run_id,
      status: summary.status,
      testedModel: summary.tested_model,
      predictionCount: summary.prediction_count,
      predictionSha256: summary.prediction_sha256,
      contractVersion: aggregate.contract_version,
      resultTier: summary.result_tier,
      publishScope: summary.publish_scope,
      humanGtReview: summary.human_gt_review,
      judgeModel: experimentManifest.judge_model,
      judgeHumanCalibration: summary.judge_human_calibration,
      generalizationScope: summary.generalization_scope,
      crossLayerTotal: summary.cross_layer_total,
    },
    coverage: {
      membershipCount: coverage.membership_count,
      nonNotApplicableMembershipCount: coverage.non_not_applicable_membership_count,
      scoreBearingMembershipCount: coverage.score_bearing_membership_count,
      scoreBearingFraction: coverage.score_bearing_fraction_of_non_not_applicable,
      metricCount: coverage.metric_count,
      numericMetricCount: coverage.metrics_with_numeric_provisional_score,
      terminalCounts: coverage.terminal_counts,
      infrastructureFailureCount: coverage.infrastructure_failure_count,
    },
    layers,
    metrics,
    examples,
    exampleByMetricId,
    blockers: publishability.blockers,
    forbiddenClaims: publishability.forbidden_claims,
    sourceHashes: {
      "summary.provisional.json": l1Phase1ProvisionalRegistry.expectedSha256["summary.provisional.json"],
      "coverage.json": summary.artifact_sha256["coverage.json"],
      "aggregate.combined_pilot_descriptive.json": summary.artifact_sha256["aggregate.combined_pilot_descriptive.json"],
      "publishability_report.json": summary.artifact_sha256["publishability_report.json"],
      "validation.json": summary.artifact_sha256["validation.json"],
      "experiment_manifest.json": l1Phase1ProvisionalRegistry.expectedSha256["experiment_manifest.json"],
      "public.jsonl": l1Phase1ProvisionalRegistry.publicManifestSha256,
      "predictions.jsonl": l1Phase1ProvisionalRegistry.expectedSha256["predictions.jsonl"],
    },
  };
}

const rendered = `${JSON.stringify(await build(), null, 2)}\n`;
if (checkOnly) {
  assert.equal(await readFile(outputPath, "utf8"), rendered, "generated Phase 1 provisional bundle is stale");
  console.log("Phase 1 provisional dashboard bundle is current.");
} else {
  await writeFile(outputPath, rendered);
  console.log(`Published Phase 1 provisional dashboard bundle: ${outputPath}`);
}
