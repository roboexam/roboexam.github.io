import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import pi05Curated from '../app/data/generated/pi05-curated.json' with {type:'json'};
import { pi05Curated as aggregates } from '../app/data/pi05-curated.ts';
import { GET as getSamples } from '../app/api/pi05-results/[task]/route.ts';
import { readResult,definitionFor } from '../app/data/track-results.ts';
import { tracks } from '../app/data/metric-plan.ts';
import { metricInfo } from '../app/data/metric-definitions.ts';
import { GET,HEAD } from '../app/api/pi05-media/[file]/route.ts';
const selection=(taskId,metricId='TSR',modelId='Pi0.5')=>({trackId:'T3',mode:'plan',taskId,metricId,modelId});
test('seven complete cohorts preserve sample identity, outcomes and exact three-camera joins',()=>{
 assert.equal(Object.keys(pi05Curated).length,7);
 assert.equal(Object.values(pi05Curated).reduce((a,t)=>a+t.episodes,0),155);
 for(const [task,t] of Object.entries(pi05Curated)){
  assert.equal(t.samples.length,t.episodes);assert.equal(new Set(t.samples.map(s=>s.id)).size,t.episodes);
  assert.equal(t.values.TSR.value,t.samples.filter(s=>s.success).length/t.episodes);
  for(const s of t.samples){
   assert.ok(s.id.startsWith(t.resultVersion+':'));assert.equal(s.videos.length,3);
   assert.equal(new Set(s.videos.map(v=>v.camera)).size,3);
   for(const v of s.videos)assert.equal(v.url,'/api/pi05-media/'+v.sha256+'.mp4');
  }
  for(const m of tracks[2].metrics)assert.deepEqual(definitionFor(selection(task,m.id)),metricInfo[m.id]);
 }
 assert.doesNotMatch(JSON.stringify(pi05Curated),/\/mnt\//);
});
test('task and model routing cannot inherit another cohort or unsupported metric',()=>{
 assert.equal(readResult(selection('push_T')).sampleCount,5);
 assert.equal(readResult(selection('stack_bowls')).sampleCount,5);
 for(const task of ['build_tower','cover_blocks','insert_key','pick_from_conveyor_by_image','plug_in_charger','push_T']){
  assert.equal(readResult(selection(task,'TSR','FastWAM')).available,false);
  assert.equal(readResult(selection(task,'TARGET_SELECTION')).available,false);
 }
 assert.equal(readResult(selection('not_a_task')).available,false);
 assert.equal(readResult({...selection('stack_bowls'),setting:'visual'}).sampleCount,5);
 for(const k of ['JERK','ACTION_EXACT_MATCH','PARAMETER_ACCURACY','ATTRIBUTE_GROUNDING'])
  assert.equal(readResult(selection('stack_bowls',k)).available,false);
 assert.equal(readResult(selection('stack_bowls','STAGE_TRANSITION')).available,true);
 assert.equal(readResult(selection('cover_blocks','LOCAL_SUCCESS_ONCE')).available,true);
 assert.equal(readResult(selection('insert_key','LOCAL_SUCCESS_ONCE')).available,true);
 assert.equal(pi05Curated.insert_key.values.LOCAL_SUCCESS_ONCE.coverage,0.5);
});
test('first selection and action type use their declared source fields',async()=>{
 const exporter=await readFile(new URL('../scripts/export-pi05-curated.py',import.meta.url),'utf8');
 assert.match(exporter,/'TARGET_SELECTION':'first_target_selection_accuracy'/);
 assert.match(exporter,/'ACTION_ACCURACY':'action.skill'/);
 assert.match(exporter,/'GRASP_STABILITY':'transport_stability'/);
});
test('video allowlist serves exact range and rejects arbitrary paths and unknown hashes',async()=>{
 const s=pi05Curated.stack_bowls.samples[0],v=s.videos[0],file=v.sha256+'.mp4';
 const context={params:Promise.resolve({file})};
 const head=await HEAD(new Request('http://localhost'+v.url),context);
 assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp4');
 const response=await GET(new Request('http://localhost'+v.url,{headers:{Range:'bytes=0-31'}}),context);
 assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
 const bad=await GET(new Request('http://localhost'+v.url,{headers:{Range:'bytes=999999999999-'}}),context);
 assert.equal(bad.status,416);
 for(const file of ['../../etc/passwd','0'.repeat(64)+'.mp4','not-allowed.mp4']){
  assert.equal((await HEAD(new Request('http://localhost/api/pi05-media/'+file),{params:Promise.resolve({file})})).status,404);
 }
});

test('sample endpoint is task-specific and aggregates do not bundle all evidence',async()=>{
 for(const [task,t] of Object.entries(pi05Curated)){
  assert.equal(aggregates[task].samples,undefined);
  assert.deepEqual(aggregates[task].values,t.values);
  const r=await getSamples(new Request('http://localhost'),{params:Promise.resolve({task})});
  const d=await r.json();assert.equal(d.samples.length,t.episodes);assert.equal(d.task,task);
  assert.equal(JSON.stringify(d).includes('/mnt/'),false);
 }
 assert.equal((await getSamples(new Request('http://localhost'),{params:Promise.resolve({task:'__proto__'})})).status,404);
});
