import test from "node:test";
import assert from "node:assert/strict";
import { pendingReviewCandidates } from "../scripts/review-admission.mjs";

const candidate = (id, hash = "a".repeat(64)) => ({
  episode_id: id, manifest_sha256: hash,
});
const catalog = (episodes) => ({
  schema_version: "benchmark2027.curated_catalog.v2",
  episode_count: episodes.length, episodes,
});

test("admission removes only the exact immutable candidate from pending", () => {
  const rows = Array.from({ length: 100 }, (_, i) => candidate(`episode:${i}`));
  assert.deepEqual(pendingReviewCandidates(rows, catalog(rows.slice(0, 73))),
    rows.slice(73));
  assert.deepEqual(pendingReviewCandidates(rows, catalog(rows)), []);
  assert.deepEqual(pendingReviewCandidates(rows, catalog([])), rows);
});

test("identity collisions and malformed catalogs fail closed", () => {
  const row = candidate("episode:1");
  assert.deepEqual(pendingReviewCandidates([row], catalog([
    candidate(row.episode_id, "b".repeat(64)),
  ])), [row]);
  assert.throws(() => pendingReviewCandidates([row, row], catalog([])), /duplicate review/);
  assert.throws(() => pendingReviewCandidates([row], catalog([row, row])), /duplicate curated/);
  assert.throws(() => pendingReviewCandidates([row], {
    ...catalog([row]), episode_count: 0,
  }));
  assert.throws(() => pendingReviewCandidates([row], {
    ...catalog([row]), schema_version: "unknown",
  }));
});
