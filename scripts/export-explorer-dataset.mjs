import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

const read = async p => JSON.parse(await readFile(p, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const curated = await read('app/data/generated/curated-dataset.json');
const staging = await read('app/data/generated/ood-progress.json');
assert.equal(staging.admissionStatus, 'staging_not_curated');
const check = process.argv.includes('--check');
async function publish(file, value) {
  const bytes = JSON.stringify(value) + '\n';
  if (check) assert.equal(await readFile(file, 'utf8'), bytes, 'Stale explorer bundle: ' + file);
  else await writeFile(file, bytes);
}
if (!check) await mkdir('public/explorer-data', {recursive:true});
const tasks = [];
let added = 0;
for (const task of curated.tasks) {
  const cohort = staging.tasks.find(t => t.id === task.id);
  if (!cohort) { tasks.push(task); continue; }
  const bytes = await readFile('public' + task.dataUrl);
  assert.equal(hash(bytes), task.sha256);
  const chunk = JSON.parse(bytes);
  assert.equal(chunk.taskId, task.id);
  assert.equal(chunk.catalogSha256, curated.catalogSha256);
  const seen = new Map(chunk.episodes.map(e => [e.id, e]));
  assert.equal(cohort.count, cohort.episodes.length);
  for (const e of cohort.episodes) {
    if (seen.has(e.id)) {
      assert.equal(seen.get(e.id).manifestSha256, e.manifestSha256, 'Conflicting episode identity');
      continue;
    }
    const episode = {...e, index:cohort.episodes.indexOf(e), type:'clean', oodCondition:e.condition,
      marks:[], admissionStatus:staging.admissionStatus, reviewScope:staging.reviewScope};
    assert.ok(e.condition);
    chunk.episodes.push(episode); seen.set(e.id, episode); added++;
  }
  assert.equal(new Set(chunk.episodes.map(e => e.id)).size, chunk.episodes.length);
  assert.ok(!JSON.stringify(chunk).includes('/mnt/'));
  chunk.inventorySha256 = staging.inventorySha256;
  const digest = hash(JSON.stringify(chunk) + '\n');
  const dataUrl = '/explorer-data/' + task.id + '-' + digest.slice(0,16) + '.json';
  await publish('public' + dataUrl, chunk);
  tasks.push({...task, count:chunk.episodes.length, ood:chunk.episodes.filter(e => e.oodCondition).length,
    oodConditions:[...new Set(chunk.episodes.filter(e => e.oodCondition).map(e => e.oodCondition))].sort(),
    dataUrl, sha256:digest});
}
assert.ok(staging.tasks.every(t => tasks.some(c => c.id === t.id)), 'Missing task metadata');
await publish('app/data/generated/explorer-dataset.json', {...curated, schemaVersion:'unibench.explorer-dataset.v1',
  version:curated.version + '-ood-' + staging.inventorySha256.slice(0,8),
  inventorySha256:staging.inventorySha256, curatedEpisodeCount:curated.episodeCount, stagingEpisodeCount:added,
  episodeCount:curated.episodeCount + added, mediaCount:curated.mediaCount + added * 3, tasks});
console.log('Dataset explorer: ' + curated.episodeCount + ' curated + ' + added + ' staging OOD episodes');
