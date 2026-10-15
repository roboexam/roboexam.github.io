"use client";

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { datasetEpisodeBundle as bundle, type DatasetCohort, type DatasetEpisode, type DatasetEpisodeChunk, type DatasetEpisodeMedia, type DatasetOutcome, type DatasetTask } from '../data/dataset-episodes';
import { assertBrowserCohort } from '../data/episode-browser';

const outcomeLabels: Record<DatasetOutcome, string> = {success:'Success', 'half-success':'Partial progress', failure:'Failure', not_applicable:'Open-loop prediction'};
const pairingNotes = {
  verified_same_seed: 'Verified shared scene seeds across these model cohorts.',
  requested_seed_only: 'Requested seeds are recorded; identical simulator states across models have not been verified.',
  source_episode: 'Aligned by official source episode. Policy run positions do not establish identical simulator states.',
};
const protocolNotes = {
  oracle_gt: 'Reference execution in the simulator.',
  policy_rollout: 'Closed-loop policy execution. All camera views belong to the same rollout.',
  acwm_open_loop: 'Action-conditioned video prediction. Reference-trajectory success is not model task success.',
};
export const rolloutModelNames = [...new Set(bundle.cohorts
  .filter((cohort) => cohort.family !== 'Oracle')
  .map((cohort) => cohort.displayName))];

function episodeLabel(task: DatasetTask, episode: DatasetEpisode) {
  return task.selectionMode === 'seed' ? `Seed ${episode.requestedSeed}` : episode.sourceEpisodeIndex !== null ? `Source episode ${episode.sourceEpisodeIndex}` : `Run ${episode.catalogOrdinal + 1} · requested seed ${episode.requestedSeed}`;
}

export function BaselineExplorer({ allowedModels = rolloutModelNames, initialModel, showModelPicker = true }: {
  allowedModels?: string[];
  initialModel?: string;
  showModelPicker?: boolean;
}) {
  const eligibleCohorts = bundle.cohorts.filter((cohort) => allowedModels.includes(cohort.displayName));
  const eligibleTasks = bundle.tasks.filter((task) => eligibleCohorts.some((cohort) => cohort.taskId === task.id));
  const initialCohort = eligibleCohorts.find((cohort) => cohort.displayName === initialModel) ?? eligibleCohorts[0];
  const [taskId, setTaskId] = useState(initialCohort?.taskId ?? eligibleTasks[0]?.id ?? '');
  const [modelId, setModelId] = useState(initialCohort?.modelId ?? '');
  const [position, setPosition] = useState(0);
  const task = eligibleTasks.find(t => t.id === taskId) ?? eligibleTasks[0];
  if (!task || !initialCohort) return null;
  const cohorts = eligibleCohorts.filter(c => c.taskId === task.id);
  const cohort = cohorts.find(c => c.modelId === modelId) ?? cohorts[0];
  return <section className="baselineBrowser" aria-label="Model rollout archive">
    <div className="baselineIntro"><h2>Model rollout evidence</h2><p>{eligibleTasks.length} tasks · {eligibleCohorts.length} frozen cohorts</p></div>
    <p className="datasetScopeNote">Choose a model and task to inspect its recorded execution or prediction. These videos retain their original protocol and are not additional leaderboard scores.</p>
    {showModelPicker && <div className="baselineModels" aria-label="Model rollout baseline">{cohorts.map(c => <button type="button" key={c.id} aria-pressed={c.id === cohort.id} onClick={() => setModelId(c.modelId)}><span>{c.family}</span><strong>{c.displayName}</strong><span>{c.catalogEpisodeCount} episodes</span></button>)}</div>}
    <div className="baselineTasks" aria-label="Model rollout task">{eligibleTasks.map(t => <button type="button" key={t.id} aria-pressed={t.id === task.id} onClick={() => {setTaskId(t.id);setPosition(0);}}>{t.displayName}</button>)}</div>
    <CohortWorkspace key={`${cohort.id}:${cohort.resultVersion}`} cohort={cohort} task={task} initialPosition={position} onPosition={setPosition}/>
  </section>;
}

