import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { t1BenchmarkRegistry } from "./t1-benchmark-result-registry.mjs";

export const MEDIA_SCHEMA = "roboexam.t1-benchmark-media-publication.v1";
export const SOURCE_RUN = "/bh/zbh_ckp/runs/agentbench/robodojo17-eval5-deepseek-official-flash-high";
export const RESULT_VERSION = t1BenchmarkRegistry.resultVersion;
const SHA256 = /^[a-f0-9]{64}$/;
const TASK = /^[a-z][A-Za-z0-9_]{0,79}$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");

/** A private exact-attempt manifest, never a user-supplied arbitrary file list. */
export function validateMediaManifest(manifest) {
  assert.equal(manifest?.schema, MEDIA_SCHEMA);
  assert.equal(manifest.resultVersion, RESULT_VERSION);
  assert.deepEqual(manifest.source, { host: "10.40.1.116", port: 5403, user: "root", run: SOURCE_RUN });
  assert.match(manifest.selectionSha256, SHA256, "final-attempt selection SHA required");
  assert.equal(manifest.scope?.sceneCount, 70);
  const taskIds = manifest.scope.taskIds;
  assert.ok(Array.isArray(taskIds) && taskIds.length === 14 && new Set(taskIds).size === 14);
  assert.deepEqual([...taskIds].sort(), t1BenchmarkRegistry.tasks.map((task) => task.id).sort(), "approved task scope changed");
  for (const task of taskIds) assert.match(task, TASK);
  assert.ok(!taskIds.includes("pour_by_language"), "excluded task");
  assert.ok(Array.isArray(manifest.episodes) && manifest.episodes.length === 70);
  const ids = new Set(), scenes = new Set(), counts = new Map(taskIds.map((id) => [id, 0]));
  for (const episode of manifest.episodes) {
    assert.ok(counts.has(episode.taskId), "task outside approved scope");
    assert.ok(Number.isSafeInteger(episode.layoutId) && episode.layoutId >= 0);
    assert.match(episode.attempt, /^attempt_[0-9]{2,6}$/);
    const id = `${RESULT_VERSION}-deepseek-${episode.taskId}-layout${episode.layoutId}`;
    assert.equal(episode.id, id);
    assert.equal(ids.has(id), false, "duplicate media identity"); ids.add(id);
    const scene = episode.taskId + ":" + episode.layoutId;
    assert.equal(scenes.has(scene), false, "duplicate scene"); scenes.add(scene);
    assert.equal(episode.sourcePath, `${SOURCE_RUN}/episodes/${episode.taskId}/${episode.layoutId}/${episode.attempt}/sim/sensors.mp4`, "only exact native video path is allowed");
    const video = episode.video;
    assert.ok(video && typeof video === "object", "missing native video");
    assert.deepEqual(Object.keys(video).sort(), ["id", "url", "sha256", "bytes", "frames", "fps"].sort());
    assert.equal(video.id, id);
    assert.equal(video.url, `/api/t1-benchmark-media/${id}`);
    assert.match(video.sha256, SHA256);
    assert.ok(Number.isSafeInteger(video.bytes) && video.bytes > 0);
    assert.ok(video.frames === null || Number.isSafeInteger(video.frames) && video.frames > 0);
    assert.ok(video.fps === null || Number.isFinite(video.fps) && video.fps > 0);
    counts.set(episode.taskId, counts.get(episode.taskId) + 1);
  }
  assert.ok([...counts.values()].every((count) => count === 5), "each approved task must contain exactly five scenes");
  assert.deepEqual([...scenes].sort(), t1BenchmarkRegistry.scenePlans.filter((scene) => taskIds.includes(scene.taskId)).map((scene) => scene.taskId + ":" + scene.layoutId).sort(), "approved scene selection changed");
  return manifest;
}

export function validateMediaSelection(manifest, selectionBytes) {
  assert.ok(Buffer.isBuffer(selectionBytes), "exact selection file bytes required");
  assert.equal(sha(selectionBytes), manifest.selectionSha256, "selection SHA256 mismatch");
  const selection = JSON.parse(selectionBytes.toString("utf8"));
  assert.equal(selection.schema, "roboexam.t1-benchmark-selection.v1");
  assert.deepEqual(selection.source, manifest.source);
  assert.deepEqual(selection.scope, manifest.scope);
  assert.ok(Array.isArray(selection.episodes) && selection.episodes.length === 70);
  const selected = new Map();
  for (const episode of selection.episodes) {
    assert.equal(selected.has(episode.id), false, "duplicate selected episode");
    selected.set(episode.id, episode);
  }
  for (const episode of manifest.episodes) {
    const expected = selected.get(episode.id);
    assert.ok(expected, "media not in final-attempt selection");
    for (const key of ["id", "taskId", "layoutId", "attempt"]) assert.equal(episode[key], expected[key], "selected episode " + key + " mismatch");
    assert.equal(episode.sourcePath, expected.sourcePath + "/sim/sensors.mp4", "selected attempt source path mismatch");
  }
}

