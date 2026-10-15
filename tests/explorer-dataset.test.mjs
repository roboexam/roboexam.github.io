import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read = p => JSON.parse(readFileSync(new URL(p,import.meta.url)));
const index = read('../app/data/generated/explorer-dataset.json');
const curated = read('../app/data/generated/curated-dataset.json');
const source = read('../app/data/generated/ood-progress.json');
test('unified explorer preserves curated rows and all pinned OOD identities exactly once', () => {
  const ids = new Set(); let stagingCount = 0;
  const stagingMedia = read('../app/data/generated/ood-media.json');
  for (const task of index.tasks) {
    const bytes = readFileSync(new URL('../public' + task.dataUrl,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),task.sha256);
    const chunk = JSON.parse(bytes);
    const originalTask = curated.tasks.find(t => t.id === task.id);
    const original = read('../public' + originalTask.dataUrl);
    assert.equal(chunk.taskId,task.id);
    assert.equal(chunk.catalogSha256,curated.catalogSha256);
    assert.equal(chunk.episodes.length,task.count);
    assert.equal(chunk.episodes.filter(e => e.oodCondition).length,task.ood);
    assert.equal(task.count,task.clean + task.recovery + task.ood);
    for (const e of original.episodes) assert.deepEqual(chunk.episodes.find(x => x.id === e.id),e);
    for (const e of source.tasks.find(t => t.id === task.id)?.episodes ?? []) {
      const matches = chunk.episodes.filter(x => x.id === e.id);
      assert.equal(matches.length,1); assert.equal(matches[0].manifestSha256,e.manifestSha256);
    }
    for (const e of chunk.episodes) {
      assert.ok(!ids.has(e.id)); ids.add(e.id);
      if(e.admissionStatus !== 'staging_not_curated') continue;
      stagingCount++;
      assert.ok(e.reviewScope && e.validatorSha256 && e.reviewSha256 && e.oodCondition);
      assert.equal(e.type,'clean');
      assert.deepEqual(e.media.map(m => m.camera),['cam_head','cam_left_wrist','cam_right_wrist']);
      for(const m of e.media) {
        assert.equal(m.url,'/api/ood-media?file=' + m.sha256 + '.mp4');
        assert.equal(stagingMedia[m.sha256].bytes,m.bytes);
        assert.ok(m.fps > 0 && m.frames > 0 && m.duration > 0);
      }
    }
    assert.ok(!bytes.toString().includes('/mnt/'));
  }
  assert.equal(stagingCount,index.stagingEpisodeCount);
  assert.equal(ids.size,index.episodeCount);
  assert.equal(index.episodeCount,index.curatedEpisodeCount + stagingCount);
  assert.equal(index.mediaCount,index.episodeCount * 3);
  for (const t of source.tasks) assert.equal(t.episodes.length,100);
});
test('Classify keeps its existing OOD publication and media unchanged', () => {
  assert.deepEqual(index.tasks.find(t => t.id === 'classify_objects_by_language'),
    curated.tasks.find(t => t.id === 'classify_objects_by_language'));
});
