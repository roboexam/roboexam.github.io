import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = '/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function verified(ref) {
  assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await stat(ref.path)).size, ref.byte_size);
  const h = createHash('sha256');
  for await (const b of createReadStream(ref.path)) h.update(b);
  assert.equal(h.digest('hex'), ref.sha256, `hash mismatch: ${ref.path}`);
}
async function document(ref) { await verified(ref); return JSON.parse(await readFile(ref.path, 'utf8')); }
function reviewContains(value, id, hash) {
  if (!value || typeof value !== 'object') return false;
  if (value.episode_id === id && (value.manifest_sha256 === hash || value.manifest?.sha256 === hash)) return true;
  return Object.values(value).some(v => reviewContains(v, id, hash));
}
const source = await readFile('scripts/ood-source/accepted-20260925.json');
const inventory = JSON.parse(source);
assert.equal(inventory.curated_written, false);
const mediaIndex = {}, ids = new Set(), tasks = [];
for (const [task, cohort] of Object.entries(inventory.cohorts)) {
  assert.ok(['solve_equation', 'arrange_largest_number'].includes(task));
  assert.equal(cohort.target, 100);
  assert.ok(cohort.records.length > 0);
  assert.equal(cohort.records.length, cohort.machine_passed);
  assert.equal(cohort.records.length, cohort.sampled_review_evidence_present);
  assert.ok(cohort.records.length <= cohort.target);
  const episodes = [];
  for (const r of cohort.records) {
    assert.equal(r.machine_passed, true);
    assert.ok(!ids.has(r.episode_id), 'duplicate episode'); ids.add(r.episode_id);
    const m = await document(r.manifest), q = await document(r.validator_report);
    const review = await document(r.visual_review_evidence);
    assert.equal(m.episode_id, r.episode_id); assert.equal(m.task_name, task);
    assert.equal(q.passed, true); assert.deepEqual(q.errors, []); assert.equal(q.capture_v3.passed, true);
    assert.ok(q.artifacts.some(a => a.sha256 === r.manifest.sha256 && a.path === r.manifest.path));
    assert.ok(reviewContains(review, r.episode_id, r.manifest.sha256), `review binding: ${r.episode_id}`);
    assert.equal(m.failure_type, 'clean');
    assert.equal(q.capture_v3.manifest_sha256, r.manifest.sha256);
    assert.equal(q.capture_v3.checks.task_success, true);
    assert.ok(q.capture_v3.checks.official_reward >= .999);
    const caseId = m.task_variant_id.split('.').at(-2).replace(/^r[0-9]+_/, '');
    const shared = {v1:'v1_light060',v2:'v2_light140',v3:'v3_cam_down10',v4:'v4_cam_up10',
      v5:'v5_background_table',v6:'v6_clutter',v7:'v7_digit_family',v8:'v8_combined',
      s1:'s1_paraphrase',s2:'s2_paraphrase',s3:'s3_paraphrase',s4:'s4_paraphrase',s5:'s5_paraphrase'};
    const condition = shared[caseId] ?? (task === 'arrange_largest_number'
      ? (/^b1_[1-3]$/.test(caseId) ? 'b1_five_digit_descending' : /^b2_[1-2]$/.test(caseId) ? 'b2_four_digit_ascending' : null)
      : (/^e0[1-5]$/.test(caseId) ? 'solve_' + caseId : null));
    assert.ok(condition, 'Unknown task-bound OOD condition: ' + m.task_variant_id);
    const media = [];
    for (const camera of ['cam_head', 'cam_left_wrist', 'cam_right_wrist']) {
      const v = m.artifacts.videos[camera]; await verified(v);
      const physical = await realpath(v.path);
      assert.ok(physical.startsWith(root + '/'));
      assert.ok(q.artifacts.some(a => a.path === v.path && a.sha256 === v.sha256));
      const ref = {relativePath: path.relative(root, physical), bytes: v.byte_size};
      if (mediaIndex[v.sha256]) assert.deepEqual(mediaIndex[v.sha256], ref);
      mediaIndex[v.sha256] = ref;
      const semantics = v.semantics;
      for (const value of [semantics.frame_count, semantics.fps, semantics.duration_seconds])
        assert.ok(Number.isFinite(value) && value > 0);
      assert.equal(q.capture_v3.checks.video_probes[camera].frame_count, semantics.frame_count);
      media.push({camera, bytes:v.byte_size, frames:semantics.frame_count, fps:semantics.fps,
        duration:semantics.duration_seconds, url: `/api/ood-media?file=${v.sha256}.mp4`, sha256: v.sha256});
    }
    episodes.push({id:r.episode_id, attempt:r.attempt, seed:m.scene_seed, variant:m.task_variant_id,
      condition, sourceCommit:m.pipeline_source?.commit ?? null, manifest:path.relative(root, r.manifest.path),
      instruction:m.instruction, manifestSha256:r.manifest.sha256, validatorSha256:r.validator_report.sha256,
      reviewSha256:r.visual_review_evidence.sha256, media});
  }
  tasks.push({id:task, target:cohort.target, count:episodes.length, episodes});
}
for (const [file, value] of Object.entries({
  'app/data/generated/ood-progress.json': {schemaVersion:'unibench.ood-progress.v1', inventorySha256:sha(source), admissionStatus:'staging_not_curated', reviewScope:'8 frames per camera; not exhaustive or human review', tasks},
  'app/data/generated/ood-media.json':mediaIndex,
})) {
  const bytes = JSON.stringify(value) + '\n';
  if (process.argv.includes('--check')) assert.equal(await readFile(file,'utf8'),bytes);
  else await writeFile(file,bytes);
}
console.log(`OOD exported/verified: ${ids.size} episodes, ${Object.keys(mediaIndex).length} videos`);
