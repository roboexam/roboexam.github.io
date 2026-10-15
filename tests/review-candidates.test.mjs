import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const index = read("../app/data/generated/review-candidates.json");
const media = read("../app/data/generated/review-media.json");

test("strict-clean review chunks and media allowlist agree", () => {
  assert.equal(index.schemaVersion, "unibench.review-candidates.v1");
  assert.equal(index.reviewStatus, "pending_human_video_review");
  assert.equal(index.admissionStatus, "not_authorized_not_admitted");
  assert.match(index.candidateInventorySha256, /^[a-f0-9]{64}$/);

  const ids = new Set();
  let candidates = 0;
  let videos = 0;
  for (const task of index.tasks) {
    const bytes = readFileSync(new URL(`../public${task.dataUrl}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), task.sha256);
    const chunk = JSON.parse(bytes);
    assert.equal(chunk.schemaVersion, "unibench.review-candidate-task.v1");
    assert.equal(chunk.snapshotId, index.snapshotId);
    assert.equal(chunk.taskId, task.id);
    assert.equal(chunk.reviewStatus, "pending_human_video_review");
    assert.equal(chunk.admissionStatus, "not_authorized_not_admitted");
    assert.equal(chunk.episodes.length, task.count);
    for (const episode of chunk.episodes) {
      assert.ok(!ids.has(episode.id), `duplicate episode: ${episode.id}`);
      ids.add(episode.id);
      assert.equal(episode.reviewStatus, "pending_human_video_review");
      assert.equal(episode.media.length, 3);
      for (const item of episode.media) {
        assert.match(item.url, new RegExp(
          `^/api/review-media\\?file=${item.sha256}\\.mp4$`,
        ));
        assert.equal(media[item.sha256].bytes, item.bytes);
        assert.ok(!media[item.sha256].relativePath.startsWith("/"));
        assert.ok(!media[item.sha256].relativePath.split("/").includes(".."));
        videos += 1;
      }
      candidates += 1;
    }
  }
  assert.equal(candidates, index.candidateCount);
  assert.equal(ids.size, index.candidateCount);
  assert.equal(videos, index.mediaCount);
  assert.equal(Object.keys(media).length, index.mediaCount);
});
