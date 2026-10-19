import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const catalog = read("../app/data/generated/video-renditions.json");
const sourceIndexes = [
  read("../app/data/generated/curated-media.json"),
  read("../app/data/generated/ood-media.json"),
  read("../app/data/generated/review-media.json"),
];

test("compressed playback catalog covers every Review and Datasets video", () => {
  const sources = new Map();
  for (const index of sourceIndexes) {
    for (const [sha256, reference] of Object.entries(index)) {
      if (sources.has(sha256)) assert.equal(sources.get(sha256), reference.bytes);
      else sources.set(sha256, reference.bytes);
    }
  }
  assert.equal(catalog.profile.id, "web-360p-v1");
  assert.equal(catalog.profile.maxHeight, 360);
  assert.equal(catalog.profile.maxFps, 25);
  assert.equal(catalog.sourceCount, sources.size);
  assert.deepEqual(Object.keys(catalog.items), [...sources.keys()].sort());
  for (const [sourceSha256, sourceBytes] of sources) {
    const rendition = catalog.items[sourceSha256];
    assert.equal(rendition.sourceBytes, sourceBytes);
    assert.equal(rendition.relativePath, `${catalog.profile.id}/${sourceSha256}.mp4`);
    assert.match(rendition.sha256, /^[a-f0-9]{64}$/);
    assert.ok(rendition.bytes > 0);
    assert.ok(rendition.height <= 360);
    assert.ok(rendition.fps <= 25.01);
  }
});
