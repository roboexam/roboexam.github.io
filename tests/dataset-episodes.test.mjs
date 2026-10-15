import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateDatasetEpisodeChunk,
  validateDatasetEpisodeIndex,
} from "../scripts/dataset-episode-contract.mjs";

const root = new URL("../", import.meta.url);
const published = JSON.parse(await readFile(new URL("app/data/generated/dataset-episodes.json", root), "utf8"));

async function loadChunk(cohort) {
  return JSON.parse(await readFile(new URL("public" + cohort.dataUrl, root), "utf8"));
}

test("publishes three tasks, fifteen formal cohorts and 1500 episodes", async () => {
  assert.doesNotThrow(() => validateDatasetEpisodeIndex(published));
  assert.deepEqual(published.tasks.map((task) => task.id), [
    "stack_bowls",
    "arrange_largest_number",
    "sort_nesting_dolls_by_size",
  ]);
  assert.equal(published.cohorts.length, 15);
  assert.equal(published.cohorts.every((cohort) => cohort.catalogEpisodeCount === 100), true);
  const chunks = await Promise.all(published.cohorts.map(loadChunk));
  assert.equal(chunks.every((chunk) => chunk.episodes.length === 100), true);
  for (const chunk of chunks) assert.doesNotThrow(() => validateDatasetEpisodeChunk(chunk));
});

test("preserves exact Stack Bowls seeds and explicit cross-task pairing semantics", async () => {
  const stackCohorts = published.cohorts.filter((cohort) => cohort.taskId === "stack_bowls");
  const stackChunks = await Promise.all(stackCohorts.map(loadChunk));
  const referenceSeeds = stackChunks[0].episodes.map((episode) => episode.requestedSeed);
  for (const chunk of stackChunks) {
    assert.equal(chunk.pairingStatus, "verified_same_seed");
    assert.deepEqual(chunk.episodes.map((episode) => episode.requestedSeed), referenceSeeds);
  }

  for (const cohort of published.cohorts.filter((entry) => entry.taskId !== "stack_bowls")) {
    const chunk = await loadChunk(cohort);
    assert.deepEqual(chunk.episodes.map((episode) => episode.catalogOrdinal), Array.from({ length: 100 }, (_, index) => index));
    if (["pi05", "fastwam"].includes(cohort.modelId)) {
      assert.equal(chunk.pairingStatus, "requested_seed_only");
      assert.equal(chunk.episodes.every((episode) => episode.sourceEpisodeIndex === null), true);
    } else {
      assert.equal(chunk.pairingStatus, "source_episode");
      assert.equal(chunk.episodes.every((episode) => episode.sourceEpisodeIndex === episode.catalogOrdinal), true);
    }
  }
});

test("rejects duplicate IDs, leaked paths, partial cohorts and missing media", async () => {
  const invalidIndex = structuredClone(published);
  invalidIndex.cohorts[1].id = invalidIndex.cohorts[0].id;
  assert.throws(() => validateDatasetEpisodeIndex(invalidIndex), /duplicate cohort ID/);

  const partial = structuredClone(published);
  partial.cohorts[0].availability = "partial";
  assert.throws(() => validateDatasetEpisodeIndex(partial));

  const chunk = await loadChunk(published.cohorts[0]);
  const duplicate = structuredClone(chunk);
  duplicate.episodes[1].id = duplicate.episodes[0].id;
  assert.throws(() => validateDatasetEpisodeChunk(duplicate), /duplicate episode ID/);

  const leaked = structuredClone(chunk);
  leaked.episodes[0].media[0].url = "/mnt/private/video.mp4";
  assert.throws(() => validateDatasetEpisodeChunk(leaked));

  const traversal = structuredClone(chunk);
  traversal.episodes[0].media[0].url = "/api/episode-media/../private.mp4";
  assert.throws(() => validateDatasetEpisodeChunk(traversal));

  const missing = structuredClone(chunk);
  missing.episodes[0].media.pop();
  assert.throws(() => validateDatasetEpisodeChunk(missing), /media count/);
});

test("curated explorer resets the task subtree and synchronizes all camera views", async () => {
  const component = await readFile(new URL("app/components/dataset-explorer.tsx", root), "utf8");
  const card = await readFile(new URL("app/components/curated-episode-card.tsx", root), "utf8");
  const player = await readFile(new URL("app/components/synchronized-camera-player.tsx", root), "utf8");
  assert.match(component, /TaskWorkspace key=\{task.id\}/);
  assert.match(component, /controller\.abort\(\)/);
  assert.match(card, /<SynchronizedCameraPlayer/);
  assert.match(player, /"cam_head", "cam_left_wrist", "cam_right_wrist"/);
  assert.match(player, /Math\.abs\(video\.currentTime - current\) > \.12/);
  assert.doesNotMatch(component, /\/mnt\//);
});
