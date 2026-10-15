import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vlaWamPublishConfig, vlaWamResultRegistry } from "./vla-wam-result-registry.mjs";

const EXPECTED_SCHEMA = 4;
const EXPECTED_PROTOCOL = "vla-phase1-independent-seed-cohort-v4";
const EXPECTED_PIPELINE_VERSION = "1.3.0";
const EXPECTED_PIPELINE_COMMIT = "dd7f4ff58f03adba4bc58065c4910543fdeb89ca";
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_SCALARS = [
  "sample_count",
  "task_success_rate",
  "sr_beta_interval_95",
  "successful_episode_time",
  "iterations_per_second",
  "wall_time",
];
const TRAJECTORY_FIELDS = [
  "ee_sparc",
  "ee_path_length_m",
  "ee_speed_mean_m_s",
  "joint_path_length_rad",
  "orientation_path_length_rad",
];
const EVENT_FIELDS = [
  "task_adherence_event_count",
  "object_slip_count",
  "environment_collision_count",
  "self_collision_count",
];
const AVAILABILITY_STATUSES = new Map([
  ["available", new Set(["pass", "computed"])],
  ["not_run", new Set(["not_run"])],
  ["input_missing", new Set(["input_missing"])],
  ["evaluator_failed", new Set(["evaluator_failed"])],
  ["partial", new Set(["partial"])],
  ["unsupported", new Set(["unsupported"])],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadJson(file) {
  const bytes = await readFile(file);
  return { document: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

function finite(value, label) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function validateSummary(source, entry) {
  const document = source.document;
  assert.equal(source.sha256, entry.expectedSummarySha256, `${entry.displayName} summary SHA256`);
  assert.equal(document.schema_version, EXPECTED_SCHEMA, `${entry.displayName} schema`);
  assert.equal(document.protocol, EXPECTED_PROTOCOL, `${entry.displayName} protocol`);
  assert.equal(document.pipeline_version, EXPECTED_PIPELINE_VERSION, `${entry.displayName} pipeline version`);
  assert.equal(document.episode_count, 100, `${entry.displayName} episode count`);
  assert.deepEqual(document.ingest_errors, [], `${entry.displayName} ingest errors`);
  assert.equal(document.groups.length, 1, `${entry.displayName} result group count`);

  const group = document.groups[0];
  assert.equal(group.benchmark, "robodojo");
  assert.equal(group.policy, entry.policy);
  assert.equal(group.task, entry.task);
  assert.equal(document.artifact_consistency.status, "pass");
  assert.equal(document.artifact_consistency.episode_records, 100);
  assert.equal(document.artifact_consistency.valid_episode_records, 100);
  assert.equal(document.artifact_consistency.trajectory_records, 100);
  assert.equal(document.artifact_consistency.valid_outcome_records, 100);
  assert.equal(document.artifact_consistency.ingest_error_count, 0);

  const cohort = document.sampling_protocol.cohorts[0];
  assert.equal(cohort.status, "complete");
  assert.equal(cohort.observed_episode_count, 100);
  assert.equal(cohort.target_episode_count, 100);
  assert.equal(cohort.unique_seed_count, 100);
  assert.equal(cohort.missing_seed_count, 0);
  assert.deepEqual(cohort.duplicate_seeds, []);
  assert.equal(
    document.input_identity["manifest.jsonl"].sha256,
    entry.expectedInputManifestSha256,
    `${entry.displayName} input manifest SHA256`,
  );
  assert.equal(document.sources.pipeline.commit, EXPECTED_PIPELINE_COMMIT);
  assert.equal(document.sources.pipeline.dirty, false);
  assert.equal(document.sources.pipeline.relevant_metric_files_clean, true);

  for (const id of REQUIRED_SCALARS) {
    const metric = group.metrics[id];
    assert.equal(metric.status, "computed", `${entry.displayName} ${id} status`);
    assert.equal(metric.n > 0, true, `${entry.displayName} ${id} n`);
  }
  finite(group.metrics.sample_count.value, `${entry.displayName} sample_count`);
  finite(group.metrics.task_success_rate.value, `${entry.displayName} TSR`);
  finite(group.metrics.successful_episode_time.value, `${entry.displayName} successful time`);
  finite(group.metrics.iterations_per_second.value, `${entry.displayName} IPS`);
  finite(group.metrics.wall_time.value, `${entry.displayName} wall time`);
  assert.equal(group.metrics.sr_beta_interval_95.value.length, 2);
  group.metrics.sr_beta_interval_95.value.forEach((value, index) =>
    finite(value, `${entry.displayName} SR95[${index}]`),
  );

  const distribution = group.metrics.robodojo_score_distribution;
  assert.equal(distribution.status, "computed");
  assert.equal(distribution.n, 100);
  assert.equal(
    Object.values(distribution.value).reduce((sum, bucket) => sum + bucket.count, 0),
    100,
    `${entry.displayName} score-distribution count`,
  );

  for (const side of ["left", "right"]) {
    for (const field of TRAJECTORY_FIELDS) {
      const metric = group.trajectory_by_ee_slice[side][field];
      assert.equal(metric.status, "computed", `${entry.displayName} ${side} ${field}`);
      assert.equal(metric.n, 100);
      finite(metric.value, `${entry.displayName} ${side} ${field} value`);
      finite(metric.sample_std, `${entry.displayName} ${side} ${field} std`);
    }
  }
  for (const field of ["joint_path_length_rad", "orientation_path_length_rad"]) {
    const metric = group.trajectory_totals[field];
    assert.equal(metric.status, "computed", `${entry.displayName} total ${field}`);
    assert.equal(metric.n, 100);
    finite(metric.value, `${entry.displayName} total ${field} value`);
    finite(metric.sample_std, `${entry.displayName} total ${field} std`);
  }

  for (const field of EVENT_FIELDS) {
    const metric = group.failure_events[field];
    assert.equal(metric.status, "computed", `${entry.displayName} ${field}`);
    assert.equal(metric.n, 100);
    assert.equal(metric.telemetry_coverage, 1);
    finite(metric.value, `${entry.displayName} ${field} value`);
    finite(metric.affected_episode_rate, `${entry.displayName} ${field} affected rate`);
  }
  assert.equal(group.task_memory_complexity.status, "computed");
  assert.equal(group.task_memory_complexity.value, "M(0)");
  assert.equal(document.robustness.status, "unavailable");
  assert.deepEqual(document.robustness.groups, []);
  return group;
}

function scalarResult(metric, primary, aux) {
  return {
    availability: "available",
    status: metric.status,
    direction: metric.direction,
    unit: metric.unit,
    value: metric.value,
    sampleStd: metric.sample_std ?? null,
    n: metric.n,
    primary,
    aux,
  };
}

function meanStd(metric, digits, unit = metric.unit) {
  return scalarResult(
    metric,
    `${metric.value.toFixed(digits)} ± ${metric.sample_std.toFixed(digits)}${unit ? ` ${unit}` : ""}`,
    `N=${metric.n} · episode-level mean / sample std`,
  );
}

function eventResult(metric) {
  const affected = Math.round(metric.affected_episode_rate * metric.n);
  return scalarResult(
    metric,
    String(metric.value),
    `${affected} affected episodes · telemetry coverage ${(metric.telemetry_coverage * 100).toFixed(0)}% · N=${metric.n}`,
  );
}

function buildModel(entry, source, group) {
  const metrics = group.metrics;
  const left = group.trajectory_by_ee_slice.left;
  const right = group.trajectory_by_ee_slice.right;
  const totals = group.trajectory_totals;
  const events = group.failure_events;
  const interval = metrics.sr_beta_interval_95.value;
  const distribution = metrics.robodojo_score_distribution.value;
  const success = distribution["1"]?.count ?? 0;
  const partial = distribution["0.15"]?.count ?? 0;
  const failure = distribution["0"]?.count ?? 0;

  const values = {
    AC: {
      availability: "available",
      status: "pass",
      direction: null,
      unit: "episode",
      value: 100,
      sampleStd: null,
      n: 100,
      primary: "PASS · 100/100",
      aux: "outcome、trajectory、metadata 全部可解析且可追溯",
    },
    N: scalarResult(metrics.sample_count, String(metrics.sample_count.value), "100 distinct seeds · no missing / duplicate"),
    TSR: scalarResult(
      metrics.task_success_rate,
      `${(metrics.task_success_rate.value * 100).toFixed(2)}%`,
      `${metrics.task_success_rate.numerator} success / ${metrics.task_success_rate.denominator} valid episodes`,
    ),
    SR95: scalarResult(
      metrics.sr_beta_interval_95,
      `[${(interval[0] * 100).toFixed(2)}%, ${(interval[1] * 100).toFixed(2)}%]`,
      `${metrics.sr_beta_interval_95.posterior} · 95% Beta interval`,
    ),
    SCORE_DIST: scalarResult(
      metrics.robodojo_score_distribution,
      `${success} success · ${partial} partial · ${failure} failure`,
      "RoboDojo native score: 1 / 0.15 / 0 · N=100",
    ),
    SET: meanStd(metrics.successful_episode_time, 3, "s"),
    IPS: meanStd(metrics.iterations_per_second, 3, "steps/s"),
    WT: meanStd(metrics.wall_time, 3, "s"),
    LSPARC: meanStd(left.ee_sparc, 4, ""),
    LPATH: meanStd(left.ee_path_length_m, 4, "m"),
    LSPEED: meanStd(left.ee_speed_mean_m_s, 5, "m/s"),
    LJPL: meanStd(left.joint_path_length_rad, 4, "rad"),
    LOPL: meanStd(left.orientation_path_length_rad, 4, "rad"),
    RSPARC: meanStd(right.ee_sparc, 4, ""),
    RPATH: meanStd(right.ee_path_length_m, 4, "m"),
    RSPEED: meanStd(right.ee_speed_mean_m_s, 5, "m/s"),
    RJPL: meanStd(right.joint_path_length_rad, 4, "rad"),
    ROPL: meanStd(right.orientation_path_length_rad, 4, "rad"),
    TJPL: meanStd(totals.joint_path_length_rad, 4, "rad"),
    TOPL: meanStd(totals.orientation_path_length_rad, 4, "rad"),
    TAE: eventResult(events.task_adherence_event_count),
    SLIP: eventResult(events.object_slip_count),
    ENV_COLL: eventResult(events.environment_collision_count),
    SELF_COLL: eventResult(events.self_collision_count),
    TMC: {
      availability: "available",
      status: "computed",
      direction: null,
      unit: "task category",
      value: group.task_memory_complexity.value,
      sampleStd: null,
      n: 1,
      primary: group.task_memory_complexity.value,
      aux: "task-level annotation · benchmark2027 registry · not a model score",
    },
    ROBUSTNESS: {
      availability: "input_missing",
      status: "input_missing",
      direction: null,
      unit: "controlled conditions",
      value: null,
      sampleStd: null,
      n: 0,
      primary: "N/A",
      aux: source.document.robustness.reason,
    },
  };

  return {
    modelId: entry.modelId,
    displayName: entry.displayName,
    family: entry.family,
    policy: entry.policy,
    task: entry.task,
    resultVersion: entry.resultVersion,
    protocol: source.document.protocol,
    pipelineVersion: source.document.pipeline_version,
    createdAtUtc: source.document.created_at_utc,
    cohort: {
      episodes: 100,
      uniqueSeeds: 100,
      success,
      partial,
      failure,
    },
    values,
    provenance: {
      summarySha256: source.sha256,
      inputManifestSha256: entry.expectedInputManifestSha256,
      pipelineCommit: source.document.sources.pipeline.commit,
      eventSpecVersion: events.task_adherence_event_count.event_spec_version,
      tmcAnnotationVersion: group.task_memory_complexity.annotation_version,
    },
  };
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

export function validatePublishedBundle(bundle) {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.vla-wam.v1");
  assert.deepEqual(Object.keys(bundle.models).sort(), ["FastWAM", "Pi0.5"]);
  for (const [modelName, model] of Object.entries(bundle.models)) {
    assert.equal(model.cohort.episodes, 100, `${modelName} episodes`);
    assert.equal(model.cohort.uniqueSeeds, 100, `${modelName} unique seeds`);
    assert.equal(model.cohort.success + model.cohort.partial + model.cohort.failure, 100);
    assert.match(model.provenance.summarySha256, SHA256);
    assert.match(model.provenance.inputManifestSha256, SHA256);
    assert.equal(model.values.AC.status, "pass");
    assert.equal(model.values.N.value, 100);
    assert.equal(model.values.TAE.n, 100);
    assert.equal(model.values.SLIP.availability, "available");
    assert.equal(model.values.ROBUSTNESS.value, null);
    assert.equal(model.values.ROBUSTNESS.primary, "N/A");
    for (const [metricId, metric] of Object.entries(model.values)) {
      const legalStatuses = AVAILABILITY_STATUSES.get(metric.availability);
      assert.ok(legalStatuses, `${modelName} ${metricId} availability`);
      assert.equal(
        legalStatuses.has(metric.status),
        true,
        `${modelName} ${metricId} status must match availability`,
      );
      if (metric.availability !== "available" && metric.availability !== "partial") {
        assert.equal(metric.value, null, `${modelName} ${metricId} unavailable value`);
        assert.equal(metric.n, 0, `${modelName} ${metricId} unavailable n`);
      }
    }
  }
  assert.equal(bundle.models["Pi0.5"].values.TSR.value, 0.76);
  assert.equal(bundle.models.FastWAM.values.TSR.value, 0.12);
  assert.equal(bundle.models["Pi0.5"].values.TAE.value, 3);
  assert.equal(bundle.models.FastWAM.values.TAE.value, 0);
  assertNoServerPaths(bundle);
  return bundle;
}

export async function buildPublishedBundle() {
  const models = {};
  for (const entry of vlaWamResultRegistry) {
    const source = await loadJson(entry.summaryFile);
    const group = validateSummary(source, entry);
    models[entry.displayName] = buildModel(entry, source, group);
  }
  return validatePublishedBundle({
    schemaVersion: "unibench.dashboard.vla-wam.v1",
    bundleVersion: vlaWamPublishConfig.bundleVersion,
    generatedBy: "scripts/export-vla-wam-results.mjs",
    protocol: EXPECTED_PROTOCOL,
    pipelineVersion: EXPECTED_PIPELINE_VERSION,
    sourceRevision: EXPECTED_PIPELINE_COMMIT,
    models,
  });
}

async function main() {
  const serialized = `${JSON.stringify(await buildPublishedBundle(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(vlaWamPublishConfig.outputFile, "utf8");
    assert.equal(current, serialized, "published VLA/WAM bundle is stale; run npm run export:vla-wam");
    console.log("Published VLA/WAM bundle matches the allowlisted formal results.");
    return;
  }
  await mkdir(path.dirname(vlaWamPublishConfig.outputFile), { recursive: true });
  await writeFile(vlaWamPublishConfig.outputFile, serialized);
  console.log(`Published VLA/WAM bundle: ${vlaWamPublishConfig.outputFile}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
