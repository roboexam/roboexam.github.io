import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { vlaWamSamplePublishConfig, vlaWamSampleRegistry } from "./vla-wam-sample-result-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/;

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function load(file) {
  const bytes = await readFile(file);
  return { bytes, sha256: digest(bytes) };
}

function finiteOrNull(value, label) {
  assert.equal(value === null || Number.isFinite(value), true, `${label} must be finite or null`);
  return value;
}

function compactEpisode(row, mediaEpisode) {
  assert.equal(row.seed, mediaEpisode.requestedSeed, "episode/media seed mismatch");
  assert.equal(row.classification, mediaEpisode.outcome, `seed ${row.seed} outcome mismatch`);
  assert.equal(row.score, mediaEpisode.finalScore, `seed ${row.seed} score mismatch`);
  assert.deepEqual(row.issues, [], `seed ${row.seed} evaluator issues`);

  const head = mediaEpisode.media.find((item) => item.kind === "cam_head" && item.preferred);
  assert.ok(head, `seed ${row.seed} missing preferred head camera`);
  assert.match(head.sha256, SHA256);

  for (const side of ["left", "right"]) {
    for (const [metric, value] of Object.entries(row.trajectory_metrics[side])) {
      finiteOrNull(value, `seed ${row.seed} ${side}.${metric}`);
    }
  }

  return {
    id: row.episode_id,
    seed: row.seed,
    outcome: row.classification,
    success: row.success,
    score: row.score,
    stepCount: row.step_count,
    durationSeconds: row.duration_s,
    timing: {
      iterationsPerSecond: row.timing.it_per_sec,
      wallTotalSeconds: row.timing.wall_total_s,
    },
    events: {
      taskAdherence: row.event_metrics.task_adherence_event_count,
      objectSlip: row.event_metrics.object_slip_count,
      environmentCollision: row.event_metrics.environment_collision_count,
      selfCollision: row.event_metrics.self_collision_count,
    },
    trajectory: row.trajectory_metrics,
    totals: row.trajectory_totals,
    media: {
      url: head.url,
      sha256: head.sha256,
      durationSeconds: head.durationSeconds,
      frameCount: head.frameCount,
      frameRate: head.frameRate,
      width: head.width,
      height: head.height,
    },
  };
}

async function buildModel(entry) {
  const episodesSource = await load(entry.episodesFile);
  const mediaSource = await load(entry.mediaCatalogFile);
  assert.equal(episodesSource.sha256, entry.expectedEpisodesSha256, `${entry.displayName} episodes SHA256`);
  assert.equal(mediaSource.sha256, entry.expectedMediaCatalogSha256, `${entry.displayName} media SHA256`);

  const episodes = episodesSource.bytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  const mediaCatalog = JSON.parse(mediaSource.bytes.toString("utf8"));
  assert.equal(episodes.length, 100, `${entry.displayName} source cohort size`);
  assert.equal(mediaCatalog.episodes.length, 100, `${entry.displayName} media cohort size`);
  assert.equal(new Set(entry.sampleSeeds).size, 10, `${entry.displayName} sample seeds must be unique`);

  const bySeed = new Map(episodes.map((row) => [row.seed, row]));
  const mediaBySeed = new Map(mediaCatalog.episodes.map((row) => [row.requestedSeed, row]));
  const samples = entry.sampleSeeds.map((seed) => {
    assert.ok(bySeed.has(seed), `${entry.displayName} missing evaluator seed ${seed}`);
    assert.ok(mediaBySeed.has(seed), `${entry.displayName} missing media seed ${seed}`);
    return compactEpisode(bySeed.get(seed), mediaBySeed.get(seed));
  });
  const outcomes = new Set(samples.map((sample) => sample.outcome));
  for (const outcome of ["success", "half-success", "failure"]) {
    assert.equal(outcomes.has(outcome), true, `${entry.displayName} sample set missing ${outcome}`);
  }
  if (entry.modelId === "pi05") {
    assert.equal(samples.some((sample) => sample.events.taskAdherence.count > 0), true, "Pi0.5 samples need event positive");
  }

  return {
    modelId: entry.modelId,
    displayName: entry.displayName,
    family: entry.family,
    task: entry.task,
    resultVersion: entry.resultVersion,
    samples,
    provenance: {
      episodesSha256: episodesSource.sha256,
      mediaCatalogSha256: mediaSource.sha256,
    },
  };
}

async function main() {
  const models = {};
  for (const entry of vlaWamSampleRegistry) {
    const model = await buildModel(entry);
    models[model.displayName] = model;
  }
  const bundle = {
    schemaVersion: "unibench.dashboard.vla-wam-samples.v1",
    bundleVersion: vlaWamSamplePublishConfig.bundleVersion,
    generatedBy: "scripts/export-vla-wam-samples.mjs",
    models,
  };
  const output = `${JSON.stringify(bundle, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(vlaWamSamplePublishConfig.outputFile, "utf8");
    assert.equal(current, output, "VLA/WAM sample browser bundle is stale; run npm run export:vla-wam-samples");
    console.log("VLA/WAM sample browser bundle is current.");
    return;
  }
  await mkdir(path.dirname(vlaWamSamplePublishConfig.outputFile), { recursive: true });
  await writeFile(vlaWamSamplePublishConfig.outputFile, output);
  console.log(`Wrote ${vlaWamSamplePublishConfig.outputFile}`);
}

await main();
