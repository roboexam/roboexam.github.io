import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { lstat, mkdtemp, mkdir, open, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { serveT1BenchmarkMedia, t1BenchmarkMediaRoot } from "../app/data/t1-benchmark-media.server.ts";
import { MEDIA_SCHEMA, RESULT_VERSION, SOURCE_RUN, publishMedia as publishWithSelection, validateMediaManifest } from "../scripts/publish-t1-benchmark-media.mjs";
import { t1BenchmarkRegistry } from "../scripts/t1-benchmark-result-registry.mjs";

const bytes = Buffer.from("0123456789");
const digest = createHash("sha256").update(bytes).digest("hex");
const sampleId = `${RESULT_VERSION}-deepseek-insert_key-layout100000`;
const catalog = [{ id: sampleId, bytes: bytes.length, sha256: digest }];
let temporary, root;
before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "t1-benchmark-media-"));
  root = path.join(temporary, "media");
  await mkdir(root);
  await writeFile(path.join(root, `${sampleId}.mp4`), bytes);
});
after(async () => { await rm(temporary, { recursive: true, force: true }); });
const request = (headers = {}) => new Request(`http://localhost/api/t1-benchmark-media/${sampleId}`, { headers });

test("new benchmark media root is isolated from the existing stack-bowls media", () => {
  assert.equal(t1BenchmarkMediaRoot({}, "/workspace/dashboard"), "/workspace/dashboard/.local/t1-benchmark/media");
  assert.equal(t1BenchmarkMediaRoot({ T1_BENCHMARK_MEDIA_ROOT: "/publication/native" }), "/publication/native");
});

test("benchmark GET/HEAD preserve immutable exact bytes and SHA ETag", async () => {
  const response = await serveT1BenchmarkMedia(request(), sampleId, catalog, root);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("etag"), `"${digest}"`);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  const head = await serveT1BenchmarkMedia(request(), sampleId, catalog, root, true);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test("benchmark playback seeking, suffixes, ETag and If-Range work", async () => {
  for (const [range, content, expected] of [["bytes=1-4", "1234", "bytes 1-4/10"], ["bytes=-2", "89", "bytes 8-9/10"], ["bytes=8-", "89", "bytes 8-9/10"]]) {
    const response = await serveT1BenchmarkMedia(request({ range }), sampleId, catalog, root);
    assert.equal(response.status, 206);
    assert.equal(await response.text(), content);
    assert.equal(response.headers.get("content-range"), expected);
  }
  const unchanged = await serveT1BenchmarkMedia(request({ "if-none-match": `"${digest}"` }), sampleId, catalog, root);
  assert.equal(unchanged.status, 304);
  const changed = await serveT1BenchmarkMedia(request({ range: "bytes=1-2", "if-range": '"other"' }), sampleId, catalog, root);
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), bytes.toString());
  for (const range of ["bytes=10-", "bytes=3-2", "bytes=0-1,4-5"]) {
    const invalid = await serveT1BenchmarkMedia(request({ range }), sampleId, catalog, root);
    assert.equal(invalid.status, 416);
  }
});

test("unknown/bad IDs, missing files, duplicate catalog and wrong-size media fail closed", async () => {
  for (const id of ["../secret", "/etc/passwd", "%2e%2e", "missing", ".", "..", sampleId + "/extra"]) {
    assert.equal((await serveT1BenchmarkMedia(request(), id, catalog, root)).status, 404);
  }
  assert.equal((await serveT1BenchmarkMedia(request(), sampleId, [...catalog, ...catalog], root)).status, 404);
  assert.equal((await serveT1BenchmarkMedia(request(), sampleId, [{ ...catalog[0], bytes: 11 }], root)).status, 404);
  assert.equal((await serveT1BenchmarkMedia(request(), sampleId, catalog, path.join(temporary, "absent"))).status, 404);
  assert.equal((await serveT1BenchmarkMedia(request(), sampleId + "-missing", [{ ...catalog[0], id: sampleId + "-missing" }], root)).status, 404);
  const outside = path.join(temporary, "outside.mp4");
  await writeFile(outside, bytes);
  await symlink(outside, path.join(root, "escape.mp4"));
  assert.equal((await serveT1BenchmarkMedia(request(), "escape", [{ ...catalog[0], id: "escape" }], root)).status, 404);
});

function manifest() {
  const taskIds = t1BenchmarkRegistry.tasks.map((task) => task.id);
  return { schema: MEDIA_SCHEMA, resultVersion: RESULT_VERSION, source: { host: "10.40.1.116", port: 5403, user: "root", run: SOURCE_RUN }, selectionSha256: "a".repeat(64), scope: { taskIds, sceneCount: 70 }, episodes: t1BenchmarkRegistry.scenePlans.filter((scene) => taskIds.includes(scene.taskId)).map(({ taskId, layoutId }) => {
    const attempt = "attempt_02";
    const id = `${RESULT_VERSION}-deepseek-${taskId}-layout${layoutId}`;
    return { id, taskId, layoutId, attempt, sourcePath: `${SOURCE_RUN}/episodes/${taskId}/${layoutId}/${attempt}/sim/sensors.mp4`, video: { id, url: `/api/t1-benchmark-media/${id}`, sha256: digest, bytes: bytes.length, frames: 1, fps: 25 } };
  }) };
}

