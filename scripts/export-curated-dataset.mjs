import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT, CAMERAS, DOCUMENT_OOD_CONDITIONS, validateRow, validateChunk } from "./curated-dataset-contract.mjs";

const check = process.argv.includes("--check");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashFile(file) {
  const h = createHash("sha256");
  for await (const bytes of createReadStream(file)) h.update(bytes);
  return h.digest("hex");
}
const catalogBytes = await readFile(path.join(ROOT, "catalog.json"));
const catalog = JSON.parse(catalogBytes);
assert.equal(catalog.schema_version, "benchmark2027.curated_catalog.v2");
assert.equal(catalog.episode_count, catalog.episodes.length);
const registry = await read(path.join(ROOT, "episode_numbers.json"));
// Tags and translations are a research judgement, not something the
// capture data carries, so they are authored here as data. Adding a task
// is a JSON edit; it no longer means editing this exporter.
const taskMetadata = await read(new URL("./curated-task-metadata.json", import.meta.url).pathname);
const catalogSha256 = hash(catalogBytes);
const root = await realpath(ROOT);
const groups = new Map(), mediaIndex = {}, seen = new Set(), selections = new Map();
for (const row of catalog.episodes) {
  assert.ok(!seen.has(row.episode_id), "duplicate episode ID"); seen.add(row.episode_id);
  const manifestPath = path.join(root, row.manifest);
  const manifestPhysicalPath = await realpath(manifestPath);
  assert.ok(manifestPhysicalPath.startsWith(`${root}/`));
  const episodePhysicalRoot = path.dirname(manifestPhysicalPath);
  const bytes = await readFile(manifestPath);
  assert.equal(hash(bytes), row.manifest_sha256);
  const m = JSON.parse(bytes);
  validateRow(row, m, registry);
  if (!selections.has(row.evidence_snapshot)) selections.set(row.evidence_snapshot, await read(row.evidence_snapshot));
  const selection = selections.get(row.evidence_snapshot);
  assert.equal(selection.schema_version, "benchmark2027.robodojo_raw_capture_selection.v1");
  const selected = selection.selected.filter((s) => s.episode_id === row.episode_id);
  assert.equal(selected.length, 1); assert.equal(selected[0].manifest_sha256, row.manifest_sha256);
  assert.equal(selected[0].checks.task_success, true);
  assert.ok(selected[0].checks.official_reward >= .999);
  if (row.failure_type !== "clean") assert.equal(selected[0].failure_semantics_checks.passed, true);
  if (DOCUMENT_OOD_CONDITIONS.includes(row.ood_condition)) {
    const evidence = row.document_ood_evidence;
    assert.ok(evidence.validator_path.startsWith("/mnt/gyc_ckp/benchmark2027/migration/"));
    const validatorBytes = await readFile(evidence.validator_path);
    assert.equal(hash(validatorBytes), evidence.validator_sha256);
    const validator = JSON.parse(validatorBytes);
    assert.equal(validator.passed, true);
    assert.deepEqual(validator.errors, []);
    assert.equal(validator.task_name, row.task_name);
    const section = row.task_name === "insert_key" ? validator.closed_stream_audit : validator.details;
    const originalSelection = row.task_name === "insert_key" ? section.ood_validation.selection : section.selection;
    assert.deepEqual(selection, originalSelection, "document selection differs from original strict validator");
    assert.equal(selection.raw_target_met, true);
    assert.deepEqual(selection.pending_human_review, []);
    assert.equal(section.ood_validation.passed, true);
    assert.equal(section.ood_validation.condition, row.ood_condition);
    assert.equal(section.ood_validation.base_id, m.ood.base_id);
  }
  const media = [];
  for (const camera of CAMERAS) {
    const ref = m.artifacts.videos[camera];
    const file = path.join(root, row.videos[camera]);
    const physical = await realpath(file);
    assert.ok(physical.startsWith(`${episodePhysicalRoot}/`));
    assert.equal((await stat(file)).size, ref.byte_size);
    assert.equal(await hashFile(file), ref.sha256);
    const s = ref.semantics;
    media.push({ camera, sha256: ref.sha256, bytes: ref.byte_size, frames: s.frame_count,
      fps: s.fps, duration: s.duration_seconds, url: `/api/curated-media?file=${ref.sha256}.mp4` });
    const value = { relativePath: row.videos[camera], bytes: ref.byte_size };
    assert.ok(!mediaIndex[ref.sha256] || mediaIndex[ref.sha256].bytes === value.bytes);
    mediaIndex[ref.sha256] = value;
  }
  const gt = m.failure_recovery_gt;
  const frames = gt?.boundary_frames ?? {};
  const marks = [];
  for (const [key, label] of [["failure_start", "故障开始"], ["recovery_start", "恢复开始"]]) {
    const frame = frames[key] ?? frames[`${key}:${row.failure_type}`];
    if (Number.isSafeInteger(frame) && frame >= 0 && frame < media[0].frames) {
      marks.push({ label, frame, seconds: frame / media[0].fps });
    }
  }
  const episode = { id: row.episode_id, index: row.episode_index, seed: row.scene_seed,
    type: row.failure_type, oodCondition: row.ood_condition ?? null,
    manifestSha256: row.manifest_sha256, instruction: m.instruction ?? "",
    manifest: row.manifest, sourceCommit: m.pipeline_source?.commit ?? null, media, marks };
  if (!groups.has(row.task_name)) groups.set(row.task_name, []);
  groups.get(row.task_name).push(episode);
}
const tasks = [];
const missingMetadata = [];
async function publish(file, document) {
  const content = JSON.stringify(document) + "\n";
  if (check) assert.equal(await readFile(file, "utf8"), content, `outdated bundle: ${file}`);
  else { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
}
// Tasks with an explicit priority (curated-task-metadata.json) lead, in that order;
// every other task follows alphabetically.
const priority = (id) => taskMetadata[id]?.priority ?? Number.POSITIVE_INFINITY;
for (const [id, episodes] of [...groups].sort(([a], [b]) => (priority(a) - priority(b)) || a.localeCompare(b))) {
  episodes.sort((a, b) =>
    (a.oodCondition ?? "").localeCompare(b.oodCondition ?? "") ||
    a.type.localeCompare(b.type) || a.index - b.index);
  const chunk = validateChunk({ schemaVersion: "unibench.curated-task.v1", taskId: id, catalogSha256, episodes });
  const digest = hash(JSON.stringify(chunk) + "\n");
  const dataUrl = `/curated-data/${id}-${digest.slice(0, 16)}.json`;
  await publish(path.join("public", dataUrl), chunk);
  const metadata = taskMetadata[id] ?? { tags: [], instructionZh: "" };
  if (!taskMetadata[id]) missingMetadata.push(id);
  tasks.push({ id, name: id.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    tags: metadata.tags, instruction: episodes[0]?.instruction ?? "", instructionZh: metadata.instructionZh,
    count: episodes.length,
    clean: episodes.filter((e) => e.type === "clean" && !e.oodCondition).length,
    recovery: episodes.filter((e) => e.type !== "clean").length,
    ood: episodes.filter((e) => e.oodCondition).length,
    oodConditions: [...new Set(episodes.filter((e) => e.oodCondition).map((e) => e.oodCondition))].sort(),
    dataUrl, sha256: digest });
}
assert.equal(hash(await readFile(path.join(ROOT, "catalog.json"))), catalogSha256, "catalog changed during export");
await publish("app/data/generated/curated-dataset.json", {
  schemaVersion: "unibench.curated-dataset.v1", catalogSha256, version: `curated-${catalogSha256.slice(0, 8)}`,
  episodeCount: seen.size, mediaCount: catalog.episodes.length * 3, tasks,
});
await publish("app/data/generated/curated-media.json", mediaIndex);
console.log(`Curated dataset ${check ? "verified" : "exported"}: ${tasks.length} tasks, ${seen.size} episodes, ${catalog.episodes.length * 3} videos`);
if (missingMetadata.length) {
  // Not fatal: the episodes are published either way. But a task with no tags
  // cannot be reached from the capability filters, so say so loudly.
  console.warn(`\nWARNING: no entry in scripts/curated-task-metadata.json for: ${missingMetadata.join(", ")}`);
  console.warn("Those tasks publish with no capability tags and no Chinese instruction.");
  console.warn('Add {"tags": ["G"], "instructionZh": "..."} for each, then export again.\n');
}
