import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRealDatasetReader } from "../app/data/real-datasets.server.ts";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const request = (query = "", headers = {}) => new Request("http://localhost/api/real-datasets-media" + query, { headers });
const videoKey = "observation.images.camera_0";
const chunkKey = "camera_observations.color_images.camera_head";
const trace = input => ({
  schemaVersion: "roboexam.action-trace.v1", episodeId: input.episodeId,
  clock: { dataset: "episode_relative_video_pts", unit: "seconds", sourceFrames: input.sourceFrames, samples: 2 },
  t: [0, 1], jointPosition: { unit: "rad", left: [[0,1,2,3,4,5],[1,2,3,4,5,6]], right: null },
  endEffectorPosition: { unit: "m", frame: "source", left: [[0,1,2],[1,2,3]], right: null },
  action: { unit: "joint command", labels: ["J1"], left: [[0], [1]], right: null },
  provenance: { manifestSha256: input.manifestSha256, trajectorySha256: null,
    bindingSha256: input.bindingSha256, datasets: ["action"], bindingMethod: "real_parquet_identity" },
});

async function dataset(root, name, format, count = 2) {
  const directory = path.join(root, name);
  await mkdir(path.join(directory, "meta"), { recursive: true });
  const key = format === "v3.0" ? chunkKey : videoKey;
  await writeFile(path.join(directory, "meta/info.json"), JSON.stringify({
    codebase_version: format, robot_type: format === "v3.0" ? "dual_arm" : "pico_ego",
    total_episodes: count, total_frames: count * 30, total_tasks: 1, fps: 30, chunks_size: 1000,
    data_path: format === "v3.0" ? "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet" : "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
    video_path: format === "v3.0" ? "videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4" : "videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4",
    features: { [key]: { dtype: "video", shape: [720, 1280, 3], info: { "video.fps": 30 } } },
  }));
  return directory;
}