function selectedBytes(value) {
  return Buffer.from(JSON.stringify({ schema: "roboexam.t1-benchmark-selection.v1", source: value.source, scope: value.scope, episodes: value.episodes.map((episode) => ({ id: episode.id, taskId: episode.taskId, layoutId: episode.layoutId, attempt: episode.attempt, sourcePath: episode.sourcePath.replace(/\/sim\/sensors\.mp4$/, "") })) }));
}

function publishMedia(value, options) {
  const selectionBytes = selectedBytes(value);
  const selectedManifest = { ...value, selectionSha256: createHash("sha256").update(selectionBytes).digest("hex") };
  return publishWithSelection(selectedManifest, { ...options, selectionBytes });
}

test("publisher dry run validates all 70 exact scene identities without filesystem writes or fetching", async () => {
  const destination = path.join(temporary, "dry-run-must-not-exist");
  const plan = await publishMedia(manifest(), { root: destination, dryRun: true, fetch: () => assert.fail("dry run cannot fetch") });
  assert.equal(plan.count, 70);
  assert.equal(plan.bytes, 700);
  await assert.rejects(lstat(destination), { code: "ENOENT" });
});

test("publisher copies only allowlisted native files and really hashes every new local copy", async () => {
  const destination = path.join(temporary, "published");
  const value = manifest(); let calls = 0;
  const result = await publishMedia(value, { root: destination, fetch: async (episode, output) => {
    assert.match(episode.sourcePath, /\/sim\/sensors\.mp4$/);
    calls++; await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  } });
  assert.equal(calls, 70);
  assert.equal(result.records.length, 70);
  assert.ok(result.records.every((row) => row.copied));
  assert.equal((await readdir(destination)).length, 70);
  const again = await publishMedia(value, { root: destination, fetch: () => assert.fail("never refetch an already correct local file") });
  assert.ok(again.records.every((row) => !row.copied));
  const victim = path.join(destination, `${value.episodes[0].id}.mp4`);
  await writeFile(victim, Buffer.from("XXXXXXXXXX"));
  await assert.rejects(publishMedia(value, { root: destination, fetch: () => assert.fail("cannot replace mismatched existing media") }), /SHA256 mismatch/);
  assert.equal((await readFile(victim)).toString(), "XXXXXXXXXX");
});

test("failed download cannot publish wrong hash or leave partial files", async () => {
  const destination = path.join(temporary, "bad-hash");
  await assert.rejects(publishMedia(manifest(), { root: destination, fetch: async (episode, output) => writeFile(output, Buffer.from("XXXXXXXXXX")) }), /SHA256 mismatch/);
  assert.deepEqual(await readdir(destination), []);
});

test("publisher rejects arbitrary hosts, traversal, debug/context files and mismatched joins", () => {
  const changes = [
    (value) => { value.source.host = "other"; },
    (value) => { value.episodes[0].sourcePath = "/etc/passwd"; },
    (value) => { value.episodes[0].sourcePath = value.episodes[0].sourcePath.replace("sim/sensors.mp4", "controller/debug_video/debug_rollout.mp4"); },
    (value) => { value.episodes[0].attempt = "../../other"; },
    (value) => { value.episodes[0].id = value.episodes[1].id; },
    (value) => { value.episodes[0].video.id = value.episodes[1].id; },
    (value) => { value.episodes[0].video.url = "file:///private/context.json"; },
    (value) => { value.episodes[0].video.rawContext = "forbidden"; },
    (value) => { value.episodes.pop(); },
    (value) => { value.scope.taskIds[0] = "pour_by_language"; },
  ];
  for (const change of changes) {
    const value = manifest(); change(value);
    assert.throws(() => validateMediaManifest(value));
  }
});

test("publisher binds final attempts to the exact SHA-pinned selection file", async () => {
  const value = manifest(), selectionBytes = selectedBytes(value);
  value.selectionSha256 = createHash("sha256").update(selectionBytes).digest("hex");
  value.episodes[0].attempt = "attempt_01";
  value.episodes[0].sourcePath = value.episodes[0].sourcePath.replace("attempt_02", "attempt_01");
  validateMediaManifest(value); // Still a native path, but the wrong selected attempt.
  await assert.rejects(publishWithSelection(value, { dryRun: true, selectionBytes }), /attempt mismatch/);
  await assert.rejects(publishWithSelection(value, { dryRun: true, selectionBytes: Buffer.from("{}") }), /selection SHA256 mismatch/);
});

