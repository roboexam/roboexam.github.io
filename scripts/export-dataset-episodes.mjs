import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  validateDatasetEpisodeChunk,
  validateDatasetEpisodeIndex,
} from "./dataset-episode-contract.mjs";
import { datasetEpisodeRegistry as registry } from "./dataset-episode-registry.mjs";

const execFile = promisify(execFileCallback);
const checkOnly = process.argv.includes("--check");
const MODEL_ORDER = ["oracle", "pi05", "fastwam", "cosmos_predict_2_5", "ctrlworld"];
const mediaSlots = [];
let activeMediaTasks = 0;

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(file) {
  return hashBytes(await readFile(file));
}

async function loadJson(file, expectedSha256) {
  const bytes = await readFile(file);
  const digest = hashBytes(bytes);
  if (expectedSha256) assert.equal(digest, expectedSha256, "source SHA256: " + file);
  return { document: JSON.parse(bytes.toString("utf8")), sha256: digest };
}

async function loadJsonl(file, expectedSha256) {
  const bytes = await readFile(file);
  const digest = hashBytes(bytes);
  if (expectedSha256) assert.equal(digest, expectedSha256, "source SHA256: " + file);
  return {
    rows: bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
    sha256: digest,
  };
}

function sourceIndexFromText(value) {
  const match = String(value).match(/episode_(\d+)/i);
  assert.ok(match, "source episode index missing from " + value);
  return Number(match[1]);
}

function requestedSeedFromText(value, required = true) {
  const match = String(value).match(/requested_seed(\d+)|seed[_-]?(\d+)/i);
  if (!match) {
    assert.equal(required, false, "requested seed missing from " + value);
    return null;
  }
  return Number(match[1] ?? match[2]);
}

function assertHundredDistinct(values, label) {
  assert.equal(values.length, 100, label + " must contain 100 records");
  assert.equal(new Set(values).size, 100, label + " must contain 100 distinct values");
}

function assertSequence(values, label) {
  assert.deepEqual(values, Array.from({ length: 100 }, (_, index) => index), label);
}

function withMediaSlot(work) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeMediaTasks += 1;
      try {
        resolve(await work());
      } catch (error) {
        reject(error);
      } finally {
        activeMediaTasks -= 1;
        const next = mediaSlots.shift();
        if (next) next();
      }
    };
    if (activeMediaTasks < 12) run();
    else mediaSlots.push(run);
  });
}

async function probeVideo(file) {
  const { stdout } = await execFile("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=nb_frames,r_frame_rate,width,height:format=duration",
    "-of", "json",
    file,
  ], { maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0];
  assert.ok(stream, "video stream missing: " + file);
  const durationSeconds = Number(parsed.format?.duration);
  const frameCount = Number(stream.nb_frames);
  assert.equal(Number.isFinite(durationSeconds) && durationSeconds > 0, true, "duration: " + file);
  assert.equal(Number.isInteger(frameCount) && frameCount > 0, true, "frame count: " + file);
  return {
    frameCount,
    frameRate: stream.r_frame_rate,
    width: Number(stream.width),
    height: Number(stream.height),
    durationSeconds: Number(durationSeconds.toFixed(3)),
  };
}

function cameraLabel(camera) {
  return {
    cam_head: ["cam_head", "Head camera"],
    cam_left_wrist: ["cam_left_wrist", "Left wrist"],
    cam_right_wrist: ["cam_right_wrist", "Right wrist"],
  }[camera];
}

async function videoRecord({ source, taskId, modelId, selectionKey, kind, label, preferred = false }) {
  return withMediaSlot(async () => {
    const [info, digest, probe] = await Promise.all([stat(source), hashFile(source), probeVideo(source)]);
    assert.equal(info.isFile(), true, "video missing: " + source);
    const relativePath = [
      taskId,
      modelId,
      selectionKey,
      path.basename(source),
    ].join("/");
    return {
      source,
      published: {
        id: [taskId, modelId, selectionKey, kind].join(":"),
        kind,
        label,
        preferred,
        url: "/api/episode-media/" + relativePath,
        relativePath,
        sha256: digest,
        bytes: info.size,
        ...probe,
      },
    };
  });
}

