"use client";

import { ArrowUpRight, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LeaderboardView } from './components/leaderboard-view';
import { HeroStage } from './components/hero-stage';
import { HomeDemos } from './components/home-demos';
import { SpotlightLayer, useNavGlider } from './components/fx';
import { OverviewBenchmark, OverviewExplore, OverviewFindings, OverviewHybrid, OverviewQuestion } from './components/overview-story';
import { ScenarioBrowser } from './components/scenario-browser';
import { AcwmMetricEvidence } from './components/acwm-metric-evidence';
import { VlaWamMetricEvidence } from './components/vla-wam-metric-evidence';
import { metricExplanationFor, type BilingualText } from './data/metric-explanations';
import { tracks, type TrackId } from './data/metric-plan';
import { definitionFor, readResult, type MetricSelection } from './data/track-results';
import { say, STATIC_SITE } from './static-site';

type Page = 'Overview' | 'Leaderboards' | 'Datasets';
const navigation: Page[] = ['Overview', 'Leaderboards', 'Datasets'];
type View = { page: Page; track: TrackId };

// The static build prerenders one page, so links like /?track=T2 or /?task=… are read in the browser
// (the server snapshot is empty, so hydration matches the prerendered HTML).
const noSubscription = () => () => {};
const browserSearch = () => STATIC_SITE ? window.location.search : '';
function linkedView(search: string): View | null {
  const params = new URLSearchParams(search);
  const task = params.get('task');
  if (task && /^[A-Za-z0-9_+-]{1,128}$/.test(task)) return { page: 'Datasets', track: 'T1' };
  if (params.get('source') === 'real') return { page: 'Datasets', track: 'T1' };
  if (params.get('track') === 'T2') return { page: 'Leaderboards', track: 'T2' };
  return null;
}

export default function DashboardClient({ initialPage = 'Overview', initialTrack = 'T1' }: { initialPage?: Page; initialTrack?: TrackId } = {}) {
  const search = useSyncExternalStore(noSubscription, browserSearch, () => '');
  const [chosen, setChosen] = useState<View | null>(null);
  const { page, track } = chosen ?? linkedView(search) ?? { page: initialPage, track: initialTrack };
  const [detail, setDetail] = useState<MetricSelection | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useNavGlider(navRef, page);
  function navigate(next: Page, nextTrack: TrackId = 'T1') {
    setDetail(null); setChosen({ page: next, track: nextTrack });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  /** Overview clips open their episode in Datasets and start playing (read by the dataset browser). */
  function openDataset(params: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const key of ['task', 'source', 'dataset', 'play', 'episode', 'track']) url.searchParams.delete(key);
    for (const [key, value] of Object.entries({ ...params, play: '1' })) url.searchParams.set(key, value);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    navigate('Datasets');
  }
  return <div className="researchShell">
    <SpotlightLayer/>
    <a className="skipLink" href="#main-content">Skip to content</a>
    <header className={`researchNav ${page === 'Overview' ? 'onHero' : ''}`}>
      <button type="button" className="researchBrand" onClick={() => navigate('Overview')} aria-label="RoboExam home"><img src="/brand/roboexam-logo.png" alt="RoboExam" width={900} height={163}/></button>
      <nav ref={navRef} aria-label="Primary navigation" className="navPills"><span className="navGlider" aria-hidden="true"/>{navigation.map(item => <button key={item} type="button" className={`researchNavItem ${page === item ? 'active' : ''}`} aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{item}</button>)}</nav>
      {!STATIC_SITE && <a className="navAction" href="/review"><span aria-hidden="true"><ArrowUpRight size={16}/></span>Review</a>}
    </header>
    <main id="main-content" className="researchMain">
      {page === 'Overview' && <>
        <HeroStage onLeaderboards={nextTrack => navigate('Leaderboards', nextTrack)} onDatasets={() => navigate('Datasets')}/>
        {/* the manuscript's order: why RoboExam → benchmark → hybrid agent → findings → explore */}
        <div className="content researchOverview">
          <OverviewQuestion/>
          <OverviewBenchmark onTrack={nextTrack => navigate('Leaderboards', nextTrack)} onOpenTask={task => openDataset({ task })}/>
          <OverviewHybrid/>
          <OverviewFindings/>
          <OverviewExplore onLeaderboards={() => navigate('Leaderboards')} onDatasets={() => navigate('Datasets')}/>
          <HomeDemos onOpenClip={hint => openDataset(hint ? { source: 'real', dataset: hint } : { source: 'real' })}/>
        </div>
      </>}
      {page === 'Leaderboards' && <LeaderboardView key={track} initialTrack={track} onMetric={setDetail}/>}
      {page === 'Datasets' && <div className="content datasetView"><div className="pageHeading datasetPageHeading"><p className="eyebrow">DATA LIBRARY</p><h1>Datasets</h1><p>Browse simulation, real-robot, and egocentric records in one workspace.</p></div><ScenarioBrowser/></div>}
    </main>
    <footer className="researchFooter"><div><img src="/brand/roboexam-mark-64.png" alt="" width={32} height={32}/><strong>RoboExam</strong>{!STATIC_SITE && <span>Planned CVPR 2027 Workshop</span>}</div></footer>
    {detail && <MetricDetail key={`${detail.trackId}:${detail.mode}:${detail.metricId}:${detail.modelId}:${detail.taskId ?? ''}:${readResult(detail).version ?? 'pending'}`} selection={detail} onClose={() => setDetail(null)}/>}
  </div>;
}

