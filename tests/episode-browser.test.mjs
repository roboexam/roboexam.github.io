import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { datasetEpisodeBundle as index } from '../app/data/dataset-episodes.ts';
import { assertBrowserCohort } from '../app/data/episode-browser.ts';
const load = cohort => JSON.parse(readFileSync(new URL('../public'+cohort.dataUrl,import.meta.url)));

test('restored model browser accepts all fifteen exact published cohorts', () => {
  for (const cohort of index.cohorts) {
    const bytes = readFileSync(new URL('../public'+cohort.dataUrl,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),cohort.episodeDataSha256);
    assert.doesNotThrow(() => assertBrowserCohort(JSON.parse(bytes),cohort));
  }
});
test('browser rejects stale model identity, duplicate episodes, partial cohorts and media traversal', () => {
  const cohort = index.cohorts[0];
  const stale = load(index.cohorts[1]);
  assert.throws(() => assertBrowserCohort(stale,cohort),/identity/);
  const duplicate = load(cohort);duplicate.episodes[1] = duplicate.episodes[0];
  assert.throws(() => assertBrowserCohort(duplicate,cohort),/identity/);
  const partial = load(cohort);partial.episodes.pop();
  assert.throws(() => assertBrowserCohort(partial,cohort),/count/);
  const outside = load(cohort);outside.episodes[0].media[0].relativePath = '../private.mp4';outside.episodes[0].media[0].url = '/api/episode-media/../private.mp4';
  assert.throws(() => assertBrowserCohort(outside,cohort),/media identity/);
  const foreignMedia = load(cohort);foreignMedia.episodes[0].media[0] = load(index.cohorts[1]).episodes[0].media[0];
  assert.throws(() => assertBrowserCohort(foreignMedia,cohort),/media identity/);
});
test('open-loop videos keep prediction and reference outcomes distinct', () => {
  const cohort = index.cohorts.find(c => c.protocolKind === 'acwm_open_loop');
  const chunk = load(cohort);
  assert.ok(chunk.episodes.every(e => e.outcome === 'not_applicable' && e.finalScore === null));
  chunk.episodes[0].outcome = 'success';chunk.episodes[0].finalScore = 1;
  assert.throws(() => assertBrowserCohort(chunk,cohort),/policy success/);
});