async function cameraVideos(episodeDir, taskId, modelId, selectionKey) {
  const files = await readdir(episodeDir);
  return Promise.all(["cam_head", "cam_left_wrist", "cam_right_wrist"].map(async (camera) => {
    const matches = files.filter((file) => file.endsWith(".mp4") && file.includes(camera));
    assert.equal(matches.length, 1, [taskId, modelId, selectionKey, camera].join(" "));
    const [kind, label] = cameraLabel(camera);
    return videoRecord({
      source: path.join(episodeDir, matches[0]),
      taskId,
      modelId,
      selectionKey,
      kind,
      label,
      preferred: camera === "cam_head",
    });
  }));
}

async function acwmVideos(source, taskId, episode, selectionKey) {
  const episodeDir = path.join(source.cohortRoot, "episodes", path.basename(episode.output_dir));
  const definitions = [
    ["comparison", "Oracle vs prediction", episode.comparison_video, true],
    ["oracle_aligned", "Oracle aligned", episode.oracle_aligned_video, false],
    ["prediction", "Prediction", episode.prediction_video, false],
  ];
  return Promise.all(definitions.map(([kind, label, declared, preferred]) =>
    videoRecord({
      source: path.join(episodeDir, path.basename(declared)),
      taskId,
      modelId: source.modelId,
      selectionKey,
      kind,
      label,
      preferred,
    })));
}

function protocolLabel(kind) {
  if (kind === "oracle_gt") return "Oracle GT trajectory";
  if (kind === "policy_rollout") return "RoboDojo closed-loop rollout";
  return "42-frame action-conditioned open-loop prediction";
}

function outcomeCounts(summary, kind) {
  if (kind === "acwm_open_loop") {
    return { success: 0, "half-success": 0, failure: 0, notApplicable: 100 };
  }
  if (kind === "oracle_gt") {
    return { success: 100, "half-success": 0, failure: 0, notApplicable: 0 };
  }
  return {
    success: summary.categories.success,
    "half-success": summary.categories["half-success"],
    failure: summary.categories.failure,
    notApplicable: 0,
  };
}

function selectionKey(task, descriptor) {
  return task.selectionMode === "seed"
    ? "seed-" + descriptor.requestedSeed
    : "episode-" + String(descriptor.catalogOrdinal).padStart(3, "0");
}

function publicEpisode({ task, source, descriptor, outcome, sourceOutcome, finalScore, media }) {
  const key = selectionKey(task, descriptor);
  return {
    id: [task.id, source.modelId, key].join(":"),
    taskId: task.id,
    modelId: source.modelId,
    catalogOrdinal: descriptor.catalogOrdinal,
    requestedSeed: descriptor.requestedSeed,
    sourceEpisodeIndex: descriptor.sourceEpisodeIndex,
    outcome,
    sourceOutcome,
    finalScore,
    protocolKind: source.protocolKind,
    pairingStatus: source.pairingStatus ?? task.pairingStatus,
    media: media.map((entry) => entry.published),
  };
}

async function stackOracleDescriptors(source) {
  const loaded = await loadJson(source.alignmentSummary, source.summarySha256);
  assert.equal(loaded.document.status, "PASS");
  assert.equal(loaded.document.aggregate.episode_count, 100);
  const sorted = [...loaded.document.episodes]
    .map((episode) => ({
      requestedSeed: requestedSeedFromText(episode.episode),
      sourceEpisodeIndex: null,
      episodeDir: path.dirname(episode.source_video),
    }))
    .sort((a, b) => a.requestedSeed - b.requestedSeed)
    .map((descriptor, catalogOrdinal) => ({ ...descriptor, catalogOrdinal }));
  assertHundredDistinct(sorted.map((entry) => entry.requestedSeed), "stack Oracle seeds");
  return { descriptors: sorted, summary: loaded.document, sourceSha256: loaded.sha256, manifestSha256: null };
}

