import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateChunk, relativePath, validateRow, DOCUMENT_OOD_CONDITIONS, DOCUMENT_OOD_TASKS } from '../scripts/curated-dataset-contract.mjs';
import { parseMediaRange } from '../app/data/media-range.ts';
import { partitionEpisodes } from '../app/data/curated-partition.ts';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const index = read('../app/data/generated/curated-dataset.json');
test('curated task chunks, counts, hashes and media allowlist agree', () => {
  const media = read('../app/data/generated/curated-media.json');
  const ids = new Set(); let total = 0, videos = 0;
  for (const task of index.tasks) {
    const bytes = readFileSync(new URL(`../public${task.dataUrl}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), task.sha256);
    const chunk = validateChunk(JSON.parse(bytes));
    assert.equal(chunk.catalogSha256, index.catalogSha256);
    assert.equal(chunk.taskId, task.id);
    assert.equal(chunk.episodes.length, task.count);
    assert.equal(chunk.episodes.filter(e => e.type === 'clean' && !e.oodCondition).length, task.clean);
    assert.equal(chunk.episodes.filter(e => e.oodCondition).length, task.ood);
    assert.equal(task.count, task.clean + task.recovery + task.ood);
    for (const e of chunk.episodes) {
      assert.ok(!ids.has(e.id)); ids.add(e.id); total++;
      assert.equal(typeof e.instruction === 'string' && e.instruction.trim().length > 0, true, `${e.id} instruction`);
      for (const m of e.media) { assert.equal(media[m.sha256].bytes, m.bytes); relativePath(media[m.sha256].relativePath); videos++; }
    }
  }
  assert.equal(total, index.episodeCount); assert.equal(videos, index.mediaCount);
});
test('unsafe paths and invalid/duplicate media evidence are rejected', () => {
  for (const p of ['/etc/passwd', '../x', 'x/../y', 'x\\y', '']) assert.throws(() => relativePath(p));
  const chunk = read(`../public${index.tasks[0].dataUrl}`);
  const duplicate = structuredClone(chunk); duplicate.episodes.push(duplicate.episodes[0]); assert.throws(() => validateChunk(duplicate));
  const invalid = structuredClone(chunk); invalid.episodes[0].media[0].url = '/other.mp4'; assert.throws(() => validateChunk(invalid));
});
test('video seeking supports bounded, suffix and open ranges, rejects invalid ranges', () => {
  assert.equal(parseMediaRange(null, 100), null);
  assert.deepEqual(parseMediaRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseMediaRange('bytes=95-', 100), { start: 95, end: 99 });
  assert.deepEqual(parseMediaRange('bytes=-8', 100), { start: 92, end: 99 });
  assert.deepEqual(parseMediaRange('bytes=90-200', 100), { start: 90, end: 99 });
  for (const r of ['bytes=100-', 'bytes=40-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'bad', 'bytes=9007199254740992-']) assert.equal(parseMediaRange(r, 100), undefined);
});

test('the three cards partition each task exactly and match its published counts', () => {
  for (const task of index.tasks) {
    const chunk = read(`../public${task.dataUrl}`);
    const split = partitionEpisodes(chunk.episodes);
    assert.equal(split.clean.length, task.clean, `${task.id} clean`);
    assert.equal(split.recovery.length, task.recovery, `${task.id} recovery`);
    assert.equal(split.ood.length, task.ood, `${task.id} ood`);
    // no episode may be dropped from every card or counted by two of them
    const seen = [...split.clean, ...split.recovery, ...split.ood].map((e) => e.id);
    assert.equal(seen.length, chunk.episodes.length, `${task.id} partition size`);
    assert.equal(new Set(seen).size, chunk.episodes.length, `${task.id} partition overlap`);
    // an OOD episode is a clean run under a declared perturbation
    for (const episode of split.ood) assert.equal(episode.type, 'clean');
    for (const episode of split.clean) assert.equal(episode.oodCondition ?? null, null);
  }
});


function documentFixture(task = 'stack_bowls', condition = 'V1') {
  const id = task === 'stack_bowls' ? 'episode_ood65:' + 'a'.repeat(20) : 'episode:' + 'b'.repeat(20);
  const prefix = `${task}/ood/${condition}/episode_0/`;
  const row = { task_name:task, failure_type:'clean', category:'ood', ood_condition:condition,
    episode_id:id, episode_index:0, scene_seed:1, acceptance_status:'strictly_selected',
    manifest_sha256:'c'.repeat(64), manifest:prefix + 'episode_manifest.json',
    document_ood_evidence:{schema_version:'benchmark2027.document_ood_evidence.v1', validator_sha256:'d'.repeat(64)},
    videos:Object.fromEntries(['cam_head','cam_left_wrist','cam_right_wrist'].map(c => [c, prefix + c + '.mp4'])) };
  const manifest = {task_name:task, failure_type:'clean', episode_id:id, scene_seed:1,
    schema_version:'benchmark2027.robodojo_failure_recovery_episode.v3', dataset_category:'ood',
    task_variant_id:null, ood_condition:condition, ood:{condition, base_id:'C01'}};
  const registry = {namespaces:{[`${task}/ood:${condition}`]:{assignments:{[id]:0}}}};
  return {row,manifest,registry};
}

test('document OOD preserves condition namespaces and original Bowl IDs', () => {
  for (const task of DOCUMENT_OOD_TASKS) for (const condition of DOCUMENT_OOD_CONDITIONS) {
    const {row,manifest,registry} = documentFixture(task,condition);
    validateRow(row,manifest,registry);
  }
});

test('document OOD refuses relabeling, undeclared tasks, invalid bases and missing evidence', () => {
  const mutations = [
    f => {f.row.ood_condition = null; f.row.category = 'clean';},
    f => {f.manifest.ood.condition = 'V2';},
    f => {f.manifest.dataset_category = 'in_domain';},
    f => {f.manifest.task_variant_id = 'classic.variant';},
    f => {f.manifest.ood.base_id = 'C06';},
    f => {delete f.row.document_ood_evidence;},
    f => {f.row.episode_id = f.manifest.episode_id = 'episode_ood65:bad';},
  ];
  for (const mutate of mutations) {const f = documentFixture(); mutate(f); assert.throws(() => validateRow(f.row,f.manifest,f.registry));}
  const f = documentFixture('stack_blocks');
  assert.throws(() => validateRow(f.row,f.manifest,f.registry));
});

test('document OOD stays out of ID and recovery cards', () => {
  const episodes = DOCUMENT_OOD_CONDITIONS.map((condition,i) => ({id:`test-${i}`,type:'clean',oodCondition:condition}));
  const split = partitionEpisodes(episodes);
  assert.equal(split.ood.length,10); assert.equal(split.clean.length,0); assert.equal(split.recovery.length,0);
});