test("Vite host bridge serves new and legacy T1 allowlists over HTTP with GET/HEAD/Range and keeps unknown routes isolated", async () => {
  // Bundle the existing TS/JSON route graph in memory, as Vite does. No worker,
  // model, real source media, generated fixture bundle or disk build is started.
  const { build } = await import("esbuild");
  const compiled = await build({ entryPoints: [new URL("../build/local-media-vite-plugin.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "esm", write: false, packages: "external", logLevel: "silent" });
  const { localMedia } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
  const published = JSON.parse(await readFile(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), "utf8"));
  const video = published.episodes.find((episode) => episode.video)?.video;
  assert.ok(video);
  const directory = path.join(temporary, "vite-bridge-fixture");
  await mkdir(directory);
  const fixture = await open(path.join(directory, `${video.id}.mp4`), "wx");
  try { await fixture.truncate(video.bytes); await fixture.write(bytes, 0, bytes.length, 0); } finally { await fixture.close(); }
  const previous = process.env.T1_BENCHMARK_MEDIA_ROOT;
  process.env.T1_BENCHMARK_MEDIA_ROOT = directory;
  const legacyBundle = JSON.parse(await readFile(new URL("../app/data/generated/t1-agent-results.json", import.meta.url), "utf8"));
  const legacyVideos = legacyBundle.episodes.filter((episode) => ["mimo", "kimi", "gpt6-astra"].includes(episode.modelId)).map((episode) => episode.video);
  assert.equal(legacyVideos.length, 15);
  const legacyDirectory = path.join(temporary, "vite-legacy-fixture");
  await mkdir(legacyDirectory);
  for (const legacy of legacyVideos) {
    const fixture = await open(path.join(legacyDirectory, `${legacy.id}.mp4`), "wx");
    try { await fixture.truncate(legacy.bytes); await fixture.write(bytes, 0, bytes.length, 0); } finally { await fixture.close(); }
  }
  const previousLegacy = process.env.DASHBOARD_T1_MEDIA_ROOT;
  process.env.DASHBOARD_T1_MEDIA_ROOT = legacyDirectory;
  let middleware;
  localMedia().configureServer({ middlewares: { use(value) { middleware = value; } } });
  assert.equal(typeof middleware, "function");
  const server = createServer((incoming, outgoing) => middleware(incoming, outgoing, (error) => { outgoing.writeHead(error ? 500 : 418); outgoing.end(); }));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/t1-benchmark-media/${video.id}`;
  try {
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(head.headers.get("content-length"), String(video.bytes));
    const range = await fetch(url, { headers: { range: "bytes=0-3" } });
    assert.equal(range.status, 206); assert.equal(await range.text(), "0123");
    assert.equal(range.headers.get("content-range"), `bytes 0-3/${video.bytes}`);
    assert.equal(range.headers.get("etag"), `"${video.sha256}"`);
    for (const suffix of ["unknown", video.id + "/extra", "%E0%A4%A", "%2e%2e%2fcontext"]) assert.equal((await fetch(`${base}/api/t1-benchmark-media/${suffix}`)).status, 404);
    assert.equal((await fetch(`${base}/api/t1-benchmark-media-other/${video.id}`)).status, 418);
    for (const legacy of legacyVideos) {
      const url = `${base}/api/t1-media/${legacy.id}`;
      const head = await fetch(url, { method: "HEAD" });
      assert.equal(head.status, 200); assert.equal(head.headers.get("content-length"), String(legacy.bytes));
      const range = await fetch(url, { headers: { range: "bytes=0-3" } });
      assert.equal(range.status, 206); assert.equal(await range.text(), "0123");
      assert.equal(range.headers.get("etag"), `"${legacy.sha256}"`);
    }
    for (const suffix of [video.id, "unknown", legacyVideos[0].id + "/extra", "%E0%A4%A", "%2e%2e%2fcontext"]) assert.equal((await fetch(`${base}/api/t1-media/${suffix}`)).status, 404);
    const excludedDeepseek = legacyBundle.episodes.find((episode) => episode.modelId === "deepseek").video.id;
    assert.equal((await fetch(`${base}/api/t1-media/${excludedDeepseek}`)).status, 404);
    assert.equal((await fetch(`${base}/api/t1-media-other/${legacyVideos[0].id}`)).status, 418);
    assert.equal((await fetch(url, { method: "POST" })).status, 418);
  } finally {
    if (previous === undefined) delete process.env.T1_BENCHMARK_MEDIA_ROOT; else process.env.T1_BENCHMARK_MEDIA_ROOT = previous;
    if (previousLegacy === undefined) delete process.env.DASHBOARD_T1_MEDIA_ROOT; else process.env.DASHBOARD_T1_MEDIA_ROOT = previousLegacy;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
