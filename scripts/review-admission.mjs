import assert from "node:assert/strict";

// Admission preserves immutable manifest hashes. Never hide a candidate merely
// because a catalog contains a similarly named task, seed, or episode.
export function pendingReviewCandidates(candidates, catalog) {
  assert.equal(catalog.schema_version, "benchmark2027.curated_catalog.v2");
  assert.equal(catalog.episode_count, catalog.episodes.length);
  const admitted = new Map();
  for (const episode of catalog.episodes) {
    assert.ok(!admitted.has(episode.episode_id), "duplicate curated episode ID");
    assert.match(episode.manifest_sha256, /^[a-f0-9]{64}$/);
    admitted.set(episode.episode_id, episode);
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    assert.ok(!seen.has(candidate.episode_id), "duplicate review episode ID");
    seen.add(candidate.episode_id);
    const episode = admitted.get(candidate.episode_id);
    if (!episode) return true;
    // Repeated attempts can share an episode ID. A different manifest remains
    // pending and must still pass all original staging/media checks.
    return candidate.manifest_sha256 !== episode.manifest_sha256;
  });
}