function MetricDetail({ selection, onClose }: { selection: MetricSelection; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [modelId, setModelId] = useState(selection.modelId);
  const [tab, setTab] = useState<'definition' | 'evidence'>(() => readResult(selection).available ? 'evidence' : 'definition');
  const current = { ...selection, modelId };
  const result = readResult(current);
  const info = definitionFor(current);
  const explanation = metricExplanationFor(selection.trackId, selection.metricId, info);
  const track = tracks.find(t => t.id === selection.trackId)!;
  useEffect(() => {
    const node = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    node.showModal(); document.body.style.overflow = 'hidden';
    return () => { node.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className="metricDialog" aria-labelledby="metric-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="drawerTop"><div><p className="eyebrow">{selection.trackId} · {selection.mode === 'history' ? 'HISTORICAL PROTOCOL' : 'METRIC DEFINITION'}</p><h2 id="metric-title">{info.name}</h2><p className="metricIdentifier">{selection.metricId}</p></div><button type="button" className="closeDialog" onClick={onClose} aria-label="Close metric detail"><X size={23}/></button></div>
    <div className="metricContext"><label>Model<select value={modelId} onChange={e => setModelId(e.target.value)} aria-label="Metric model">{track.models.map(m => <option key={m.id}>{m.id}</option>)}</select></label><div className="metricResult"><strong>{result.primary}</strong><span>{result.available ? result.detail : `${result.status} · ${result.detail}`}</span></div></div>
    <nav className="detailTabs" aria-label="Metric details">{(['definition','evidence'] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'definition' ? say('Definition', 'Definition · 分数定义') : say('Run & evidence', 'Run & evidence · 运行证据')}</button>)}</nav>
    {tab === 'definition' ? <div className="definitionGrid"><BilingualDetailBlock title={say('What it measures', 'What it measures · 指标说明')} text={explanation.definition}/><BilingualDetailBlock title={say('Input', 'Input · 输入')} text={explanation.input}/><BilingualDetailBlock title={say('Output', 'Output · 输出')} text={explanation.output}/><DetailBlock title={say('Scoring rule', 'Scoring rule · 评分公式')} text={info.formula} formula/>{info.caveat && <DetailBlock title={say('Interpretation', 'Interpretation · 解读')} text={info.caveat}/>}<DetailBlock title={say('Source', 'Source · 来源')} text={info.source ?? 'RoboExam metric plan'}/></div> : <div className="metricEvidencePanel" key={`${selection.trackId}:${modelId}:${result.version}:${selection.mode}:${selection.metricId}`}>
      {result.version ? <><div className="runProvenance"><DetailBlock title="Result version" text={result.version}/><DetailBlock title="Protocol" text={result.protocol!}/></div>
        {selection.trackId === 'T2' && selection.mode === 'history' && <AcwmMetricEvidence id={selection.metricId} model={modelId} formula={info.formula}/>}
        {selection.trackId === 'T3' && <VlaWamMetricEvidence key={`${modelId}:${selection.taskId}:${selection.setting}:${selection.metricId}`} id={selection.metricId} model={modelId} formula={info.formula} taskId={selection.taskId} setting={selection.setting === 'visual' || selection.setting === 'semantic' || selection.setting === 'behavioral' ? selection.setting : 'id'}/>}
      </> : <div className="pendingEvidence"><strong>No recorded run for this selection</strong><p>{result.detail}</p></div>}
    </div>}
  </dialog>;
}
function DetailBlock({ title, text, formula = false }: { title: string; text: string; formula?: boolean }) {
  return <section className="detailBlock"><h3>{title}</h3><p className={formula ? 'formula' : ''}>{text}</p></section>;
}
function BilingualDetailBlock({ title, text }: { title: string; text: BilingualText }) {
  return <section className="detailBlock bilingualDetail"><h3>{title}</h3><p lang="en">{text.en}</p>{!STATIC_SITE && <p lang="zh-CN">{text.zh}</p>}</section>;
}