async function verifyCopy(filename, video) {
  const before = await lstat(filename);
  assert.ok(before.isFile() && !before.isSymbolicLink(), "media must be a regular file");
  assert.equal(before.size, video.bytes, "media size mismatch");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) { hash.update(chunk); bytes += chunk.length; }
  assert.equal(bytes, video.bytes, "media changed during hashing");
  assert.equal(hash.digest("hex"), video.sha256, "media SHA256 mismatch");
  const after = await lstat(filename);
  assert.ok(after.isFile() && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, "media identity changed during verification");
  return { id: video.id, sha256: video.sha256, bytes, physicalPath: await realpath(filename) };
}

/** SSH only reads the single allowlisted MP4; it never starts Python or a simulator. */
export async function fetchRemoteMedia(episode, temporary) {
  const source = episode.sourcePath;
  // validateMediaManifest has ruled out quotes, traversal and arbitrary source files.
  const command = `cat -- '${source}'`;
  const child = spawn("ssh", ["-p", "5403", "root@10.40.1.116", command], { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume(); // Provider environments and SSH diagnostics never enter publication output.
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("allowlisted media read failed (SSH exit " + code + ")")));
  });
  try {
    await Promise.all([pipeline(child.stdout, createWriteStream(temporary, { flags: "wx", mode: 0o600 })), exited]);
  } catch (error) {
    child.kill();
    throw error;
  }
}

export async function publishMedia(manifest, options = {}) {
  validateMediaManifest(manifest);
  validateMediaSelection(manifest, options.selectionBytes);
  const root = path.resolve(options.root ?? process.env.T1_BENCHMARK_MEDIA_ROOT ?? ".local/t1-benchmark/media");
  const plan = manifest.episodes.map((episode) => ({ id: episode.id, bytes: episode.video.bytes, sha256: episode.video.sha256, destination: path.join(root, `${episode.id}.mp4`) }));
  const summary = { schema: "roboexam.t1-benchmark-media-receipt.v1", selectionSha256: manifest.selectionSha256, manifestSha256: sha(JSON.stringify(manifest)), count: plan.length, bytes: plan.reduce((sum, row) => sum + row.bytes, 0), dryRun: options.dryRun === true };
  if (summary.dryRun) return { ...summary, plan };
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await lstat(root);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink(), "media root must be a real directory");
  const fetched = options.fetch ?? fetchRemoteMedia;
  const records = [];
  for (const episode of manifest.episodes) {
    const filename = path.join(root, `${episode.id}.mp4`);
    try {
      await lstat(filename);
      records.push({ ...await verifyCopy(filename, episode.video), copied: false });
      continue;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = path.join(root, `.${episode.id}.${randomUUID()}.partial`);
    try {
      await fetched(episode, temporary);
      await verifyCopy(temporary, episode.video);
      await link(temporary, filename); // Never replace another file or another publication.
      records.push({ ...await verifyCopy(filename, episode.video), copied: true });
      if (options.onProgress) options.onProgress({ completed: records.length, count: plan.length, id: episode.id });
    } finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
  }
  return { ...summary, records };
}

async function main() {
  const args = process.argv.slice(2);
  let manifestPath, selectionPath, root, receiptPath, dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest") manifestPath = args[++i];
    else if (args[i] === "--selection") selectionPath = args[++i];
    else if (args[i] === "--root") root = args[++i];
    else if (args[i] === "--receipt") receiptPath = args[++i];
    else if (args[i] === "--dry-run") dryRun = true;
    else throw new Error("Usage: node scripts/publish-t1-benchmark-media.mjs --manifest PRIVATE.json [--selection selection.json] [--root DIR] [--receipt NEW.json] [--dry-run]");
  }
  assert.ok(manifestPath, "--manifest required");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const selectionBytes = await readFile(selectionPath ?? path.join(path.dirname(manifestPath), "source/selection.json"));
  const result = await publishMedia(manifest, { root, dryRun, selectionBytes, onProgress: ({ completed, count }) => console.log(`Verified native media ${completed}/${count}`) });
  if (receiptPath && !dryRun) await writeFile(receiptPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ ...result, records: result.records ? { verified: result.records.length, copied: result.records.filter((row) => row.copied).length } : undefined }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error("T1 benchmark media publication failed: " + error.message); process.exitCode = 1; });
}
