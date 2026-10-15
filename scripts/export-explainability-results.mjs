import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  explainabilityPublishConfig,
  explainabilityResultRegistry,
} from "./explainability-result-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const SYSTEM_METRICS = new Set(["iterations_per_second", "wall_time_s"]);

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

function windowFor(metric) {
  if (metric.startsWith("pre_outcome.")) return "preOutcome";
  if (metric.startsWith("event_count.")) return "events";
  if (SYSTEM_METRICS.has(metric)) return "diagnostics";
  return "fullEpisode";
}

function eventKey(metric) {
  return metric.replace(/^event_count\./, "");
}

function publicRow(row) {
  const computed = row.status === "computed";
  if (computed) {
    finite(row.point_biserial_r, `${row.metric} r`);
    finite(row.p_value, `${row.metric} p`);
    finite(row.q_value_bh, `${row.metric} q`);
    assert.equal(row.ci_95.length, 2, `${row.metric} CI`);
    row.ci_95.forEach((value, index) => finite(value, `${row.metric} CI[${index}]`));
    finite(row.success_mean, `${row.metric} success mean`);
    finite(row.non_success_mean, `${row.metric} non-success mean`);
    assert.equal(row.n, 100, `${row.metric} N`);
  } else {
    assert.equal(row.point_biserial_r, null, `${row.metric} unavailable r`);
    assert.equal(row.q_value_bh, null, `${row.metric} unavailable q`);
  }

  return {
    metricId: row.metric,
    label: row.label,
    status: row.status,
    window: windowFor(row.metric),
    direction: row.direction,
    r: row.point_biserial_r,
    ci95: row.ci_95,
    pValue: row.p_value,
    qValue: row.q_value_bh,
    significant: computed && row.q_value_bh < 0.05,
    successMean: row.success_mean,
    nonSuccessMean: row.non_success_mean,
    successN: row.success_n,
    nonSuccessN: row.non_success_n,
    n: row.n,
    missing: row.missing,
    reason: row.reason,
  };
}

function validateSource(source, entry) {
  const document = source.document;
  assert.equal(source.sha256, entry.expectedSourceSha256, `${entry.displayName} source SHA256`);
  assert.equal(document.schema_version, entry.expectedSchemaVersion, `${entry.displayName} schema`);
  assert.equal(document.results.length, entry.expectedResultCount, `${entry.displayName} result count`);
  assert.equal(document.cohort.episode_count, 100, `${entry.displayName} episode count`);
  assert.equal(document.cohort.success_count, entry.expectedSuccessCount, `${entry.displayName} success count`);
  assert.equal(
    document.cohort.non_success_count,
    entry.expectedNonSuccessCount,
    `${entry.displayName} non-success count`,
  );
  assert.equal(
    document.cohort.success_rate,
    entry.expectedSuccessCount / 100,
    `${entry.displayName} success rate`,
  );
  assert.equal(document.input.sha256, entry.expectedInputSha256, `${entry.displayName} episodes SHA256`);
  assert.equal(document.method.bootstrap_samples, 20_000, `${entry.displayName} bootstrap samples`);
  assert.equal(document.method.random_seed, 20_260_819, `${entry.displayName} bootstrap seed`);
  assert.match(document.method.correlation, /point-biserial/i);
  assert.match(document.method.multiple_testing, /Benjamini-Hochberg/i);
  assert.equal(document.method.target, "binary success; half-success is non-success");
  assert.equal(document.event_associations.length, 4, `${entry.displayName} event associations`);
  for (const association of document.event_associations) {
    assert.equal(association.n, 100);
    assert.equal(association.telemetry_coverage, 1);
  }

  const rows = document.results.map(publicRow);
  assert.equal(rows.filter((row) => row.window === "fullEpisode").length, 12);
  assert.equal(rows.filter((row) => row.window === "preOutcome").length, 12);
  assert.equal(rows.filter((row) => row.window === "diagnostics").length, 2);
  assert.equal(rows.filter((row) => row.window === "events").length, 4);
  assert.equal(rows.filter((row) => row.window === "preOutcome" && row.status === "computed").length, 12);
  return rows;
}

