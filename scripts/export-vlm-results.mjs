import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vlmPublishConfig, vlmResultRegistry } from "./vlm-result-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;
const EXPECTED_COUNTS = {
  memberships: 1277,
  canonicalPredictions: 1200,
  deterministicScored: 1089,
  judgePending: 177,
  parseFailures: 11,
  infrastructureFailures: 0,
};

const METRICS = [
  { id: "DIRECT", source: "rynnbrain_bench", split: "grounding", scope: "direct referring", name: "Direct Acc@0.5", plannedN: 50, unit: "accuracy", sampleEvaluationId: "rynnbrain_bench:grounding:1002" },
  { id: "SITUATIONAL", source: "rynnbrain_bench", split: "grounding", scope: "situational referring", name: "Situational Acc@0.5", plannedN: 50, unit: "accuracy", sampleEvaluationId: "rynnbrain_bench:grounding:1" },
  { id: "OBJ-REF", source: "rynnbrain_bench", split: "grounding", scope: "official_all", name: "Object Referring All", plannedN: 100, unit: "accuracy", sampleEvaluationId: "rynnbrain_bench:grounding:526" },
  { id: "MRA", source: "rynnbrain_bench", split: "spatial_cognition", scope: "official_metric_family", name: "MRA", plannedN: 19, unit: "normalized score", sampleEvaluationId: "rynnbrain_bench:spatial_cognition:4555" },
  { id: "RoA", source: "rynnbrain_bench", split: "spatial_cognition", scope: "official_metric_family", name: "RoA", plannedN: 4, unit: "normalized score", sampleEvaluationId: "rynnbrain_bench:spatial_cognition:6664" },
  { id: "AREA", source: "rynnbrain_bench", split: "area", scope: "area", name: "predicted_point_fraction_inside_gt_polygon", plannedN: 100, unit: "point fraction", sampleEvaluationId: "rynnbrain_bench:area:1102" },
  { id: "AFF", source: "rynnbrain_bench", split: "affordance", scope: "affordance", name: "exp_neg_mean_nearest_euclidean_distance", plannedN: 100, unit: "similarity", sampleEvaluationId: "rynnbrain_bench:affordance:103" },
  { id: "PIO-S1", source: "point_it_out", split: "s1", scope: "s1", name: "PIO S1 repo-code bbox IoU", plannedN: 229, unit: "IoU", sampleEvaluationId: "point_it_out:s1:147" },
  { id: "PIO-S2", source: "point_it_out", split: "s2", scope: "s2", name: "PIO S2 repo-code bbox IoU", plannedN: 271, unit: "IoU", sampleEvaluationId: "point_it_out:s2:32" },
  { id: "RS-LOC", source: "refspatial_bench", split: "location", scope: "location", name: "RefSpatial Location point-in-mask", plannedN: 100, unit: "point-in-mask rate", sampleEvaluationId: "refspatial_bench:location:0" },
  { id: "RS-PLACE", source: "refspatial_bench", split: "placement", scope: "placement", name: "RefSpatial Placement point-in-mask", plannedN: 100, unit: "point-in-mask rate", sampleEvaluationId: "refspatial_bench:placement:0" },
  { id: "RS-UNSEEN", source: "refspatial_bench", split: "unseen", scope: "unseen", name: "RefSpatial Unseen point-in-mask", plannedN: 77, unit: "point-in-mask rate", sampleEvaluationId: "refspatial_bench:unseen:10" },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadJson(file, expectedSha256, label) {
  const bytes = await readFile(file);
  const actualSha256 = sha256(bytes);
  assert.equal(actualSha256, expectedSha256, `${label} SHA-256`);
  return { document: JSON.parse(bytes.toString("utf8")), sha256: actualSha256 };
}

async function loadJsonl(file, expectedSha256, label) {
  const bytes = await readFile(file);
  const actualSha256 = sha256(bytes);
  assert.equal(actualSha256, expectedSha256, `${label} SHA-256`);
  const records = bytes.toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { document: records, sha256: actualSha256 };
}

function indexUnique(records, key, label) {
  const indexed = new Map();
  for (const record of records) {
    const value = record[key];
    assert.equal(typeof value, "string", `${label} ${key}`);
    assert.equal(indexed.has(value), false, `duplicate ${label} ${value}`);
    indexed.set(value, record);
  }
  return indexed;
}

function predictionByEvaluationId(records) {
  const indexed = new Map();
  for (const prediction of records) {
    assert.equal(prediction.collection_status, "ok", `${prediction.canonical_sample_id} collection status`);
    for (const evaluationId of prediction.covered_evaluation_ids) {
      assert.equal(indexed.has(evaluationId), false, `duplicate prediction membership ${evaluationId}`);
      indexed.set(evaluationId, prediction);
    }
  }
  return indexed;
}

function selectedMediaIndexes(count, question, parsedOutput) {
  assert.ok(count > 0, "sample must have model-visible media");
  if (count <= 6) return Array.from({ length: count }, (_, index) => index);
  const indexes = new Set([0, Math.floor((count - 1) / 4), Math.floor((count - 1) / 2), Math.floor((count - 1) * 3 / 4), count - 1]);
  for (const match of question.matchAll(/<frame\s*(\d+)>/gi)) indexes.add(Number(match[1]));
  if (Number.isInteger(parsedOutput?.frame_idx)) indexes.add(parsedOutput.frame_idx);
  return [...indexes].filter((index) => index >= 0 && index < count).sort((left, right) => left - right).slice(0, 7);
}

function assertSampleMembership(specification, item) {
  assert.equal(item.source_benchmark, specification.source, `${specification.id} sample source`);
  if (specification.id === "OBJ-REF") {
    assert.equal(item.split, "grounding");
    assert.ok(["direct referring", "situational referring"].includes(item.native_task));
  } else if (["MRA", "RoA"].includes(specification.id)) {
    assert.equal(item.split, "spatial_cognition");
    assert.equal(item.metric.metric_name, specification.id);
  } else {
    assert.equal(item.split, specification.split, `${specification.id} sample split`);
    if (specification.id === "DIRECT") assert.equal(item.native_task, "direct referring");
    if (specification.id === "SITUATIONAL") assert.equal(item.native_task, "situational referring");
  }
  assert.equal(item.terminal_state, "scored", `${specification.id} sample terminal state`);
  assert.equal(item.parse_ok, true, `${specification.id} sample parse state`);
  finite(item.metric.score, `${specification.id} sample score`);
}

async function buildSamples(entry, sources) {
  const memberships = indexUnique(sources.publicManifest.document, "evaluation_id", "public membership");
  const itemScores = indexUnique(sources.itemScores.document, "evaluation_id", "item score");
  const predictions = predictionByEvaluationId(sources.predictions.document);
  const dataRoot = path.resolve(sources.config.document.input.data_root);
  const mediaFiles = new Map();
  const samples = {};

  for (const specification of METRICS) {
    const evaluationId = specification.sampleEvaluationId;
    const membership = memberships.get(evaluationId);
    const item = itemScores.get(evaluationId);
    const prediction = predictions.get(evaluationId);
    assert.ok(membership, `${specification.id} sample public membership`);
    assert.ok(item, `${specification.id} sample item score`);
    assert.ok(prediction, `${specification.id} sample prediction`);
    assertSampleMembership(specification, item);
    assert.equal(typeof membership.question, "string", `${specification.id} question`);
    assert.ok(membership.question.trim().length > 0, `${specification.id} non-empty question`);
    assert.equal(typeof prediction.raw_response, "string", `${specification.id} raw response`);

    const owner = memberships.get(prediction.canonical_owner_evaluation_id);
    assert.ok(owner, `${specification.id} canonical owner membership`);
    assert.equal(owner.question, membership.question, `${specification.id} canonical question agreement`);
    assert.deepEqual(owner.prompt_family, membership.prompt_family, `${specification.id} prompt family agreement`);
    const mediaIndexes = selectedMediaIndexes(prediction.media_paths.length, membership.question, item.parsed_output);
    const media = [];
    for (const index of mediaIndexes) {
      const relativeMediaPath = prediction.media_paths[index];
      const expectedMediaSha256 = prediction.media_sha256[relativeMediaPath];
      assert.match(expectedMediaSha256, SHA256, `${specification.id} media SHA-256`);
      const sourceFile = path.resolve(dataRoot, owner.dataset_relpath, relativeMediaPath);
      assert.ok(sourceFile.startsWith(`${dataRoot}${path.sep}`), `${specification.id} media path traversal`);
      const bytes = await readFile(sourceFile);
      assert.equal(sha256(bytes), expectedMediaSha256, `${specification.id} media content`);
      const extension = path.extname(relativeMediaPath).toLowerCase();
      assert.ok([".jpg", ".jpeg", ".png", ".webp"].includes(extension), `${specification.id} media extension`);
      const outputName = `${expectedMediaSha256}${extension}`;
      const publishedUrl = `${vlmPublishConfig.sampleMediaUrlPrefix}/${outputName}`;
      const existing = mediaFiles.get(outputName);
      if (existing) assert.equal(existing.sourceFile, sourceFile, `${specification.id} duplicate media source`);
      else mediaFiles.set(outputName, { outputName, sourceFile, sha256: expectedMediaSha256, bytes: bytes.length });
      media.push({
        url: publishedUrl,
        sha256: expectedMediaSha256,
        label: prediction.media_paths.length === 1 ? "Input image" : `Frame ${index} · ${path.basename(relativeMediaPath)}`,
        inputIndex: index,
      });
    }

    const sampleContribution = item.metric.correct === null ? item.metric.score : Number(item.metric.correct);
    samples[specification.id] = {
      metricId: specification.id,
      evaluationId,
      canonicalSampleId: item.canonical_sample_id,
      sourceBenchmark: item.source_benchmark,
      split: item.split,
      nativeTask: item.native_task,
      question: membership.question.replaceAll("_", " ").trim(),
      rawResponse: prediction.raw_response,
      parsedResponse: item.parsed_output,
      terminalState: item.terminal_state,
      metricName: item.metric.metric_name,
      score: sampleContribution,
      scoreDisplay: formatPercent(sampleContribution),
      nativeScore: item.metric.score,
      nativeScoreDisplay: formatPercent(item.metric.score),
      correct: item.metric.correct,
      promptVersion: item.prompt_version,
      inputCount: prediction.media_paths.length,
      displayedInputCount: media.length,
      media,
      note: "说明性真实样例；用于解释输入、输出与单题评分流程，不代表该指标的总体分布。",
    };
  }
  return { samples, mediaFiles: [...mediaFiles.values()].sort((left, right) => left.outputName.localeCompare(right.outputName)) };
}

function finite(value, label) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function metricKey(metric) {
  return [metric.source_benchmark, metric.split, metric.scope, metric.metric_name].join("|");
}

function specKey(specification) {
  return [specification.source, specification.split, specification.scope, specification.name].join("|");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function assertNoServerPaths(value, location = "bundle") {
  if (typeof value === "string") {
    assert.equal(value.startsWith("/mnt/"), false, `${location} exposes a server path`);
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

function validateSources(entry, sources) {
  const { runManifest, config, runtimeStatus, gate, summary, publicManifest, predictions, itemScores } = sources;
  assert.equal(runManifest.document.schema_version, "benchmark2027-vlm-run-manifest-v0.2");
  assert.equal(runManifest.document.run_id, entry.runId);
  assert.equal(runManifest.document.model_id, entry.modelId);
  assert.equal(runManifest.document.status, "PREPARED_AIHC32");
  assert.equal(runManifest.document.metric_lane, "deterministic");
  assert.equal(runManifest.document.prompt_version, "qwen3-vl-native-l1-v0.2.1");
  assert.equal(runManifest.document.full_run_enabled, false);
  assert.equal(runManifest.document.judge_live_enabled, false);
  assert.match(runManifest.document.source_commit, GIT_SHA1);

  assert.equal(config.document.schema_version, "benchmark2027-vlm-native-v0.2");
  assert.equal(config.document.run_id, entry.runId);
  assert.equal(config.document.model_id, entry.modelId);
  assert.equal(config.document.planned_memberships, EXPECTED_COUNTS.memberships);
  assert.equal(config.document.planned_canonical_predictions, EXPECTED_COUNTS.canonicalPredictions);
  assert.equal(config.document.evaluation.metric_lane, "deterministic");
  assert.equal(config.document.evaluation.judge_mode, "disabled");
  assert.equal(config.document.evaluation.composite_score, false);
  assert.equal(config.document.evaluation.correlation_analysis, false);
  assert.equal(config.document.manifest.expected_public_sha256, publicManifest.sha256);
  assert.equal(publicManifest.document.length, EXPECTED_COUNTS.memberships);
  assert.equal(predictions.document.length, EXPECTED_COUNTS.canonicalPredictions);
  assert.equal(itemScores.document.length, EXPECTED_COUNTS.memberships);

  assert.equal(runtimeStatus.document.schema_version, "benchmark2027-vlm-runtime-status-v0.2");
  assert.equal(runtimeStatus.document.run_id, entry.runId);
  assert.equal(runtimeStatus.document.status, "PASS_DETERMINISTIC");
  assert.equal(runtimeStatus.document.collection.memberships, EXPECTED_COUNTS.memberships);
  assert.equal(runtimeStatus.document.collection.canonical_predictions, EXPECTED_COUNTS.canonicalPredictions);
  assert.deepEqual(runtimeStatus.document.collection.terminal_counts, { ok: EXPECTED_COUNTS.canonicalPredictions });
  assert.equal(runtimeStatus.document.scoring.deterministic_metric_groups, METRICS.length);
  assert.equal(runtimeStatus.document.scoring.deterministic_scored_n, EXPECTED_COUNTS.deterministicScored);
  assert.equal(runtimeStatus.document.scoring.judge_pending_n, EXPECTED_COUNTS.judgePending);
  assert.equal(runtimeStatus.document.scoring.parse_failure_n, EXPECTED_COUNTS.parseFailures);
  assert.equal(runtimeStatus.document.scoring.infrastructure_failure_n, EXPECTED_COUNTS.infrastructureFailures);
  assert.equal(runtimeStatus.document.scoring.score_rerun_byte_identical, true);
  assert.equal(runtimeStatus.document.artifacts.summary_json, undefined);
  assert.equal(runtimeStatus.document.artifacts["summary.json"].sha256, summary.sha256);
  assert.equal(runtimeStatus.document.artifacts["gate_d_audit.json"].sha256, gate.sha256);
  assert.equal(runtimeStatus.document.artifacts["predictions.jsonl"].sha256, entry.expectedSha256.predictions);
  assert.equal(runtimeStatus.document.artifacts["item_scores.jsonl"].sha256, entry.expectedSha256.itemScores);

  assert.equal(gate.document.status, "PASS");
  assert.deepEqual(gate.document.errors, []);
  assert.equal(gate.document.memberships, EXPECTED_COUNTS.memberships);
  assert.equal(gate.document.canonical_predictions, EXPECTED_COUNTS.canonicalPredictions);
  assert.equal(gate.document.deterministic_metric_groups, METRICS.length);
  assert.equal(gate.document.judge_pending_n, EXPECTED_COUNTS.judgePending);
  assert.deepEqual(gate.document.terminal_counts, {
    judge_pending: EXPECTED_COUNTS.judgePending,
    parse_error: EXPECTED_COUNTS.parseFailures,
    scored: EXPECTED_COUNTS.deterministicScored,
  });
  assert.equal(gate.document.item_scores_sha256, entry.expectedSha256.itemScores);

  assert.equal(summary.document.schema_version, "benchmark2027-vlm-report-v0.2");
  assert.equal(summary.document.status, "PASS_DETERMINISTIC");
  assert.equal(summary.document.planned_n, EXPECTED_COUNTS.memberships);
  assert.equal(summary.document.terminal_n, EXPECTED_COUNTS.memberships);
  assert.equal(summary.document.deterministic_scored_n, EXPECTED_COUNTS.deterministicScored);
  assert.equal(summary.document.judge_pending_n, EXPECTED_COUNTS.judgePending);
  assert.equal(summary.document.parse_failure_n, EXPECTED_COUNTS.parseFailures);
  assert.equal(summary.document.model_failure_n, EXPECTED_COUNTS.parseFailures);
  assert.equal(summary.document.infrastructure_failure_n, EXPECTED_COUNTS.infrastructureFailures);
  assert.equal(summary.document.composite_score, null);

  const deterministic = summary.document.metrics.filter((metric) => metric.evaluator_type === "deterministic");
  const judge = summary.document.metrics.filter((metric) => metric.evaluator_type === "judge");
  assert.equal(deterministic.length, METRICS.length);
  assert.equal(new Set(deterministic.map(metricKey)).size, METRICS.length);
  assert.deepEqual(new Set(deterministic.map(metricKey)), new Set(METRICS.map(specKey)));
  assert.equal(judge.reduce((total, metric) => total + metric.judge_pending_n, 0), EXPECTED_COUNTS.judgePending);
  for (const metric of judge) {
    assert.equal(metric.publishable, false);
    assert.equal(metric.score, null);
    assert.equal(metric.effective_n, 0);
    assert.equal(metric.infrastructure_failure_n, 0);
  }
  for (const metric of deterministic) {
    assert.equal(metric.publishable, true);
    assert.equal(metric.infrastructure_failure_n, 0);
    assert.ok(metric.parse_rate > 0, `${metricKey(metric)} parse rate`);
    const score = finite(metric.score, `${metricKey(metric)} score`);
    assert.ok(score >= 0 && score <= 1, `${metricKey(metric)} score range`);
  }
}

function publishMetric(metric, specification) {
  assert.equal(metric.planned_n, specification.plannedN, `${specification.id} planned N`);
  return {
    availability: "available",
    granularity: "membership_aggregate",
    direction: "higher",
    unit: specification.unit,
    primary: formatPercent(metric.score),
    aux: `N=${metric.effective_n}/${metric.planned_n} · parse ${formatPercent(metric.parse_rate)}`,
    status: "OK",
    sourceBenchmark: metric.source_benchmark,
    split: metric.split,
    scope: metric.scope,
    metricName: metric.metric_name,
    metricKind: metric.metric_kind,
    metricRole: metric.metric_role,
    plannedN: metric.planned_n,
    effectiveN: metric.effective_n,
    rawN: metric.raw_n,
    parseRate: metric.parse_rate,
    score: metric.score,
    mean: metric.mean,
    median: metric.median,
    std: metric.std,
    q25: metric.q25,
    q75: metric.q75,
    parseFailureN: metric.parse_failure_n,
    modelFailureN: metric.model_failure_n,
    infrastructureFailureN: metric.infrastructure_failure_n,
  };
}

async function buildModel(entry, sources) {
  const deterministicByKey = new Map(
    sources.summary.document.metrics
      .filter((metric) => metric.evaluator_type === "deterministic")
      .map((metric) => [metricKey(metric), metric]),
  );
  const values = Object.fromEntries(
    METRICS.map((specification) => [
      specification.id,
      publishMetric(deterministicByKey.get(specKey(specification)), specification),
    ]),
  );
  const { samples, mediaFiles } = await buildSamples(entry, sources);
  return {
    mediaFiles,
    model: {
    modelId: entry.modelId,
    displayName: entry.displayName,
    resultVersion: entry.resultVersion,
    runId: entry.runId,
    status: "PASS_DETERMINISTIC",
    completed: `${METRICS.length} / ${METRICS.length}`,
    promptVersion: sources.runManifest.document.prompt_version,
    sourceCommit: sources.runManifest.document.source_commit,
    metricLane: "deterministic",
    cohort: {
      memberships: EXPECTED_COUNTS.memberships,
      canonicalPredictions: EXPECTED_COUNTS.canonicalPredictions,
      deterministicScored: EXPECTED_COUNTS.deterministicScored,
      judgePending: EXPECTED_COUNTS.judgePending,
      parseFailures: EXPECTED_COUNTS.parseFailures,
      infrastructureFailures: EXPECTED_COUNTS.infrastructureFailures,
    },
    judge: {
      availability: "judge_pending",
      memberships: EXPECTED_COUNTS.judgePending,
      status: "JUDGE_PENDING",
      note: "Object 100 + non-numeric Spatial 77；预测已冻结，未接入强教师模型，不计 0。",
    },
    values,
    samples,
    provenance: {
      runManifestSha256: sources.runManifest.sha256,
      configSha256: sources.config.sha256,
      runtimeStatusSha256: sources.runtimeStatus.sha256,
      gateSha256: sources.gate.sha256,
      summarySha256: sources.summary.sha256,
      publicManifestSha256: sources.publicManifest.sha256,
      predictionsSha256: entry.expectedSha256.predictions,
      itemScoresSha256: entry.expectedSha256.itemScores,
      scoreRerunByteIdentical: true,
    },
    },
  };
}

export function validatePublishedBundle(bundle) {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.vlm-l1.v2");
  assert.deepEqual(Object.keys(bundle.models), ["Qwen3-VL-8B-Instruct"]);
  const model = bundle.models["Qwen3-VL-8B-Instruct"];
  assert.equal(model.status, "PASS_DETERMINISTIC");
  assert.equal(model.completed, "12 / 12");
  assert.deepEqual(model.cohort, EXPECTED_COUNTS);
  assert.equal(model.judge.availability, "judge_pending");
  assert.equal(model.judge.memberships, EXPECTED_COUNTS.judgePending);
  assert.equal(model.provenance.scoreRerunByteIdentical, true);
  for (const hash of Object.entries(model.provenance).filter(([key]) => key.endsWith("Sha256"))) {
    assert.match(hash[1], SHA256, hash[0]);
  }
  assert.deepEqual(Object.keys(model.values), METRICS.map((metric) => metric.id));
  assert.deepEqual(Object.keys(model.samples), METRICS.map((metric) => metric.id));
  for (const specification of METRICS) {
    const metric = model.values[specification.id];
    assert.equal(metric.availability, "available");
    assert.equal(metric.status, "OK");
    assert.equal(metric.plannedN, specification.plannedN);
    assert.ok(metric.parseRate > 0);
    assert.ok(metric.score >= 0 && metric.score <= 1);
    assert.equal(metric.infrastructureFailureN, 0);
    const sample = model.samples[specification.id];
    assert.equal(sample.metricId, specification.id);
    assert.equal(sample.evaluationId, specification.sampleEvaluationId);
    assert.equal(sample.terminalState, "scored");
    assert.ok(sample.question.length > 0);
    assert.ok(sample.rawResponse.length > 0);
    assert.ok(sample.score >= 0 && sample.score <= 1);
    assert.ok(sample.nativeScore >= 0 && sample.nativeScore <= 1);
    assert.ok(sample.inputCount >= sample.displayedInputCount);
    assert.ok(sample.displayedInputCount > 0 && sample.displayedInputCount <= 7);
    assert.equal(sample.media.length, sample.displayedInputCount);
    for (const media of sample.media) {
      assert.match(media.sha256, SHA256);
      assert.ok(media.url.startsWith(`${vlmPublishConfig.sampleMediaUrlPrefix}/`));
      assert.equal(media.url.includes(".."), false);
    }
  }
  assertNoServerPaths(bundle);
  return bundle;
}

async function buildPublication() {
  assert.equal(vlmResultRegistry.length, 1, "only the frozen first Pilot is allowlisted");
  const models = {};
  const mediaFiles = new Map();
  for (const entry of vlmResultRegistry) {
    const sources = {
      runManifest: await loadJson(entry.runManifestFile, entry.expectedSha256.runManifest, "run manifest"),
      config: await loadJson(entry.configFile, entry.expectedSha256.config, "config"),
      runtimeStatus: await loadJson(entry.runtimeStatusFile, entry.expectedSha256.runtimeStatus, "runtime status"),
      gate: await loadJson(entry.gateFile, entry.expectedSha256.gate, "Gate D"),
      summary: await loadJson(entry.summaryFile, entry.expectedSha256.summary, "summary"),
      publicManifest: await loadJsonl(entry.publicManifestFile, entry.expectedSha256.publicManifest, "public manifest"),
      predictions: await loadJsonl(entry.predictionsFile, entry.expectedSha256.predictions, "predictions"),
      itemScores: await loadJsonl(entry.itemScoresFile, entry.expectedSha256.itemScores, "item scores"),
    };
    validateSources(entry, sources);
    const built = await buildModel(entry, sources);
    models[entry.displayName] = built.model;
    for (const media of built.mediaFiles) {
      const existing = mediaFiles.get(media.outputName);
      if (existing) assert.deepEqual(existing, media, `conflicting sample media ${media.outputName}`);
      else mediaFiles.set(media.outputName, media);
    }
  }
  const bundle = validatePublishedBundle({
    schemaVersion: "unibench.dashboard.vlm-l1.v2",
    bundleVersion: vlmPublishConfig.bundleVersion,
    generatedBy: "scripts/export-vlm-results.mjs",
    protocol: "Native L1 Pilot · deterministic lane · no composite score",
    models,
  });
  return { bundle, mediaFiles: [...mediaFiles.values()].sort((left, right) => left.outputName.localeCompare(right.outputName)) };
}

export async function buildPublishedBundle() {
  return (await buildPublication()).bundle;
}

async function verifyPublishedMedia(mediaFiles) {
  const bundleRoot = path.resolve(vlmPublishConfig.sampleMediaBundleDir);
  const mediaRoot = path.join(bundleRoot, "media");
  const manifestFile = path.join(bundleRoot, "manifest.json");
  const expectedManifest = {
    schema_version: 1,
    bundle_id: path.basename(bundleRoot),
    source_run_id: vlmResultRegistry[0].runId,
    file_count: mediaFiles.length,
    total_bytes: mediaFiles.reduce((total, media) => total + media.bytes, 0),
    files: mediaFiles.map((media) => ({ path: media.outputName, bytes: media.bytes, sha256: media.sha256 })),
  };
  const observedManifest = JSON.parse(await readFile(manifestFile, "utf8"));
  assert.deepEqual(observedManifest, expectedManifest, "VLM sample media manifest");
  assert.deepEqual((await readdir(mediaRoot)).sort(), mediaFiles.map((media) => media.outputName), "VLM sample media file set");
  for (const media of mediaFiles) {
    const outputFile = path.join(mediaRoot, media.outputName);
    const bytes = await readFile(outputFile);
    assert.equal(bytes.length, media.bytes, `${media.outputName} byte count`);
    assert.equal(sha256(bytes), media.sha256, `${media.outputName} published SHA-256`);
  }
  return { bundleRoot, mediaRoot, manifestFile, expectedManifest };
}

async function publishMedia(mediaFiles) {
  const bundleRoot = path.resolve(vlmPublishConfig.sampleMediaBundleDir);
  const mediaRoot = path.join(bundleRoot, "media");
  const manifestFile = path.join(bundleRoot, "manifest.json");
  await mkdir(mediaRoot, { recursive: true });
  for (const media of mediaFiles) {
    const outputFile = path.join(mediaRoot, media.outputName);
    try {
      const existing = await readFile(outputFile);
      assert.equal(sha256(existing), media.sha256, `${media.outputName} immutable media collision`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await copyFile(media.sourceFile, outputFile);
    }
    const info = await stat(outputFile);
    assert.equal(info.isFile(), true, `${media.outputName} output type`);
  }
  const expectedManifest = {
    schema_version: 1,
    bundle_id: path.basename(bundleRoot),
    source_run_id: vlmResultRegistry[0].runId,
    file_count: mediaFiles.length,
    total_bytes: mediaFiles.reduce((total, media) => total + media.bytes, 0),
    files: mediaFiles.map((media) => ({ path: media.outputName, bytes: media.bytes, sha256: media.sha256 })),
  };
  const serializedManifest = `${JSON.stringify(expectedManifest, null, 2)}\n`;
  try {
    const existing = await readFile(manifestFile, "utf8");
    assert.equal(existing, serializedManifest, "refusing to overwrite a different VLM sample media manifest");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(manifestFile, serializedManifest, { flag: "wx" });
  }
  await verifyPublishedMedia(mediaFiles);
  return bundleRoot;
}

async function main() {
  const publication = await buildPublication();
  const serialized = `${JSON.stringify(publication.bundle, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(vlmPublishConfig.outputFile, "utf8");
    assert.equal(current, serialized, "published VLM bundle is stale; run npm run export:vlm");
    await verifyPublishedMedia(publication.mediaFiles);
    console.log("Published VLM L1 bundle and sample media match the allowlisted formal Pilot.");
    return;
  }
  const mediaBundle = await publishMedia(publication.mediaFiles);
  await mkdir(path.dirname(vlmPublishConfig.outputFile), { recursive: true });
  await writeFile(vlmPublishConfig.outputFile, serialized);
  console.log(`Published VLM L1 bundle: ${vlmPublishConfig.outputFile}`);
  console.log(`Published VLM L1 sample media: ${mediaBundle}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
