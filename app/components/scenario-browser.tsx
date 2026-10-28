"use client";

import { Database, Layers3, Search, Video } from 'lucide-react';
import { useState } from 'react';
import { curatedDataset } from '../data/curated-dataset';
import { matchesScenario, scenarioPlan, scenarioTags, type ScenarioTag } from '../data/scenario-plan';
import { DatasetExplorer } from './dataset-explorer';
import { RawDataBrowser } from './raw-review-board';
import { RealDatasetBrowser } from './real-dataset-browser';
import { useRawCatalog } from './use-raw-catalog';
import { ScenarioTags } from './scenario-tags';

export function ScenarioBrowser() {
  const raw = useRawCatalog();
  const [view, setView] = useState<'plan' | 'episodes' | 'real'>('episodes');
  const [simulationView, setSimulationView] = useState<'live' | 'evaluation'>('live');
  const [episodeTask, setEpisodeTask] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<ScenarioTag[]>([]);
  const [physical, setPhysical] = useState('all');
  const [scope, setScope] = useState<'all' | 'base'>('all');
  const [inventory, setInventory] = useState('all');
  const catalog = new Map(raw.catalog?.tasks.map(task => [task.name, task]) ?? []);
  const physicalSettings = [...new Set(scenarioPlan.map(scene => scene.physical))];
  const visible = scenarioPlan.filter(scene => matchesScenario(scene,tags,scope,query,physical) && (inventory === 'all' || (inventory === 'local' ? catalog.has(scene.id) : !catalog.has(scene.id))));
  const liveScenarios = scenarioPlan.filter(scene => catalog.has(scene.id)).length;
  const evaluationView = view === 'episodes' && simulationView === 'evaluation';
  function reset() { setQuery(''); setTags([]); setPhysical('all'); setScope('all'); setInventory('all'); }
  return <div className="scenarioBrowser">
    <nav className="datasetSourceNav" aria-label="Dataset source">
      <button type="button" className={view === 'episodes' ? 'active' : ''} aria-pressed={view === 'episodes'} onClick={() => setView('episodes')}>
        <span className="datasetSourceIcon"><Database size={17}/></span><span><strong>Simulation</strong><small>Trajectories &amp; actions</small></span>
        <b>{raw.catalog ? `${raw.catalog.tasks.length} / ${raw.catalog.count.toLocaleString()}` : '—'}</b>
      </button>
      <button type="button" className={view === 'real' ? 'active' : ''} aria-pressed={view === 'real'} onClick={() => setView('real')}>
        <span className="datasetSourceIcon"><Video size={17}/></span><span><strong>Real &amp; Ego</strong><small>Camera + action replay</small></span><b>2 sources</b>
      </button>
      <button type="button" className={view === 'plan' ? 'active' : ''} aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
        <span className="datasetSourceIcon"><Layers3 size={17}/></span><span><strong>Coverage</strong><small>Scenario inventory</small></span><b>{liveScenarios} live</b>
      </button>
    </nav>
    <div className="datasetSourceContext">
      <div><span>{view === 'episodes' ? 'SIMULATION DATA' : view === 'real' ? 'PHYSICAL DATA' : 'BENCHMARK COVERAGE'}</span>
        <h2>{evaluationView ? 'Evaluation episodes' : view === 'episodes' ? 'Task trajectories' : view === 'real' ? 'Real & ego episodes' : 'Scenario plan'}</h2></div>
      <p>{evaluationView ? 'Inspect ID, OOD, and recovery episodes with their recorded task instructions.' : view === 'episodes' ? 'Inspect camera streams, task folders and aligned robot actions.' : view === 'real' ? 'Replay synchronized robot or ego cameras with recorded actions.' : 'Review live coverage and proposed benchmark scenarios.'}</p>
    </div>
    {view === 'real' ? <RealDatasetBrowser embedded/> : view === 'episodes' ? <div className="simulationDatasetWorkspace">
      <div className="datasetSimulationSwitch reportSwitch" aria-label="Simulation dataset collection">
        <button type="button" aria-pressed={simulationView === 'live'} onClick={() => setSimulationView('live')}>Live records</button>
        <button type="button" aria-pressed={simulationView === 'evaluation'} onClick={() => setSimulationView('evaluation')}>Evaluation set · {curatedDataset.episodeCount.toLocaleString()}</button>
      </div>
      {simulationView === 'evaluation'
        ? <DatasetExplorer key={episodeTask ?? 'evaluation-default'} initialTaskId={episodeTask}/>
        : <RawDataBrowser key={episodeTask ?? 'default'} state={raw} initialTask={episodeTask} embedded/>}
    </div> : <>
      <section className="datasetSummaryStrip" aria-label="Scenario status summary">
        <div><strong>{scenarioPlan.length}</strong><span>Total scenarios</span></div><div><strong>{liveScenarios}</strong><span>Live folders</span></div>
        <div className="datasetSummaryAction"><span role="status">{raw.error || (raw.catalog ? `扫描于 ${new Date(raw.catalog.scannedAt).toLocaleString()}` : '正在扫描公盘目录…')}</span><button type="button" disabled={raw.loading} onClick={raw.refresh}>{raw.loading ? '扫描中…' : '刷新'}</button></div>
      </section>
      <div className="scenarioFilters">
        <label>Physical setting<select aria-label="Physical setting" value={physical} onChange={e => setPhysical(e.target.value)}><option value="all">All settings</option>{physicalSettings.map(p => <option key={p}>{p}</option>)}</select></label>
        <label>Tag scope<select aria-label="Tag scope" value={scope} onChange={e => setScope(e.target.value as 'all' | 'base')}><option value="all">Include candidates & variants</option><option value="base">Base-task assignments only</option></select></label>
        <label>Raw task folders<select aria-label="Episode records" disabled={!raw.catalog || !!raw.error} value={inventory} onChange={e => setInventory(e.target.value)}><option value="all">All scenarios</option><option value="local">In the live raw catalog</option><option value="planned">No raw task folder</option></select></label>
        <label className="searchField">Search<span className="metricSearch"><Search size={18}/><input aria-label="Find a scenario" value={query} onChange={e => setQuery(e.target.value)} placeholder="Task name or keyword"/></span></label>
      </div>
      <div className="scenarioTagFilters" aria-label="Scenario tags">{Object.entries(scenarioTags).map(([code,{label}]) => <button type="button" key={code} aria-pressed={tags.includes(code as ScenarioTag)} onClick={() => setTags(current => current.includes(code as ScenarioTag) ? current.filter(t => t !== code) : [...current,code as ScenarioTag])}><b>{code}</b>{label}</button>)}</div>
      <div className="tableHint"><span aria-live="polite">{visible.length} / {scenarioPlan.length} scenarios · Tags match all selected</span><button type="button" onClick={reset}>Clear filters</button></div>
      <p className="scenarioLegend">Proposal tags · ? Candidate · * Variant only. Local recordings do not certify the revised protocol.</p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="scenarioTableWrap" tabIndex={0} role="region" aria-label="Planned scenarios, horizontally scrollable"><table className="scenarioTable"><thead><tr><th scope="col">Scenario</th><th scope="col">Tags</th><th scope="col">Review focus</th><th scope="col">Episodes</th></tr></thead><tbody>{visible.map(scene => {
        const task = catalog.get(scene.id);
        return <tr key={scene.id} data-scenario-id={scene.id}><th scope="row">{scene.name}</th><td><ScenarioTags scene={scene}/></td><td>{scene.note}{scene.scoped.length > 0 && <details><summary>Tag conditions</summary>{scene.scoped.map(t => <p key={t.tag}><b>{t.tag}{t.scope === 'candidate' ? '?' : '*'}</b> {t.reason}</p>)}</details>}</td><td>{task && !raw.error ? <button type="button" onClick={() => {setEpisodeTask(scene.id);setSimulationView('live');setView('episodes');}} aria-label={`Browse ${task.name} episodes`}>{task.count}</button> : '—'}</td></tr>;
      })}</tbody></table>{visible.length === 0 && <div className="emptyMetrics"><p>No scenarios match these filters.</p><button type="button" onClick={reset}>Clear filters</button></div>}</div>
      <details className="tagGuide"><summary>Tag rules & evaluation boundaries</summary><dl>{Object.entries(scenarioTags).map(([code,{label,rule}]) => <div key={code}><dt>{code} · {label}</dt><dd>{rule}</dd></div>)}</dl><p>Multiple tags describe overlapping task requirements. Count each task once for overall coverage; do not add tag-wise scores into a total. ID, visual OOD, semantic OOD, behavioral OOD, and recovery belong to evaluation cohorts.</p><p>History candidates require a current-observation baseline and a full-history comparison under the same task contract. Freeze seeds, initial states, demonstration playback, checker versions, and recovery handover states before claiming reproducibility.</p><p>Source: RoboExam proposal · Simulation batch plan V1. Physical settings follow the task-scene axes v2. Review notes record open checks, not completed validations.</p></details>
    </>}
  </div>;
}
