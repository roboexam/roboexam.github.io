import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const bundle=read("../app/data/generated/review-candidates.json");
test("review covers 24 tasks and separates clean, engineering, timing and origins",()=>{
  assert.equal(bundle.tasks.length,24);
  let clean=0,technical=0,backup=0,development=0;
  const batchSeeds=new Map();
  for(const task of bundle.tasks){
    const chunk=read("../public"+task.dataUrl);
    assert.ok(!JSON.stringify(chunk).includes("/mnt/"));
    assert.ok(!JSON.stringify(chunk).includes("/bh/"));
    for(const row of chunk.episodes){
      assert.equal(row.qualification.functional,true);
      if(row.qualification.clean===true)clean++;else{
        assert.equal(row.qualification.clean,null);
        assert.equal(row.machineStatus,"technical_pass_purpose_pending");technical++;
      }
      assert.ok(typeof row.qualification.strongFidelity==="boolean"||row.qualification.strongFidelity===null);
      assert.ok(typeof row.qualification.time.status==="string");
      for(const m of row.memberships){
        if(m.role==="backup")backup++;
        if(m.role==="development")development++;
        if(m.role==="primary"&&["find_category_outlier","place_between_references","mirror_pair_layout","hold_water_mug"].includes(task.id)){
          if(!batchSeeds.has(task.id))batchSeeds.set(task.id,new Set());
          batchSeeds.get(task.id).add(row.seed);
        }
      }
    }
  }
  for(const set of batchSeeds.values())assert.equal(set.size,100);
  assert.equal(clean,bundle.cleanCandidateCount);assert.equal(technical,bundle.technicalCandidateCount);
  assert.equal(clean+technical,bundle.candidateCount);
  assert.equal(backup,0,"user excluded B09 old backup from this publication");
  const b09=read("../public"+bundle.tasks.find(t=>t.id==="set_button_colors").dataUrl);
  assert.equal(b09.episodes.filter(row=>row.memberships.some(m=>m.role==="primary")).length,100);
  assert.ok(b09.episodes.every(row=>row.memberships.every(m=>m.role!=="backup")));
  assert.ok(development>0);assert.ok(technical>0);
});