async function media(directory, relative, value = "0123456789") {
  const target = path.join(directory, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "real-datasets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const robotRoot = path.join(root, "robot");
  const egoRoot = path.join(root, "ego");
  await Promise.all([mkdir(robotRoot), mkdir(egoRoot)]);
  const v3 = await dataset(robotRoot, "robot_task/success/lerobot_RoboMIND", "v3.0");
  const v2 = await dataset(egoRoot, "pico_task/delivery", "v2.1");
  const v3File = await media(v3, `videos/${chunkKey}/chunk-000/file-000.mp4`);
  const v3Data = await media(v3, "data/chunk-000/file-000.parquet", "robot-trace");
  await media(v2, `videos/chunk-000/${videoKey}/episode_000000.mp4`);
  await media(v2, `videos/chunk-000/${videoKey}/episode_000001.mp4`);
  await media(v2, "data/chunk-000/episode_000000.parquet", "ego-trace-0");
  await media(v2, "data/chunk-000/episode_000001.parquet", "ego-trace-1");
  const rows = new Map([
    [v3, [
      { episode_index: 0, length: 30, tasks: ["Place the red cup"], platform_episode_id: "robot-0",
        "data/chunk_index": 0, "data/file_index": 0, dataset_from_index: 0, dataset_to_index: 30,
        [`videos/${chunkKey}/chunk_index`]: 0, [`videos/${chunkKey}/file_index`]: 0,
        [`videos/${chunkKey}/from_timestamp`]: 12.5, [`videos/${chunkKey}/to_timestamp`]: 13.5 },
      { episode_index: 1, length: 30, tasks: ["Place the blue cup"], platform_episode_id: "robot-1",
        "data/chunk_index": 0, "data/file_index": 0, dataset_from_index: 30, dataset_to_index: 60,
        [`videos/${chunkKey}/chunk_index`]: 0, [`videos/${chunkKey}/file_index`]: 0,
        [`videos/${chunkKey}/from_timestamp`]: 13.5, [`videos/${chunkKey}/to_timestamp`]: 14.5 },
    ]],
    [v2, [
      { episode_index: 0, length: 30, tasks: ["Pico hand manipulation"], platform_episode_id: "ego-0" },
      { episode_index: 1, length: 30, tasks: ["Pico hand manipulation"], platform_episode_id: "ego-1" },
    ]],
  ]);
  const reader = createRealDatasetReader({
    roots: [{ id: "robot", kind: "robot", root: robotRoot }, { id: "ego", kind: "ego", root: egoRoot }],
    refreshMs: 0,
    readMetadata: async source => {
      const directory = typeof source === "string" ? source : path.dirname(source.metadataDir);
      return { rows: rows.get(directory) ?? [], metadataSha256: hash(rows.get(directory) ?? []) };
    },
    ...options,
  });
  return { root, robotRoot, egoRoot, v3, v2, v3File, v3Data, rows, reader };
}

test("discovers both data formats with stable opaque identities and no absolute source paths", async t => {
  const { reader, root } = await fixture(t);
  const catalog = await reader.catalog();
  assert.equal(catalog.schemaVersion, "roboexam.real-datasets.v1");
  assert.equal(catalog.datasets.length, 2);
  assert.equal(catalog.datasets.reduce((sum, row) => sum + row.episodeCount, 0), 4);
  assert.deepEqual(new Set(catalog.datasets.map(row => row.kind)), new Set(["robot", "ego"]));
  for (const item of catalog.datasets) {
    assert.match(item.id, /^[a-f0-9]{64}$/);
    assert.equal(item.availability, "available");
    assert.equal(item.cameras.length, 1);
    assert.equal(item.fps, 30);
    const data = await reader.dataset(item.id);
    assert.equal(data.episodes.length, 2);
    assert.equal(new Set(data.episodes.map(row => row.id)).size, 2);
    assert.ok(data.episodes.every(row => /^[a-f0-9]{64}$/.test(row.id)));
    assert.ok(!JSON.stringify(data).includes(root));
  }
  assert.ok(!JSON.stringify(catalog).includes(root));
  assert.deepEqual((await reader.catalog(true)).datasets.map(row => row.id), catalog.datasets.map(row => row.id));
  assert.equal(await reader.dataset("../private"), null);
  assert.equal(await reader.episode("unknown"), null);
});

test("v3 episodes preserve exact chunk windows and keep adjacent episodes distinct", async t => {
  const { reader } = await fixture(t);
  const summary = (await reader.catalog()).datasets.find(row => row.kind === "robot");
  const entries = await reader.dataset(summary.id);
  const first = await reader.episode(entries.episodes[0].id);
  const second = await reader.episode(entries.episodes[1].id);
  assert.equal(first.datasetId, summary.id);
  assert.equal(first.originalEpisodeId, "robot-0");
  assert.equal(first.instruction, "Place the red cup");
  assert.equal(first.frames, 30);
  assert.equal(first.durationSeconds, 1);
  assert.equal(first.media.length, 1);
  assert.equal(first.media[0].startSeconds, 12.5);
  assert.equal(first.media[0].endSeconds, 13.5);
  assert.equal(first.media[0].durationSeconds, 1);
  assert.equal(second.media[0].startSeconds, 13.5);
  assert.equal(second.media[0].endSeconds, 14.5);
  assert.match(first.media[0].url, /^\/api\/real-datasets-media\?id=[a-f0-9]{64}$/);
  assert.notEqual(first.id, second.id);
  assert.match(first.metadataSha256, /^[a-f0-9]{64}$/);
});

test("v2 episodes use their own file with a zero-based duration window", async t => {
  const { reader } = await fixture(t);
  const summary = (await reader.catalog()).datasets.find(row => row.kind === "ego");
  const entries = await reader.dataset(summary.id);
  const first = await reader.episode(entries.episodes[0].id);
  const second = await reader.episode(entries.episodes[1].id);
  assert.equal(first.originalEpisodeId, "ego-0");
  assert.equal(first.media[0].startSeconds, 0);
  assert.equal(first.media[0].endSeconds, 1);
  assert.equal(first.media[0].durationSeconds, 1);
  assert.notEqual(first.media[0].id, second.media[0].id);
});

test("real action traces use opaque source-bound IDs, coalesce reads and reject changed files", async t => {
  let calls = 0;
  const f = await fixture(t, { traceExtractor: async (fd, input) => {
    assert.ok(fd >= 0); calls++; return { status: "available", trace: trace(input) };
  } });
  const summary = (await f.reader.catalog()).datasets.find(row => row.kind === "robot");
  const entries = await f.reader.dataset(summary.id);
  const episode = await f.reader.episode(entries.episodes[0].id);
  assert.match(episode.trace.url, /^\/api\/real-datasets-trace\?id=[a-f0-9]{64}$/);
  const id = new URL("http://localhost" + episode.trace.url).searchParams.get("id");
  const results = await Promise.all([f.reader.actionTrace(id), f.reader.actionTrace(id)]);
  assert.equal(results[0].status, "available");
  assert.equal(results[0].trace.episodeId, episode.id);
  assert.equal(results[0].trace.action.left.length, 2);
  assert.equal(calls, 1);
  await writeFile(f.v3Data, "robot-trace-replaced");
  assert.equal((await f.reader.actionTrace(id)).reason, "source_changed");
});

test("real action trace bindings expire when episode metadata changes", async t => {
  const f = await fixture(t, { traceExtractor: async (_fd, input) =>
    ({ status: "available", trace: trace(input) }) });
  const summary = (await f.reader.catalog()).datasets.find(row => row.kind === "robot");
  const entries = await f.reader.dataset(summary.id);
  const episode = await f.reader.episode(entries.episodes[0].id);
  const id = new URL("http://localhost" + episode.trace.url).searchParams.get("id");
  assert.equal((await f.reader.actionTrace(id)).status, "available");
  const rows = f.rows.get(f.v3);
  f.rows.set(f.v3, [{ ...rows[0], tasks: ["Changed instruction"] }, ...rows.slice(1)]);
  await f.reader.catalog(true);
  await f.reader.dataset(summary.id);
  assert.equal((await f.reader.actionTrace(id)).reason, "source_changed");
});

test("allowlisted media supports seeking, suffix ranges and HEAD while rejecting arbitrary IDs", async t => {
  const { reader } = await fixture(t);
  const item = (await reader.catalog()).datasets[0];
  const entries = await reader.dataset(item.id);
  const episode = await reader.episode(entries.episodes[0].id);
  const url = episode.media[0].url;
  let response = await reader.serveMedia(new Request("http://localhost" + url, { headers: { range: "bytes=2-5" } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
  response = await reader.serveMedia(new Request("http://localhost" + url, { headers: { range: "bytes=-3" } }));
  assert.equal(await response.text(), "789");
  response = await reader.serveMedia(new Request("http://localhost" + url), true);
  assert.equal(response.status, 200); assert.equal(response.body, null);
  assert.equal(response.headers.get("content-length"), "10");
  response = await reader.serveMedia(new Request("http://localhost" + url, { headers: { range: "bytes=99-" } }));
  assert.equal(response.status, 416);
  assert.equal((await reader.serveMedia(request("?id=../../etc/passwd"))).status, 404);
  assert.equal((await reader.serveMedia(request("?path=/etc/passwd"))).status, 404);
});

test("dataset discovery and videos cannot escape approved roots through symlinks", async t => {
  const f = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), "real-private-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const secret = await dataset(outside, "secret", "v2.1");
  const secretVideo = await media(secret, "secret.mp4", "private");
  await symlink(secret, path.join(f.egoRoot, "escape"));
  const catalog = await f.reader.catalog(true);
  assert.equal(catalog.datasets.length, 2);
  const summary = catalog.datasets.find(row => row.kind === "robot");
  const entries = await f.reader.dataset(summary.id);
  await rm(f.v3File);
  await symlink(secretVideo, f.v3File);
  const episode = await f.reader.episode(entries.episodes[0].id);
  assert.equal(episode.media.length, 0);
  assert.ok(episode.warnings.length > 0);
  assert.ok(!JSON.stringify({ catalog, episode }).includes(outside));
});

test("metadata info and episode tables cannot escape approved roots through symlinks", async t => {
  const f = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), "real-metadata-private-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const secret = await dataset(outside, "secret", "v2.1");
  await mkdir(path.join(f.egoRoot, "metadata_escape", "delivery", "meta"), { recursive: true });
  await symlink(path.join(secret, "meta", "info.json"), path.join(f.egoRoot, "metadata_escape", "delivery", "meta", "info.json"));
  const catalog = await f.reader.catalog(true);
  assert.equal(catalog.datasets.length, 2, "an info.json outside the root is ignored");

  const outsideEpisodes = path.join(outside, "episodes");
  await mkdir(outsideEpisodes, { recursive: true });
  await writeFile(path.join(outsideEpisodes, "part.parquet"), "private");
  await symlink(outsideEpisodes, path.join(f.v3, "meta", "episodes"));
  const robot = catalog.datasets.find(row => row.kind === "robot");
  await assert.rejects(() => f.reader.dataset(robot.id), /metadata_file_outside_allowlist/);
});

test("unsafe v3 chunk indices and invalid windows do not become playable videos", async t => {
  const f = await fixture(t);
  const summary = (await f.reader.catalog()).datasets.find(row => row.kind === "robot");
  for (const changes of [
    { [`videos/${chunkKey}/chunk_index`]: -1 },
    { [`videos/${chunkKey}/file_index`]: "../../secret" },
    { [`videos/${chunkKey}/from_timestamp`]: -1 },
    { [`videos/${chunkKey}/to_timestamp`]: 12 },
    { [`videos/${chunkKey}/to_timestamp`]: Infinity },
  ]) {
    const original = f.rows.get(f.v3)[0];
    f.rows.set(f.v3, [{ ...original, ...changes }]);
    const entries = await f.reader.dataset(summary.id);
    const episode = await f.reader.episode(entries.episodes[0].id);
    assert.equal(episode.media.length, 0);
    assert.ok(episode.warnings.length > 0);
    f.rows.set(f.v3, [original]);
  }
});

test("catalog API rejects unknown keys, paths, duplicate IDs and conflicting selectors", async () => {
  const { GET } = await import("../app/api/real-datasets/route.ts");
  const id = "a".repeat(64);
  for (const query of [
    "?path=/etc/passwd", "?dataset=../private", "?episode=unknown", "?dataset=", "?episode=",
    `?dataset=${id}&dataset=${id}`, `?episode=${id}&episode=${id}`, `?dataset=${id}&episode=${id}`,
    "?refresh=0", "?refresh=1&refresh=1", `?refresh=1&dataset=${id}`,
  ]) {
    assert.equal((await GET(new Request("http://localhost/api/real-datasets" + query))).status, 400, query);
  }
  const { GET: traceGET } = await import("../app/api/real-datasets-trace/route.ts");
  for (const query of ["?path=/etc/passwd", "?id=..", `?id=${id}&id=${id}`])
    assert.equal((await traceGET(new Request("http://localhost/api/real-datasets-trace" + query))).status, 400, query);
  assert.equal((await traceGET(new Request("http://localhost/api/real-datasets-trace?id=" + id))).status, 404);
});
