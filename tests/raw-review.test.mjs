import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRawReviewReader } from "../app/data/raw-review.server.ts";

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "raw-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, reader: createRawReviewReader({ root, refreshMs: 0, ...options }) };
}
async function sample(root, relative, extra = {}) {
  const dir = path.join(root, relative); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "episode_manifest.json"), JSON.stringify({ episode_id: "original:" + relative,
    task_name: relative.split("/")[0], scene_seed: 19, instruction: "Keep exact input", ...extra }));
  for (const camera of ["cam_head", "cam_left_wrist", "cam_right_wrist"])
    await writeFile(path.join(dir, `${camera}.mp4`), "0123456789");
  return dir;
}
const request = (url, headers = {}) => new Request("http://localhost" + url, { headers });

test("discovers every task/folder and 100 distinct episodes without inferring acceptance", async t => {
  const { root, reader } = await fixture(t);
  await mkdir(path.join(root, "empty/id"), { recursive: true });
  for (let i = 0; i < 100; i++) await sample(root, `task/clean/batch/episode_${i}`);
  const catalog = await reader.catalog();
  assert.equal(catalog.count, 100); assert.equal(catalog.tasks.length, 2);
  assert.equal(catalog.tasks.find(row => row.name === "empty").count, 0);
  const task = catalog.tasks.find(row => row.name === "task");
  assert.equal(task.folders[0].path, "clean/batch");
  const rows = await reader.task(task.id); assert.equal(new Set(rows.entries.map(row => row.id)).size, 100);
  const ep = await reader.episode(rows.entries[0].id);
  assert.equal(ep.media.length, 3); assert.equal(ep.seed, 19); assert.equal(ep.strongFidelity, null);
  assert.equal(ep.identityKind, "manifest"); assert.ok(!("accepted" in ep));
  assert.ok(!JSON.stringify({ catalog, rows, ep }).includes(root));
  assert.equal(await reader.task("bogus"), null); assert.equal(await reader.episode("bogus"), null);
});

test("refresh finds added/removed samples, stable IDs survive refresh, metadata replacement changes review identity", async t => {
  const { root, reader } = await fixture(t);
  const dir = await sample(root, "task/id/episode_1");
  const first = await reader.catalog(); const task = first.tasks[0];
  const id = (await reader.task(task.id)).entries[0].id;
  const original = await reader.episode(id);
  await sample(root, "task/ood/visual/episode_2");
  assert.equal((await reader.catalog()).count, 2);
  assert.equal((await reader.task(task.id)).entries[0].id, id);
  await writeFile(path.join(dir, "episode_manifest.json"), JSON.stringify({ scene_seed: 20 }));
  assert.notEqual((await reader.episode(id)).manifestSha256, original.manifestSha256);
  await rm(dir, { recursive: true });
  assert.equal((await reader.catalog()).count, 1); assert.equal(await reader.episode(id), null);
});

test("official SOURCE metadata and incomplete data remain visible; missing seeds remain null", async t => {
  const { root, reader } = await fixture(t);
  const dir = path.join(root, "official/clean_official/episode_0"); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SOURCE.json"), JSON.stringify({ episode_id: "original", source_provenance: { instruction: "Official instruction" },
    videos: { cam_head: { probe: { duration: "5.2" } } } }));
  await writeFile(path.join(dir, "cam_head.mp4"), "hello");
  const catalog = await reader.catalog(); const entries = await reader.task(catalog.tasks[0].id);
  const ep = await reader.episode(entries.entries[0].id);
  assert.equal(ep.identityKind, "source"); assert.equal(ep.seed, null); assert.equal(ep.instruction, "Official instruction");
  assert.equal(ep.media[0].duration, 5.2); assert.match(ep.warnings.join(" "), /1\/3/);
  await writeFile(path.join(dir, "episode_manifest.json"), "broken");
  assert.match((await reader.episode(ep.id)).warnings.join(" "), /无法解析/);
});

test("opaque media supports range, suffix and HEAD; changed files fail closed", async t => {
  const { root, reader } = await fixture(t);
  const dir = await sample(root, "task/id/episode_1");
  const c = await reader.catalog(); const e = await reader.task(c.tasks[0].id); const ep = await reader.episode(e.entries[0].id);
  const url = ep.media[0].url;
  let response = await reader.serveMedia(request(url, { range: "bytes=2-5" }));
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
  response = await reader.serveMedia(request(url, { range: "bytes=-3" })); assert.equal(await response.text(), "789");
  response = await reader.serveMedia(request(url), true); assert.equal(response.status, 200); assert.equal(response.body, null);
  response = await reader.serveMedia(request(url, { range: "bytes=99-" })); assert.equal(response.status, 416);
  await writeFile(path.join(dir, "cam_head.mp4"), "replacement");
  assert.equal((await reader.serveMedia(request(url))).status, 410);
  assert.equal((await reader.serveMedia(request("/api/raw-review-media?id=../../secret"))).status, 404);
});