function buildModel(entry, source, rows) {
  const document = source.document;
  const eventLookup = new Map(document.event_associations.map((row) => [row.metric, row]));
  const events = rows
    .filter((row) => row.window === "events")
    .map((row) => ({ ...row, association: eventLookup.get(eventKey(row.metricId)) ?? null }));
  const classificationCounts = document.cohort.classification_counts;

  return {
    modelId: entry.modelId,
    displayName: entry.displayName,
    family: entry.family,
    task: entry.task,
    resultVersion: entry.resultVersion,
    cohort: {
      episodes: document.cohort.episode_count,
      uniqueSeeds: 100,
      success: document.cohort.success_count,
      partial: classificationCounts["half-success"],
      failure: classificationCounts.failure,
      nonSuccess: document.cohort.non_success_count,
      successRate: document.cohort.success_rate,
    },
    method: {
      correlation: "Point-biserial r",
      target: "success=1；half-success / failure=0",
      bootstrapSamples: document.method.bootstrap_samples,
      confidenceInterval: document.method.confidence_interval,
      multipleTesting: document.method.multiple_testing,
      randomSeed: document.method.random_seed,
      preOutcomeSteps: entry.preOutcomeSteps,
    },
    series: {
      fullEpisode: rows.filter((row) => row.window === "fullEpisode"),
      preOutcome: rows.filter((row) => row.window === "preOutcome"),
      diagnostics: rows.filter((row) => row.window === "diagnostics"),
      events,
    },
    provenance: {
      correlationSha256: source.sha256,
      episodesSha256: entry.expectedInputSha256,
      inputManifestSha256: entry.expectedManifestSha256,
      sourceSchemaVersion: document.schema_version,
      createdAtUtc: document.created_at_utc,
      pipelineCommit: "dd7f4ff58f03adba4bc58065c4910543fdeb89ca",
      correlationScriptSha256: "3b5108d2a9da4340c3c7af3c61408048b7685deafc1a3116973015dcb74853ed",
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
  assert.equal(bundle.schemaVersion, "unibench.dashboard.explainability.v1");
  assert.equal(bundle.relationship, "metric-success-association");
  assert.deepEqual(Object.keys(bundle.models).sort(), ["FastWAM", "Pi0.5"]);
  assert.equal(bundle.models["Pi0.5"].cohort.success, 76);
  assert.equal(bundle.models.FastWAM.cohort.success, 12);
  assert.equal(bundle.models["Pi0.5"].series.fullEpisode.filter((row) => row.significant).length, 8);
  assert.equal(bundle.models["Pi0.5"].series.preOutcome.filter((row) => row.significant).length, 2);
  assert.equal(bundle.models.FastWAM.series.fullEpisode.filter((row) => row.significant).length, 4);
  assert.equal(bundle.models.FastWAM.series.preOutcome.filter((row) => row.significant).length, 1);
  assert.equal(bundle.models["Pi0.5"].series.events.filter((row) => row.significant).length, 1);
  for (const model of Object.values(bundle.models)) {
    assert.equal(model.cohort.episodes, 100);
    assert.equal(model.cohort.uniqueSeeds, 100);
    assert.equal(model.cohort.success + model.cohort.partial + model.cohort.failure, 100);
    assert.equal(model.method.preOutcomeSteps, 250);
    assert.match(model.provenance.correlationSha256, SHA256);
    assert.match(model.provenance.episodesSha256, SHA256);
    assert.match(model.provenance.inputManifestSha256, SHA256);
    assert.equal(model.series.preOutcome.every((row) => row.status === "computed"), true);
  }
  assertNoServerPaths(bundle);
  return bundle;
}

export async function buildPublishedBundle() {
  const models = {};
  for (const entry of explainabilityResultRegistry) {
    const source = await loadJson(entry.sourceFile);
    const rows = validateSource(source, entry);
    models[entry.displayName] = buildModel(entry, source, rows);
  }
  return validatePublishedBundle({
    schemaVersion: "unibench.dashboard.explainability.v1",
    bundleVersion: explainabilityPublishConfig.bundleVersion,
    generatedBy: "scripts/export-explainability-results.mjs",
    relationship: "metric-success-association",
    models,
  });
}

async function main() {
  const serialized = `${JSON.stringify(await buildPublishedBundle(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(explainabilityPublishConfig.outputFile, "utf8");
    assert.equal(current, serialized, "published explainability bundle is stale; run npm run export:explainability");
    console.log("Published explainability bundle matches the allowlisted formal results.");
    return;
  }
  await mkdir(path.dirname(explainabilityPublishConfig.outputFile), { recursive: true });
  await writeFile(explainabilityPublishConfig.outputFile, serialized);
  console.log(`Published explainability bundle: ${explainabilityPublishConfig.outputFile}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
