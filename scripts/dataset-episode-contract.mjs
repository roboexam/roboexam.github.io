import assert from "node:assert/strict";

const SHA256 = /^[a-f0-9]{64}$/;
const EXPECTED_TASKS = [
  "stack_bowls",
  "arrange_largest_number",
  "sort_nesting_dolls_by_size",
];
const EXPECTED_MODELS = ["oracle", "pi05", "fastwam", "cosmos_predict_2_5", "ctrlworld"];
const OUTCOMES = ["success", "half-success", "failure", "not_applicable"];
const PAIRING = ["verified_same_seed", "requested_seed_only", "source_episode"];

function assertBrowserSafe(document) {
  const serialized = JSON.stringify(document);
  assert.equal(serialized.includes("/mnt/"), false, "browser data leaks an absolute mount path");
  assert.equal(serialized.includes("\\mnt\\"), false, "browser data leaks a mount path");
}

export function validateDatasetEpisodeIndex(index) {
  assert.equal(index.schemaVersion, "unibench.dashboard.dataset-episodes.v2");
  assert.equal(index.taskCount, 3);
  assert.equal(index.cohortCount, 15);
  assert.equal(index.episodeCount, 1500);
  assert.equal(index.mediaCount, 4500);
  assert.equal(SHA256.test(index.mediaManifestSha256), true);
  assert.deepEqual(index.tasks.map((task) => task.id), EXPECTED_TASKS);
  assert.equal(index.tasks.every((task) =>
    task.availability === "available" &&
    task.catalogEpisodeCount === 100 &&
    task.baselineCount === 5 &&
    SHA256.test(task.alignmentSha256)), true);

  assert.equal(index.cohorts.length, 15);
  const cohortIds = new Set();
  for (const taskId of EXPECTED_TASKS) {
    const cohorts = index.cohorts.filter((cohort) => cohort.taskId === taskId);
    assert.deepEqual(cohorts.map((cohort) => cohort.modelId), EXPECTED_MODELS);
  }
  for (const cohort of index.cohorts) {
    assert.equal(cohortIds.has(cohort.id), false, "duplicate cohort ID: " + cohort.id);
    cohortIds.add(cohort.id);
    assert.equal(cohort.availability, "available");
    assert.equal(cohort.catalogEpisodeCount, 100);
    assert.equal(PAIRING.includes(cohort.pairingStatus), true);
    assert.equal(SHA256.test(cohort.sourceSha256), true);
    assert.equal(cohort.manifestSha256 === null || SHA256.test(cohort.manifestSha256), true);
    assert.equal(SHA256.test(cohort.episodeDataSha256), true);
    assert.match(cohort.dataUrl, /^\/episode-data\/[a-zA-Z0-9_.-]+\.json$/);
    assert.equal(cohort.dataUrl.includes(".."), false);
    assert.equal(
      cohort.outcomeCounts.success +
      cohort.outcomeCounts["half-success"] +
      cohort.outcomeCounts.failure +
      cohort.outcomeCounts.notApplicable,
      100,
    );
  }
  assertBrowserSafe(index);
  return index;
}

export function validateDatasetEpisodeChunk(chunk) {
  assert.equal(chunk.schemaVersion, "unibench.dashboard.dataset-episode-cohort.v1");
  assert.equal(EXPECTED_TASKS.includes(chunk.taskId), true);
  assert.equal(EXPECTED_MODELS.includes(chunk.modelId), true);
  assert.equal(PAIRING.includes(chunk.pairingStatus), true);
  assert.equal(chunk.episodes.length, 100);
  assert.deepEqual(
    chunk.episodes.map((episode) => episode.catalogOrdinal),
    Array.from({ length: 100 }, (_, index) => index),
  );

  const episodeIds = new Set();
  const mediaIds = new Set();
  for (const episode of chunk.episodes) {
    assert.equal(episode.taskId, chunk.taskId);
    assert.equal(episode.modelId, chunk.modelId);
    assert.equal(episode.pairingStatus, chunk.pairingStatus);
    assert.equal(episodeIds.has(episode.id), false, "duplicate episode ID: " + episode.id);
    episodeIds.add(episode.id);
    assert.equal(OUTCOMES.includes(episode.outcome), true);
    assert.equal(typeof episode.sourceOutcome, "string");
    assert.equal(episode.media.length, 3, episode.id + " media count");

    if (chunk.taskId === "stack_bowls") {
      assert.equal(chunk.pairingStatus, "verified_same_seed");
      assert.equal(Number.isInteger(episode.requestedSeed), true);
      assert.equal(episode.sourceEpisodeIndex, null);
    } else if (chunk.pairingStatus === "requested_seed_only") {
      assert.equal(Number.isInteger(episode.requestedSeed), true);
      assert.equal(episode.sourceEpisodeIndex, null);
    } else {
      assert.equal(episode.sourceEpisodeIndex, episode.catalogOrdinal);
    }

    for (const media of episode.media) {
      assert.equal(mediaIds.has(media.id), false, "duplicate media ID: " + media.id);
      mediaIds.add(media.id);
      assert.match(media.url, /^\/api\/episode-media\/[a-zA-Z0-9_./-]+\.mp4$/);
      assert.equal(media.url.includes(".."), false);
      assert.equal(SHA256.test(media.sha256), true);
      assert.equal(Number.isInteger(media.bytes) && media.bytes > 0, true);
      assert.equal(Number.isInteger(media.frameCount) && media.frameCount > 0, true);
      assert.equal(Number.isFinite(media.durationSeconds) && media.durationSeconds > 0, true);
      assert.equal(Number.isInteger(media.width) && media.width > 0, true);
      assert.equal(Number.isInteger(media.height) && media.height > 0, true);
    }
  }
  assertBrowserSafe(chunk);
  return chunk;
}