async function oracleDirectoryDescriptors(source) {
  const loaded = await loadJson(path.join(source.cohortRoot, "summary.json"), source.summarySha256);
  assert.equal(loaded.document.total, 100);
  assert.equal(loaded.document.complete_artifact_episodes, 100);
  assert.equal(loaded.document.distinct_source_episode_indices, 100);
  assert.equal(loaded.document.distinct_requested_seeds, 100);
  assert.equal(loaded.document.simulator_seed_available, false);
  assert.equal(loaded.document.seed_equivalence_verified, false);
  const root = path.join(source.cohortRoot, "success");
  const entries = await readdir(root, { withFileTypes: true });
  const descriptors = entries.filter((entry) => entry.isDirectory()).map((entry) => ({
    sourceEpisodeIndex: sourceIndexFromText(entry.name),
    requestedSeed: requestedSeedFromText(entry.name),
    episodeDir: path.join(root, entry.name),
  })).sort((a, b) => a.sourceEpisodeIndex - b.sourceEpisodeIndex)
    .map((descriptor) => ({ ...descriptor, catalogOrdinal: descriptor.sourceEpisodeIndex }));
  assertSequence(descriptors.map((entry) => entry.sourceEpisodeIndex), "Oracle source episode sequence");
  assertHundredDistinct(descriptors.map((entry) => entry.requestedSeed), "Oracle requested seeds");
  return { descriptors, summary: loaded.document, sourceSha256: loaded.sha256, manifestSha256: null };
}

async function policyDescriptors(source) {
  const [summaryLoaded, manifestLoaded] = await Promise.all([
    loadJson(path.join(source.cohortRoot, "summary.json"), source.summarySha256),
    loadJsonl(path.join(source.cohortRoot, "manifest.jsonl"), source.manifestSha256),
  ]);
  const summary = summaryLoaded.document;
  assert.equal(summary.total, 100);
  assert.equal(summary.distinct_seeds, 100);
  assert.equal(summary.complete_artifact_episodes, 100);
  assert.equal(summary.categories.success + summary.categories["half-success"] + summary.categories.failure, 100);
  const descriptors = [...manifestLoaded.rows].sort((a, b) => a.run_index - b.run_index).map((row) => ({
    catalogOrdinal: row.run_index,
    sourceEpisodeIndex: null,
    requestedSeed: row.seed,
    episodeDir: path.join(source.cohortRoot, row.episode_dir),
    row,
  }));
  assertSequence(descriptors.map((entry) => entry.catalogOrdinal), source.displayName + " run sequence");
  assertHundredDistinct(descriptors.map((entry) => entry.requestedSeed), source.displayName + " requested seeds");
  return {
    descriptors,
    summary,
    sourceSha256: summaryLoaded.sha256,
    manifestSha256: manifestLoaded.sha256,
  };
}

async function acwmDescriptors(source, task) {
  const loaded = await loadJson(path.join(source.cohortRoot, "batch_summary.json"), source.summarySha256);
  const summary = loaded.document;
  assert.equal(summary.status, "PASS");
  assert.equal(summary.aggregate.episode_count, 100);
  assert.equal(summary.episodes.length, 100);
  let descriptors;
  if (task.selectionMode === "seed") {
    descriptors = summary.episodes.map((episode) => ({
      requestedSeed: requestedSeedFromText(episode.episode),
      sourceEpisodeIndex: null,
      episode,
    })).sort((a, b) => a.requestedSeed - b.requestedSeed)
      .map((descriptor, catalogOrdinal) => ({ ...descriptor, catalogOrdinal }));
    assertHundredDistinct(descriptors.map((entry) => entry.requestedSeed), source.displayName + " seeds");
  } else {
    descriptors = summary.episodes.map((episode) => {
      const sourceEpisodeIndex = episode.episode_index ?? sourceIndexFromText(episode.episode);
      return {
        catalogOrdinal: sourceEpisodeIndex,
        sourceEpisodeIndex,
        requestedSeed: requestedSeedFromText(episode.episode ?? episode.episode_id, false),
        episode,
      };
    }).sort((a, b) => a.catalogOrdinal - b.catalogOrdinal);
    assertSequence(descriptors.map((entry) => entry.sourceEpisodeIndex), source.displayName + " source episode sequence");
  }
  return { descriptors, summary, sourceSha256: loaded.sha256, manifestSha256: null };
}

async function loadDescriptors(source, task) {
  if (source.sourceKind === "stack_oracle") return stackOracleDescriptors(source);
  if (source.sourceKind === "oracle_directory") return oracleDirectoryDescriptors(source);
  if (source.sourceKind === "policy_manifest") return policyDescriptors(source);
  if (source.sourceKind === "acwm_summary") return acwmDescriptors(source, task);
  throw new Error("Unknown source kind: " + source.sourceKind);
}