function CohortWorkspace({cohort, task, initialPosition, onPosition}: {cohort:DatasetCohort;task:DatasetTask;initialPosition:number;onPosition:(value:number)=>void}) {
  const [chunk,setChunk] = useState<DatasetEpisodeChunk | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [retry,setRetry] = useState(0);
  const [position,setPosition] = useState(initialPosition);
  const [outcome,setOutcome] = useState<DatasetOutcome | 'all'>('all');
  const [mediaKind,setMediaKind] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(cohort.dataUrl,{signal:controller.signal});
        if (!response.ok) throw new Error('The cohort index is unavailable');
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256',bytes);
        const hash = Array.from(new Uint8Array(digest),b => b.toString(16).padStart(2,'0')).join('');
        if (hash !== cohort.episodeDataSha256) throw new Error('Cohort hash mismatch');
        const data:unknown = JSON.parse(new TextDecoder().decode(bytes));
        assertBrowserCohort(data,cohort);
        if (!controller.signal.aborted) setChunk(data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load this cohort'); }
    }
    void load(); return () => controller.abort();
  },[cohort,retry]);
  if (error) return <div className="curatedError" role="alert">{error}. <button type="button" onClick={() => {setError(null);setRetry(retry+1);}}>Retry</button></div>;
  if (!chunk) return <div className="baselineLoading"><LoaderCircle className="curatedSpin" size={22}/>Loading cohort…</div>;
  const episodes = chunk.episodes.filter(e => outcome === 'all' || e.outcome === outcome);
  const episode = episodes.find(e => e.catalogOrdinal === position) ?? episodes[0];
  const index = episode ? episodes.indexOf(episode) : -1;
  const media = episode?.media.find(m => m.kind === mediaKind) ?? episode?.media.find(m => m.preferred) ?? episode?.media[0];
  function choose(next:DatasetEpisode) {setPosition(next.catalogOrdinal);onPosition(next.catalogOrdinal);setMediaKind(null);}
  return <div className="baselineWorkspace" data-cohort-id={cohort.id}>
    <div className="baselineControls">
      <label>Outcome<select aria-label="Rollout outcome" value={outcome} onChange={e => {const value = e.target.value as DatasetOutcome | 'all';setOutcome(value);const next = chunk.episodes.find(item => value === 'all' || item.outcome === value);if(next)choose(next);}}><option value="all">All outcomes ({chunk.episodes.length})</option>{(Object.keys(outcomeLabels) as DatasetOutcome[]).filter(o => chunk.episodes.some(e => e.outcome === o)).map(o => <option key={o} value={o}>{outcomeLabels[o]} ({chunk.episodes.filter(e => e.outcome === o).length})</option>)}</select></label>
      <label>Episode<select aria-label="Rollout episode" value={episode?.id ?? ''} onChange={e => {const next=episodes.find(item => item.id === e.target.value);if(next)choose(next);}}>{episodes.map(e => <option key={e.id} value={e.id}>{episodeLabel(task,e)} · {outcomeLabels[e.outcome]}</option>)}</select></label>
      <div className="baselinePaging"><button type="button" aria-label="Previous rollout episode" disabled={index <= 0} onClick={() => choose(episodes[index-1])}><ArrowLeft size={18}/></button><span>{index+1} / {episodes.length}</span><button type="button" aria-label="Next rollout episode" disabled={index >= episodes.length-1} onClick={() => choose(episodes[index+1])}><ArrowRight size={18}/></button></div>
    </div>
    {episode && media ? <>
      <div className="baselineEpisodeTitle"><h3>{cohort.displayName} · {episodeLabel(task,episode)}</h3><span>{outcomeLabels[episode.outcome]}{episode.finalScore !== null ? ` · Native score ${episode.finalScore}` : ''}</span></div>
      <p className="datasetScopeNote">{protocolNotes[cohort.protocolKind]}</p>
      <RolloutPlayer key={`${cohort.id}:${episode.id}:${media.id}`} media={media} title={`${cohort.displayName} · ${episodeLabel(task,episode)} · ${media.label}`}/>
      <div className="baselineViews" aria-label="Rollout video views">{episode.media.map(m => <button type="button" key={m.id} aria-pressed={media.id === m.id} onClick={() => setMediaKind(m.kind)}>{m.label}</button>)}</div>
      <p className="baselinePairing">{pairingNotes[episode.pairingStatus]}</p>
      <details className="baselineIdentity"><summary>Episode details & provenance</summary><dl><dt>Protocol</dt><dd>{cohort.protocolLabel}</dd><dt>Result version</dt><dd>{cohort.resultVersion}</dd><dt>Episode ID</dt><dd>{episode.id}</dd><dt>Video</dt><dd>{media.width} × {media.height} · {media.frameCount} frames · {media.frameRate} FPS</dd><dt>Source SHA-256</dt><dd>{cohort.sourceSha256}</dd><dt>Video SHA-256</dt><dd>{media.sha256}</dd><dt>Alignment SHA-256</dt><dd>{task.alignmentSha256}</dd></dl></details>
    </> : <p>No episodes match this outcome.</p>}
  </div>;
}
function RolloutPlayer({media,title}: {media:DatasetEpisodeMedia;title:string}) {
  const [failed,setFailed] = useState(false);
  return <div className="rolloutPlayer"><video controls muted playsInline preload="metadata" src={media.url} aria-label={title} onError={() => setFailed(true)}><track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/></video>{failed && <div className="curatedVideoOverlay" role="status"><strong>Video file unavailable</strong><span>The episode record is available; its original video is not connected to this preview.</span></div>}</div>;
}
