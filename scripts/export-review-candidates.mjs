import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pendingReviewCandidates } from "./review-admission.mjs";

const registration = JSON.parse(await readFile(new URL("./pipeline-review-source.json", import.meta.url), "utf8"));
const REVIEW_ROOT = process.env.UNIBENCH_REVIEW_ROOT ?? registration.root;
const MEDIA_ROOT =
  process.env.UNIBENCH_REVIEW_MEDIA_ROOT ??
  "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation";
const CAMERAS = ["cam_head", "cam_left_wrist", "cam_right_wrist"];
const CURATED_ROOT = process.env.UNIBENCH_CURATED_ROOT ??
  "/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data";
const REQUIRED_CHECKS = [
  "complete_three_camera_set",
  "deduplicated_within_snapshot",
  "manifest_hash_verified",
  "not_present_in_curated_baseline",
  "selector_exit_code_zero",
  "clean_selector_passed",
  "three_video_hashes_verified",
  "three_videos_fully_decodable",
];
const check = process.argv.includes("--check");

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

async function hashFile(file) {
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  return digest.digest("hex");
}

async function publish(file, value) {
  const content = json(value);
  if (check) {
    assert.equal(await readFile(file, "utf8"), content, `outdated bundle: ${file}`);
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

const snapshots = (await readdir(REVIEW_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("snapshot_") && (process.env.UNIBENCH_REVIEW_ROOT || entry.name === registration.snapshotId))
  .map((entry) => path.join(REVIEW_ROOT, entry.name))
  .sort();
assert.ok(snapshots.length > 0, "no complete review snapshot exists");

let snapshot;
for (const candidate of snapshots.toReversed()) {
  try {
    const complete = await readJson(path.join(candidate, "COMPLETE.json"));
    if (complete.status === "complete") {
      snapshot = { path: candidate, complete };
      break;
    }
  } catch {
    // Incomplete snapshots are never publishable.
  }
}
assert.ok(snapshot, "no complete review snapshot exists");

const inventoryPath = path.join(snapshot.path, "candidate_inventory.json");
const inventoryBytes = await readFile(inventoryPath);
const inventory = JSON.parse(inventoryBytes);
assert.equal(
  hash(inventoryBytes),
  snapshot.complete.candidate_inventory_sha256,
  "review inventory hash differs from COMPLETE.json",
);
assert.equal(
  inventory.schema_version,
  "benchmark2027.rolling_human_video_review_inventory.v1",
);
assert.equal(inventory.snapshot_id, snapshot.complete.snapshot_id);
if (!process.env.UNIBENCH_REVIEW_ROOT) assert.equal(hash(inventoryBytes), registration.inventorySha256);
assert.equal(inventory.review_status, "pending_human_video_review");
assert.equal(inventory.admission_status, "not_authorized_not_admitted");
assert.equal(inventory.candidate_count, inventory.candidates.length);
assert.equal(inventory.candidate_count, snapshot.complete.candidate_count);
assert.equal(inventory.video_count, inventory.candidate_count * CAMERAS.length);
assert.equal(inventory.video_count, snapshot.complete.video_count);

const mediaRoot = await realpath(MEDIA_ROOT);
const mediaIndex = {};
const grouped = new Map();
const episodeIds = new Set();
const catalog = await readJson(path.join(CURATED_ROOT, "catalog.json"));
const pendingCandidates = pendingReviewCandidates(inventory.candidates, catalog);

for (const candidate of pendingCandidates) {
  assert.equal(candidate.review_status, "pending_human_video_review");
  assert.match(candidate.episode_id, /^episode:[a-f0-9]+$/);
  assert.match(candidate.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(candidate.scene_seed));
  assert.ok(!episodeIds.has(candidate.episode_id), "duplicate review episode ID");
  episodeIds.add(candidate.episode_id);
  for (const key of REQUIRED_CHECKS) {
    assert.equal(candidate.checks[key], true, `${candidate.episode_id}: ${key}`);
  }

  const media = [];
  for (const camera of CAMERAS) {
    const source = candidate.videos[camera];
    assert.ok(source, `${candidate.episode_id}: missing ${camera}`);
    assert.equal(source.verification.byte_size_verified, true);
    assert.equal(source.verification.sha256_verified, true);
    assert.equal(source.verification.full_decode_passed, true);
    assert.equal(
      source.verification.decoded_frame_count,
      source.manifest_frame_count,
    );
    assert.match(source.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(source.manifest_byte_size));
    assert.ok(Number.isSafeInteger(source.manifest_frame_count));
    assert.ok(source.manifest_fps > 0);

    const physical = await realpath(source.path);
    assert.ok(
      physical.startsWith(`${mediaRoot}${path.sep}`),
      `review video is outside the staging root: ${physical}`,
    );
    const info = await stat(physical);
    assert.ok(info.isFile());
    assert.equal(info.size, source.manifest_byte_size);
    assert.equal(await hashFile(physical), source.manifest_sha256);

    const relativePath = path.relative(mediaRoot, physical);
    assert.ok(
      relativePath &&
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath),
    );
    const previous = mediaIndex[source.manifest_sha256];
    const reference = { relativePath, bytes: source.manifest_byte_size };
    assert.ok(
      !previous ||
        (previous.relativePath === reference.relativePath &&
          previous.bytes === reference.bytes),
      `video hash collision: ${source.manifest_sha256}`,
    );
    mediaIndex[source.manifest_sha256] = reference;
    media.push({
      camera,
      sha256: source.manifest_sha256,
      bytes: source.manifest_byte_size,
      frames: source.manifest_frame_count,
      fps: source.manifest_fps,
      duration: source.manifest_frame_count / source.manifest_fps,
      url: `/api/review-media?file=${source.manifest_sha256}.mp4`,
    });
  }

  const row = {
    id: candidate.episode_id,
    attempt: candidate.attempt,
    seed: candidate.scene_seed,
    manifestSha256: candidate.manifest_sha256,
    finalCountKeySha256: candidate.final_count_key_sha256,
    selectionReportSha256: candidate.selector.selection_report_sha256,
    reviewStatus: candidate.review_status,
    instruction: candidate.instruction,
    qualification: candidate.qualification,
    contractId: candidate.contractId,
    sourceCommit: candidate.sourceCommit,
    media,
  };
  if (!grouped.has(candidate.task)) grouped.set(candidate.task, []);
  grouped.get(candidate.task).push(row);
}

if (!check) await rm("public/review-data", { recursive: true, force: true });
const tasks = [];
for (const [taskId, episodes] of [...grouped].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  episodes.sort((a, b) => a.seed - b.seed || a.id.localeCompare(b.id));
  const chunk = {
    schemaVersion: "unibench.review-candidate-task.v1",
    snapshotId: inventory.snapshot_id,
    taskId,
    reviewStatus: "pending_human_video_review",
    admissionStatus: "not_authorized_not_admitted",
    episodes,
  };
  const content = json(chunk);
  const digest = hash(content);
  const dataUrl = `/review-data/${taskId}-${digest.slice(0, 16)}.json`;
  await publish(path.join("public", dataUrl), chunk);
  tasks.push({ id: taskId, count: episodes.length, dataUrl, sha256: digest });
}

if (check) {
  const expected = new Set(tasks.map((task) => path.basename(task.dataUrl)));
  const actual = new Set(await readdir("public/review-data").catch((error) => {
    if (error.code === "ENOENT" && expected.size === 0) return [];
    throw error;
  }));
  assert.deepEqual(actual, expected, "stale or missing review task chunks");
}

await publish("app/data/generated/review-candidates.json", {
  schemaVersion: "unibench.review-candidates.v1",
  snapshotId: inventory.snapshot_id,
  candidateInventorySha256: snapshot.complete.candidate_inventory_sha256,
  reviewStatus: "pending_human_video_review",
  admissionStatus: "not_authorized_not_admitted",
  candidateCount: episodeIds.size,
  mediaCount: Object.keys(mediaIndex).length,
  generatedAt: inventory.generated_at,
  rolling: {
    previousSnapshotId: inventory.rolling.previous_snapshot_id,
    previousCandidateCount: inventory.rolling.previous_candidate_count,
    newCandidateCount: inventory.rolling.new_since_previous_count,
  },
  tasks,
});
await publish("app/data/generated/review-media.json", mediaIndex);

console.log(
  `Review candidates ${check ? "verified" : "exported"}: ` +
    `${tasks.length} tasks, ${episodeIds.size} candidates, ` +
    `${Object.keys(mediaIndex).length} videos from ${inventory.snapshot_id}`,
);