async function buildCohort(task, source) {
  const loaded = await loadDescriptors(source, task);
  const episodeMedia = await Promise.all(loaded.descriptors.map(async (descriptor) => {
    const key = selectionKey(task, descriptor);
    if (source.sourceKind === "acwm_summary") {
      return acwmVideos(source, task.id, descriptor.episode, key);
    }
    return cameraVideos(descriptor.episodeDir, task.id, source.modelId, key);
  }));
  const allMedia = episodeMedia.flat();
  const episodes = loaded.descriptors.map((descriptor, index) => {
    const row = descriptor.row;
    const outcome = source.protocolKind === "acwm_open_loop"
      ? "not_applicable"
      : source.protocolKind === "oracle_gt"
        ? "success"
        : row.classification;
    return publicEpisode({
      task,
      source,
      descriptor,
      outcome,
      sourceOutcome: source.protocolKind === "policy_rollout" ? row.classification : "success",
      finalScore: source.protocolKind === "policy_rollout" ? row.final_score : source.protocolKind === "oracle_gt" ? 1 : null,
      media: episodeMedia[index],
    });
  });
  const pairingStatus = source.pairingStatus ?? task.pairingStatus;
  const cohortId = [task.id, source.modelId, source.resultVersion].join(":");
  const chunk = validateDatasetEpisodeChunk({
    schemaVersion: "unibench.dashboard.dataset-episode-cohort.v1",
    cohortId,
    taskId: task.id,
    modelId: source.modelId,
    pairingStatus,
    episodes,
  });
  const chunkBytes = Buffer.from(JSON.stringify(chunk) + "\n");
  const chunkFile = [task.id, source.modelId, source.resultVersion].join("--").replaceAll(":", "-") + ".json";
  return {
    cohort: {
      id: cohortId,
      taskId: task.id,
      modelId: source.modelId,
      displayName: source.displayName,
      family: source.family,
      resultVersion: source.resultVersion,
      protocolKind: source.protocolKind,
      protocolLabel: protocolLabel(source.protocolKind),
      availability: "available",
      pairingStatus,
      catalogEpisodeCount: 100,
      distinctRequestedSeedCount: new Set(episodes.map((episode) => episode.requestedSeed).filter(Number.isInteger)).size || null,
      outcomeCounts: outcomeCounts(loaded.summary, source.protocolKind),
      sourceSha256: loaded.sourceSha256,
      manifestSha256: loaded.manifestSha256,
      dataUrl: "/episode-data/" + chunkFile,
      episodeDataSha256: hashBytes(chunkBytes),
    },
    chunk,
    chunkBytes,
    chunkFile,
    allMedia,
  };
}

function assertTaskAlignment(task, built) {
  if (task.selectionMode === "seed") {
    const reference = built[0].chunk.episodes.map((episode) => episode.requestedSeed);
    for (const result of built.slice(1)) {
      assert.deepEqual(result.chunk.episodes.map((episode) => episode.requestedSeed), reference,
        result.cohort.displayName + " stack seed set");
    }
    return hashBytes(Buffer.from(reference.join(",")));
  }
  const reference = Array.from({ length: 100 }, (_, index) => index);
  for (const result of built) {
    assert.deepEqual(result.chunk.episodes.map((episode) => episode.catalogOrdinal), reference,
      result.cohort.displayName + " catalog ordinal");
  }
  const requested = built
    .filter((result) => result.chunk.episodes.every((episode) => Number.isInteger(episode.requestedSeed)))
    .map((result) => result.chunk.episodes.map((episode) => episode.requestedSeed));
  for (const values of requested.slice(1)) {
    assert.deepEqual(values, requested[0], task.displayName + " requested seed plan");
  }
  return hashBytes(Buffer.from(reference.join(",")));
}

