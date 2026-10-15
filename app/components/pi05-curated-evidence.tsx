"use client";
import { useEffect, useState } from "react";
import { pi05Curated, sampleDisplay, type CuratedSample } from "../data/pi05-curated";

export function Pi05CuratedEvidence({taskId,metricId,formula}:{taskId:string;metricId:string;formula:string}) {
 const [sampleId,setSampleId]=useState("");
 const [camera,setCamera]=useState("cam_head");
 const [samples,setSamples]=useState<CuratedSample[] | null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/pi05-results/"+encodeURIComponent(taskId),{signal:controller.signal})
   .then(r=>{if(!r.ok) throw new Error("Missing cohort");return r.json();})
   .then(data=>setSamples(data.samples))
   .catch(e=>{if(e.name!=="AbortError") setError(true);});
  return ()=>controller.abort();
 },[taskId]);
 const task=pi05Curated[taskId];
 if (!task) return null;
 if (!samples?.length) return <section className="metricSample"><p>{error ? "Sample evidence could not be loaded. Please reopen this panel." : "Loading episode evidence…"}</p></section>;
 const sample=samples.find(s=>s.id===sampleId) ?? samples[0];
 const video=sample.videos.find(v=>v.camera===camera) ?? sample.videos[0];
 const metric=task.values[metricId];
 const labels:Record<string,string>={cam_head:"Head camera",cam_left_wrist:"Left wrist",cam_right_wrist:"Right wrist"};
 return <><section className="metricSample vlaSample">
 <div className="sampleHeading"><div><span>REAL EPISODE WALKTHROUGH</span><h3>Pi0.5 · {taskId}</h3><p>{sample.sourceEpisode} · {sample.success?"success":"failure"} · score {sample.score}</p></div>
 <div className="sampleTools"><label className="episodeSelect"><span>Choose formal sample</span><select aria-label="Pi0.5 sample" value={sample.id} onChange={e=>setSampleId(e.target.value)}>{samples.map(s=><option key={s.id} value={s.id}>{s.sourceEpisode} · {s.success?"success":"failure"}</option>)}</select></label>
 <label className="episodeSelect"><span>Camera</span><select aria-label="Pi0.5 camera" value={camera} onChange={e=>setCamera(e.target.value)}>{sample.videos.map(v=><option key={v.camera} value={v.camera}>{labels[v.camera]}</option>)}</select></label></div></div>
 <div className="sampleBody vlaSampleBody"><div className="sampleVideo"><video key={video.sha256} controls muted playsInline preload="metadata" src={video.url}/><div><b>{labels[video.camera]}</b><span>{video.durationSeconds.toFixed(2)} s · {video.frameCount} frames · SHA {video.sha256.slice(0,12)}</span></div></div>
 <div className="sampleCalculation"><div className="calculationSteps">
 <article><span>Sample</span><strong>{sample.sourceEpisode}</strong><p>layout {sample.layoutId} · seed {sample.seed}</p></article>
 <article><span>Scoring rule</span><p>{formula}</p></article>
 <article><span>Episode result</span><strong>{sampleDisplay(sample.values[metricId],sample.units[metricId])}</strong><p>{metric?.detail}</p></article>
 <article><span>Evidence</span><p>Report SHA {sample.reportSha256.slice(0,12)}</p>{metricId==="STAGE_COMPLETION" && <p>{Object.entries(task.stageNames).map(([id,name])=>`S${id}: ${name}`).join(" · ")}</p>}</article>
 </div></div></div></section>
 <section className="formalEvidence"><div className="formalEvidenceHeader"><div><span>FORMAL AGGREGATE EVIDENCE</span><h3>Pi0.5 · {taskId} · ID</h3><p>{task.resultVersion}</p></div><div className="formalEvidenceValue"><strong>{metric?.primary ?? "N/A"}</strong><span>N = {metric?.n ?? 0}{metric?.coverage != null ? ` · coverage ${(metric.coverage*100).toFixed(1)}%` : ""}</span></div></div>
 <div className="formalEvidenceFacts"><article><span>Cohort</span><strong>{task.episodes} episodes</strong></article><article><span>Success</span><strong>{task.successes} / {task.episodes}</strong></article><article><span>Protocol</span><p>{task.protocol}</p></article></div>
 </section></>;
}
