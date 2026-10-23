"use client";

import { Search } from 'lucide-react';
import { useState } from 'react';
import { matchesScenario, scenarioPlan, scenarioTags, type ScenarioTag } from '../data/scenario-plan';
import { RawDataBrowser } from './raw-review-board';
import { useRawCatalog } from './use-raw-catalog';
import { ScenarioTags } from './scenario-tags';

export function ScenarioBrowser() {
  const raw = useRawCatalog();
  const [view, setView] = useState<'plan' | 'episodes'>('episodes');
  const [episodeTask, setEpisodeTask] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<ScenarioTag[]>([]);
  const [physical, setPhysical] = useState('all');
  const [scope, setScope] = useState<'all' | 'base'>('all');
  const [inventory, setInventory] = useState('all');
  const catalog = new Map(raw.catalog?.tasks.map(task => [task.name, task]) ?? []);
  const physicalSettings = [...new Set(scenarioPlan.map(scene => scene.physical))];
  const visible = scenarioPlan.filter(scene => matchesScenario(scene,tags,scope,query,physical) && (inventory === 'all' || (inventory === 'local' ? catalog.has(scene.id) : !catalog.has(scene.id))));
  function reset() { setQuery(''); setTags([]); setPhysical('all'); setScope('all'); setInventory('all'); }
  return <div className="scenarioBrowser">
    <div className="datasetViewSwitch reportSwitch" aria-label="Dataset view"><button type="button" aria-pressed={view === 'episodes'} onClick={() => setView('episodes')}>Task trajectories</button><button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Scenario plan</button></div>
    {view === 'episodes' ? <RawDataBrowser key={episodeTask ?? 'default'} state={raw} initialTask={episodeTask}/> : <>
      <div className="scenarioIntro"><h2>Simulation scenarios</h2><p>{scenarioPlan.length} proposed scenarios · {raw.catalog ? raw.catalog.tasks.length : '—'} live raw task folders</p></div>
      <div className="rawReviewRefresh"><span role="status">{raw.error || (raw.catalog ? `最近扫描：${new Date(raw.catalog.scannedAt).toLocaleString()}` : '正在扫描公盘目录…')}</span><button type="button" disabled={raw.loading} onClick={raw.refresh}>{raw.loading ? '扫描中…' : '刷新'}</button></div>
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
        return <tr key={scene.id} data-scenario-id={scene.id}><th scope="row">{scene.name}</th><td><ScenarioTags scene={scene}/></td><td>{scene.note}{scene.scoped.length > 0 && <details><summary>Tag conditions</summary>{scene.scoped.map(t => <p key={t.tag}><b>{t.tag}{t.scope === 'candidate' ? '?' : '*'}</b> {t.reason}</p>)}</details>}</td><td>{task && !raw.error ? <button type="button" onClick={() => {setEpisodeTask(scene.id);setView('episodes');}} aria-label={`Browse ${task.name} episodes`}>{task.count}</button> : '—'}</td></tr>;
      })}</tbody></table>{visible.length === 0 && <div className="emptyMetrics"><p>No scenarios match these filters.</p><button type="button" onClick={reset}>Clear filters</button></div>}</div>
      <details className="tagGuide"><summary>Tag rules & evaluation boundaries</summary><dl>{Object.entries(scenarioTags).map(([code,{label,rule}]) => <div key={code}><dt>{code} · {label}</dt><dd>{rule}</dd></div>)}</dl><p>Multiple tags describe overlapping task requirements. Count each task once for overall coverage; do not add tag-wise scores into a total. ID, visual OOD, semantic OOD, behavioral OOD, and recovery belong to evaluation cohorts.</p><p>History candidates require a current-observation baseline and a full-history comparison under the same task contract. Freeze seeds, initial states, demonstration playback, checker versions, and recovery handover states before claiming reproducibility.</p><p>Source: RoboExam proposal · Simulation batch plan V1. Physical settings follow the task-scene axes v2. Review notes record open checks, not completed validations.</p></details>
    </>}
  </div>;
}