async function buildBundle() {
  const taskResults = [];
  const chunks = [];
  const allMedia = [];
  for (const task of registry.tasks) {
    const built = [];
    for (const source of task.sources) {
      built.push(await buildCohort(task, source));
    }
    assert.deepEqual(built.map((entry) => entry.cohort.modelId), MODEL_ORDER);
    const alignmentSha256 = assertTaskAlignment(task, built);
    taskResults.push({
      id: task.id,
      displayName: task.displayName,
      availability: "available",
      selectionMode: task.selectionMode,
      pairingStatus: task.pairingStatus,
      pairingNote: task.pairingNote,
      catalogEpisodeCount: 100,
      baselineCount: built.length,
      alignmentSha256,
    });
    chunks.push(...built.map((entry) => ({
      file: entry.chunkFile,
      bytes: entry.chunkBytes,
      document: entry.chunk,
      cohort: entry.cohort,
    })));
    allMedia.push(...built.flatMap((entry) => entry.allMedia));
  }
  const cohortMetadata = chunks.map((chunk) => chunk.cohort);

  const mediaFiles = allMedia.map((entry) => entry.published).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  assert.equal(new Set(mediaFiles.map((entry) => entry.relativePath)).size, mediaFiles.length);
  const mediaManifest = {
    schema_version: 1,
    bundle_version: registry.mediaBundleVersion,
    file_count: mediaFiles.length,
    total_bytes: mediaFiles.reduce((sum, file) => sum + file.bytes, 0),
    files: mediaFiles.map((file) => ({ path: file.relativePath, bytes: file.bytes, sha256: file.sha256 })),
  };
  const mediaManifestBytes = Buffer.from(JSON.stringify(mediaManifest) + "\n");
  const index = validateDatasetEpisodeIndex({
    schemaVersion: "unibench.dashboard.dataset-episodes.v2",
    bundleVersion: registry.mediaBundleVersion,
    generatedBy: "scripts/export-dataset-episodes.mjs",
    mediaBundleVersion: registry.mediaBundleVersion,
    mediaManifestSha256: hashBytes(mediaManifestBytes),
    taskCount: taskResults.length,
    cohortCount: cohortMetadata.length,
    episodeCount: cohortMetadata.length * 100,
    mediaCount: mediaFiles.length,
    tasks: taskResults,
    cohorts: cohortMetadata,
  });
  return { index, chunks, mediaManifest, mediaManifestBytes, allMedia };
}

async function publishMedia(mediaManifestBytes, allMedia) {
  const finalRoot = path.resolve(registry.mediaBundleDir);
  try {
    const existing = await readFile(path.join(finalRoot, "manifest.json"));
    assert.deepEqual(existing, mediaManifestBytes, "existing immutable media bundle differs");
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(registry.stagingRoot, { recursive: true });
  const stagingRoot = path.join(registry.stagingRoot, "dashboard-episode-full-" + process.pid);
  for (const entry of allMedia) {
    const destination = path.join(stagingRoot, "media", entry.published.relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    const resolvedSource = await realpath(entry.source);
    try {
      await link(resolvedSource, destination);
    } catch (error) {
      if (error.code !== "EXDEV" && error.code !== "EPERM" && error.code !== "EACCES") throw error;
      await copyFile(resolvedSource, destination);
    }
  }
  await writeFile(path.join(stagingRoot, "manifest.json"), mediaManifestBytes);
  await mkdir(path.dirname(finalRoot), { recursive: true });
  await rename(stagingRoot, finalRoot);
}

async function writeOutputs(index, chunks) {
  const indexBytes = Buffer.from(JSON.stringify(index) + "\n");
  await mkdir(path.dirname(registry.indexOutputFile), { recursive: true });
  await mkdir(registry.chunkOutputDir, { recursive: true });
  const tempIndex = registry.indexOutputFile + ".tmp";
  await writeFile(tempIndex, indexBytes);
  await rename(tempIndex, registry.indexOutputFile);
  for (const chunk of chunks) {
    const output = path.join(registry.chunkOutputDir, chunk.file);
    const temp = output + ".tmp";
    await writeFile(temp, chunk.bytes);
    await rename(temp, output);
  }
}

const built = await buildBundle();
if (checkOnly) {
  assert.equal(await readFile(registry.indexOutputFile, "utf8"), JSON.stringify(built.index) + "\n");
  assert.deepEqual(
    await readFile(path.join(registry.mediaBundleDir, "manifest.json")),
    built.mediaManifestBytes,
  );
  for (const chunk of built.chunks) {
    assert.deepEqual(await readFile(path.join(registry.chunkOutputDir, chunk.file)), chunk.bytes);
  }
  console.log("Dataset episode full bundle verified: 3 tasks, 15 cohorts, 1500 episodes.");
} else {
  await publishMedia(built.mediaManifestBytes, built.allMedia);
  await writeOutputs(built.index, built.chunks);
  console.log("Published dataset episode full bundle: 3 tasks, 15 cohorts, 1500 episodes.");
}
