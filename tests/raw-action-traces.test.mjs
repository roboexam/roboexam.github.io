import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateActionTrace } from "../app/data/action-trace.ts";
import { createRawReviewReader } from "../app/data/raw-review.server.ts";
const hash = "a".repeat(64);
function trace(input = {}) {
  return { schemaVersion: "roboexam.action-trace.v1", episodeId: input.episodeId ?? "episode:abcd",
    clock: { dataset: "video_pts_seconds", unit: "seconds", sourceFrames: 100, samples: 2 }, t: [0, 1],
    jointPosition: { unit: "rad", left: [[0,1,2,3,4,5],[1,2,3,4,5,6]], right: null },
    endEffectorPosition: { unit: "m", frame: "world", left: [[0,1,2],[1,2,3]], right: null },
    provenance: { manifestSha256: input.manifestSha256 ?? hash, trajectorySha256: null, datasets: ["state/left_arm_joint_state"],
      ...(input.bindingSha256 ? { bindingSha256: input.bindingSha256 } : {}) } };
}
const clone = x => JSON.parse(JSON.stringify(x));

test("trace contract accepts real partial telemetry and rejects stale episode/manifest/binding", () => {
  const t = trace(); assert.equal(validateActionTrace(t, t.episodeId), t);
  assert.throws(() => validateActionTrace(t, "episode:ffff"));
  const source = { url: "/api/raw-review-trace?id=x", bindingSha256: hash, manifestSha256: hash };
  assert.throws(() => validateActionTrace(t, t.episodeId, source));
  t.provenance.bindingSha256 = hash; validateActionTrace(t, t.episodeId, source);
  assert.throws(() => validateActionTrace(t, t.episodeId, { ...source, manifestSha256: "b".repeat(64) }));
});
test("trace contract rejects invalid times, lengths, units, dimensions and non-finite data", () => {
  for (const change of [t=>t.t[1]=0, t=>t.t[1]=Infinity, t=>t.clock.samples=99, t=>t.jointPosition.left[0].pop(),
    t=>t.endEffectorPosition.left[0][0]=NaN, t=>t.jointPosition.unit="m", t=>t.endEffectorPosition.frame="unknown"]) {
    const t=clone(trace()); change(t);
    assert.throws(()=>validateActionTrace(t,t.episodeId));
  }
  const empty=trace();empty.jointPosition.left=null;empty.endEffectorPosition.left=null;
  assert.throws(()=>validateActionTrace(empty,empty.episodeId));
});
async function fixture(t, extractor) {
  const root = await mkdtemp(path.join(tmpdir(), "raw-action-api-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const dir=path.join(root,"task/id/episode_0"); await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"episode_manifest.json"),JSON.stringify({episode_id:"original",task_name:"task",scene_seed:19,
    artifacts:{trajectory_hdf5:{path:"/untrusted/staging/episode_task.hdf5",sha256:hash}}}));
  await writeFile(path.join(dir,"episode_task.hdf5"),"fixture-data");
  const reader=createRawReviewReader({root,refreshMs:0,traceExtractor:extractor ?? (async(fd,input)=>({status:"available",trace:trace(input)}))});
  const c=await reader.catalog(); const rows=await reader.task(c.tasks[0].id); const ep=await reader.episode(rows.entries[0].id);
  return {root,dir,reader,ep,id:ep.trace.bindingSha256};
}
test("raw trace is bound to the exact raw directory and metadata; it never follows manifest paths",async t=>{
  const {reader,ep,id}=await fixture(t);assert.match(ep.trace.url,/^\/api\/raw-review-trace\?id=[a-f0-9]{64}$/);
  const result=await reader.actionTrace(id);assert.equal(result.status,"available");
  assert.equal(result.trace.episodeId,ep.id);assert.equal(result.trace.provenance.manifestSha256,ep.manifestSha256);
  assert.equal(await reader.actionTrace("unknown"),null);
});
test("unchanged traces coalesce/cache, changed trajectory or metadata cannot borrow an old binding",async t=>{
  let calls=0; const f=await fixture(t,async(fd,input)=>{calls++;return {status:"available",trace:trace(input)};});
  await new Promise(resolve=>setTimeout(resolve,2100));
  const results=await Promise.all([f.reader.actionTrace(f.id),f.reader.actionTrace(f.id)]);
  assert.equal(results[0].status,"available");assert.equal(calls,1);
  await f.reader.actionTrace(f.id);assert.equal(calls,1);
  await writeFile(path.join(f.dir,"episode_task.hdf5"),"fixture-replaced-longer");
  assert.equal((await f.reader.actionTrace(f.id)).reason,"source_changed");
  const next=await f.reader.episode(f.ep.id);assert.notEqual(next.trace.bindingSha256,f.id);
  await writeFile(path.join(f.dir,"episode_manifest.json"),"{}");
  assert.equal((await f.reader.actionTrace(next.trace.bindingSha256)).reason,"source_changed");
});
test("partial/missing and ambiguous trajectories remain explicit without a seed fallback",async t=>{
  const f=await fixture(t);await rm(path.join(f.dir,"episode_task.hdf5"));
  assert.equal((await f.reader.episode(f.ep.id)).trace.unavailable,"trajectory_missing");
  await writeFile(path.join(f.dir,"one.hdf5"),"one");await writeFile(path.join(f.dir,"two.hdf5"),"two");
  assert.equal((await f.reader.episode(f.ep.id)).trace.unavailable,"ambiguous_trajectory");
});
test("trace API accepts only one opaque ID and never paths",async()=>{
  const {GET}=await import("../app/api/raw-review-trace/route.ts");
  for(const q of ["?path=/etc/passwd","?id=..",`?id=${hash}&id=${hash}`]) assert.equal((await GET(new Request("http://x/api/raw-review-trace"+q))).status,400);
  assert.equal((await GET(new Request("http://x/api/raw-review-trace?id="+hash))).status,404);
});
