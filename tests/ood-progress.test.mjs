import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const exporter = new URL('../scripts/export-ood-progress.mjs',import.meta.url).pathname;
function rejected(cohorts, expected) {
  const dir=mkdtempSync(path.join(tmpdir(),'ood-rejection-'));
  try {
    mkdirSync(path.join(dir,'scripts/ood-source'),{recursive:true});
    writeFileSync(path.join(dir,'scripts/ood-source/accepted-20260925.json'),JSON.stringify({curated_written:false,cohorts}));
    const run=spawnSync(process.execPath,[exporter],{cwd:dir,encoding:'utf8'});
    assert.notEqual(run.status,0); assert.match(run.stderr,expected);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
test('OOD exporter rejects unknown tasks and mismatched acceptance counts',()=>{
  rejected({foreign_task:{}}, /AssertionError/);
  rejected({solve_equation:{records:[],machine_passed:1}}, /AssertionError/);
});
test('OOD exporter rejects unqualified episodes before publishing',()=>{
  rejected({solve_equation:{target:100,machine_passed:1,sampled_review_evidence_present:1,records:[{machine_passed:false}]}}, /AssertionError/);
});
test('OOD bundle keeps exact identity joins, three cameras and staging status',()=>{
  const d=JSON.parse(readFileSync(new URL('../app/data/generated/ood-progress.json',import.meta.url)));
  const media=JSON.parse(readFileSync(new URL('../app/data/generated/ood-media.json',import.meta.url)));
  assert.equal(d.admissionStatus,'staging_not_curated');
  const ids=new Set();
  for(const t of d.tasks){
    assert.equal(t.count,t.episodes.length);assert.ok(t.count<=100);
    for(const e of t.episodes){
      assert.ok(!ids.has(e.id));ids.add(e.id);
      assert.deepEqual(e.media.map(v=>v.camera),['cam_head','cam_left_wrist','cam_right_wrist']);
      for(const v of e.media){assert.ok(media[v.sha256]);assert.equal(v.url,`/api/ood-media?file=${v.sha256}.mp4`);}
    }
  }
  assert.equal(d.tasks.find(t=>t.id==='arrange_largest_number').count,100);
});
