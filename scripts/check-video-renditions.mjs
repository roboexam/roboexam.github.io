import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createMediaVerifier } from "./media-integrity.mjs";

const ROOT =
  process.env.UNIBENCH_VIDEO_RENDITION_ROOT ??
  "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-video-renditions/v1";
const CATALOG_PATH = "app/data/generated/video-renditions.json";
const SOURCE_INDEXES = [
  "app/data/generated/curated-media.json",
  "app/data/generated/ood-media.json",
  "app/data/generated/review-media.json",
];
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const catalogBytes = await readFile(CATALOG_PATH);
const catalog = JSON.parse(catalogBytes);
assert.equal(catalog.schemaVersion, "unibench.dashboard-video-renditions.v1");
assert.deepEqual(catalog.profile, {
  id: "web-360p-v1",
  label: "360p",
  maxHeight: 360,
  maxFps: 25,
  codec: "h264",
  crf: 29,
  preset: "veryfast",
  fastStart: true,
});

const sources = new Map();
for (const file of SOURCE_INDEXES) {
  for (const [sourceSha256, reference] of Object.entries(await readJson(file))) {
    assert.match(sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(reference.bytes) && reference.bytes > 0);
    const previous = sources.get(sourceSha256);
    if (previous !== undefined) {
      assert.equal(previous, reference.bytes, `inconsistent source size: ${sourceSha256}`);
    } else {
      sources.set(sourceSha256, reference.bytes);
    }
  }
}

const itemKeys = Object.keys(catalog.items);
assert.equal(catalog.sourceCount, sources.size);
assert.deepEqual(itemKeys, [...sources.keys()].sort());
const root = await realpath(ROOT);
const verifier = await createMediaVerifier("dashboard-video-renditions");
let sourceBytes = 0;
let renditionBytes = 0;
for (const [sourceSha256, sourceSize] of [...sources.entries()].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const item = catalog.items[sourceSha256];
  assert.equal(item.sourceBytes, sourceSize);
  assert.ok(Number.isSafeInteger(item.sourceWidth) && item.sourceWidth > 0);
  assert.ok(Number.isSafeInteger(item.sourceHeight) && item.sourceHeight > 0);
  assert.ok(Number.isFinite(item.sourceFps) && item.sourceFps > 0);
  assert.ok(Number.isFinite(item.sourceDuration) && item.sourceDuration > 0);
  assert.match(item.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0);
  assert.ok(Number.isSafeInteger(item.width) && item.width > 0 && item.width % 2 === 0);
  assert.ok(Number.isSafeInteger(item.height) && item.height > 0);
  assert.ok(item.height <= catalog.profile.maxHeight);
  assert.ok(Number.isFinite(item.fps) && item.fps > 0 && item.fps <= catalog.profile.maxFps + 0.01);
  assert.ok(Number.isFinite(item.duration) && item.duration > 0);
  assert.ok(
    Math.abs(item.duration - item.sourceDuration) <= Math.max(0.25, 2 / item.sourceFps),
    `duration drift: ${sourceSha256}`,
  );
  assert.equal(item.relativePath, `${catalog.profile.id}/${sourceSha256}.mp4`);
  assert.ok(!path.isAbsolute(item.relativePath));
  const physical = await realpath(path.join(root, item.relativePath));
  assert.ok(physical.startsWith(`${root}${path.sep}`));
  const info = await stat(physical);
  assert.ok(info.isFile());
  assert.equal(info.size, item.bytes);
  assert.equal(await verifier.verify(physical, item.sha256, item.bytes), item.sha256);
  sourceBytes += sourceSize;
  renditionBytes += item.bytes;
}
assert.equal(catalog.sourceBytes, sourceBytes);
assert.equal(catalog.renditionBytes, renditionBytes);
await verifier.finish({
  catalogSha256: hash(catalogBytes),
  profileId: catalog.profile.id,
  sourceCount: sources.size,
});
console.log(
  `Video renditions verified: ${sources.size} files, ` +
    `${Math.round(sourceBytes / 1024 / 1024)} MiB source -> ` +
    `${Math.round(renditionBytes / 1024 / 1024)} MiB playback.`,
);