test("rejects symlink escapes, cycles, invalid JSON and arbitrary paths", async t => {
  const { root, reader } = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), "raw-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await sample(outside, "secret/id/episode_0");
  await mkdir(path.join(root, "task/id"), { recursive: true });
  await symlink(outside, path.join(root, "task/id/escape"));
  await symlink(root, path.join(root, "task/id/cycle"));
  const catalog = await reader.catalog(); assert.equal(catalog.count, 0); assert.ok(catalog.warnings.length >= 2);
  await sample(root, "task/id/episode_1");
  const ep = await reader.episode((await reader.task(catalog.tasks[0].id)).entries[0].id);
  await rm(path.join(root, "task/id/episode_1/cam_head.mp4"));
  await symlink(path.join(outside, "secret/id/episode_0/cam_head.mp4"), path.join(root, "task/id/episode_1/cam_head.mp4"));
  const after = await reader.episode(ep.id); assert.equal(after.media.length, 2); assert.match(after.warnings.join(" "), /允许范围/);
});

test("approved physical source links work; loss of root is explicit failure", async t => {
  const source = await mkdtemp(path.join(tmpdir(), "approved-raw-")); t.after(() => rm(source, { recursive: true, force: true }));
  const { root } = await fixture(t);
  const reader = createRawReviewReader({ root, approvedRoots: [root, source], refreshMs: 0 });
  await sample(source, "task/id/episode_0"); await mkdir(path.join(root, "task/id"), { recursive: true });
  await symlink(path.join(source, "task/id/episode_0"), path.join(root, "task/id/episode_0"));
  assert.equal((await reader.catalog()).count, 1);
  await rm(root, { recursive: true }); await assert.rejects(reader.catalog());
});

test("video hashes are checked against metadata and changed bytes do not borrow receipts or review identity", async t => {
  const { root, reader } = await fixture(t);
  const dir = await sample(root, "task/id/episode_1");
  const c = await reader.catalog(); const rows = await reader.task(c.tasks[0].id);
  const first = await reader.episode(rows.entries[0].id);
  await writeFile(path.join(dir, "cam_head.mp4"), "abcdefghij");
  const second = await reader.episode(first.id);
  assert.notEqual(first.reviewVersion, second.reviewVersion);
  assert.notEqual(first.media[0].contentSha256, second.media[0].contentSha256);
  await writeFile(path.join(dir, "episode_manifest.json"), JSON.stringify({
    artifacts: { videos: { cam_head: { sha256: "0".repeat(64), byte_size: 10 } } },
  }));
  const rejected = await reader.episode(first.id);
  assert.equal(rejected.media.length, 2); assert.match(rejected.warnings.join(" "), /摘要/);
});

test("API rejects path parameters and unknown/duplicate IDs", async () => {
  const { GET } = await import("../app/api/raw-review/route.ts");
  for (const query of ["?path=/etc/passwd", "?task=../private", "?episode=x", "?refresh=anything", "?refresh=1&refresh=1", `?refresh=1&task=${"1".repeat(64)}`, `?task=${"1".repeat(64)}&task=${"2".repeat(64)}`, `?task=${"1".repeat(64)}&episode=${"2".repeat(64)}`]) {
    const response = await GET(request("/api/raw-review" + query));
    assert.equal(response.status, 400);
  }
});

test("manual refresh bypasses the TTL and publishes one snapshot to both consumers", async t => {
  const { root, reader } = await fixture(t, { refreshMs: 60000 });
  const first = await sample(root, "task/id/episode_1");
  const before = await reader.catalog();
  await sample(root, "new_task/new_category/new_batch/episode_2");
  assert.equal((await reader.catalog()).count, 1, "ordinary reads reuse the shared cache");
  const [datasets, review] = await Promise.all([reader.catalog(true), reader.catalog(true)]);
  assert.equal(datasets, review, "concurrent refreshes join one scan");
  assert.equal(datasets.count, 2);
  assert.notEqual(datasets.version, before.version);
  const added = datasets.tasks.find(row => row.name === "new_task");
  assert.equal(added.folders[0].path, "new_category/new_batch");
  assert.equal((await reader.task(added.id)).version, datasets.version);
  await rm(first, { recursive: true });
  assert.equal((await reader.catalog(true)).count, 1);
});

test("mount aliases resolve approved roots physically without allowing unrelated targets", async t => {
  const base = await mkdtemp(path.join(tmpdir(), "raw-mount-alias-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const physical = path.join(base, "physical");
  const source = path.join(base, "sources");
  const alias = path.join(base, "public_ckp");
  const sourceAlias = path.join(base, "staging");
  await sample(physical, "raw/local/id/episode_0");
  const sourceEpisode = await sample(source, "linked/id/episode_1");
  await symlink(physical, alias);
  await symlink(source, sourceAlias);
  await mkdir(path.join(physical, "raw/linked/id"), { recursive: true });
  await symlink(sourceEpisode, path.join(physical, "raw/linked/id/episode_1"));
  await mkdir(path.join(base, "private/episode_secret"), { recursive: true });
  await symlink(path.join(base, "private"), path.join(physical, "raw/escape"));
  const reader = createRawReviewReader({ root: path.join(alias, "raw"), approvedRoots: [alias, sourceAlias] });
  const catalog = await reader.catalog();
  assert.equal(catalog.count, 2);
  assert.ok(catalog.warnings.some(warning => warning.includes("escape")));
  const task = catalog.tasks.find(row => row.name === "linked");
  const episode = await reader.episode((await reader.task(task.id)).entries[0].id);
  assert.equal(episode.media.length, 3);
  const response = await reader.serveMedia(request(episode.media[0].url, { range: "bytes=0-2" }));
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "012");
});
