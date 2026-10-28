"use client";

import { ArrowRight, ArrowUpRight, Bot, Eye, GitBranch, Globe, MemoryStick, ShieldCheck, Telescope, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LeaderboardView } from './components/leaderboard-view';
import { ScenarioBrowser } from './components/scenario-browser';
import { ExplainabilityView } from './components/explainability-view';
import { AcwmMetricEvidence } from './components/acwm-metric-evidence';
import { VlaWamMetricEvidence } from './components/vla-wam-metric-evidence';
import { l1Phase1ProvisionalBundle } from './data/l1-phase1-provisional';
import { tracks, type TrackId } from './data/metric-plan';
import { scenarioTags } from './data/scenario-plan';
import { definitionFor, readResult, type MetricSelection } from './data/track-results';

type Page = 'Overview' | 'Leaderboards' | 'Datasets' | 'Correlation';
const navigation: Page[] = ['Overview', 'Leaderboards', 'Datasets', 'Correlation'];
const capabilities = [
  { id: 'C1', title: 'State Grounding', layer: 'Current-state understanding', question: 'Does the model know what is present, where it is, its state, and the task goal?', Icon: Eye },
  { id: 'C2', title: 'Task Memory', layer: 'History and task-state retention', question: 'Does it retain past observations, completed steps, occluded targets, and ordering rules?', Icon: MemoryStick },
  { id: 'C3', title: 'Predictive Imagination', layer: 'Future prediction', question: 'Can it predict the future state under no action or under candidate actions?', Icon: Telescope },
  { id: 'C4', title: 'Action–Effect Reasoning', layer: 'Action causality', question: 'Does it know which action advances the task—and which action will fail?', Icon: GitBranch },
  { id: 'C5', title: 'Closed-Loop Execution', layer: 'Action generation and execution', question: 'Can it generate executable actions and complete the task under feedback?', Icon: Bot },
  { id: 'C6', title: 'Recovery & Safety', layer: 'Failure detection and recovery', question: 'Can it detect deviation, avoid repeated errors, and recover the task safely?', Icon: ShieldCheck },
  { id: 'C7', title: 'Generalization', layer: 'Transfer beyond training', question: 'Can it handle novel objects, layouts, compositions, instructions, and failure states?', Icon: Globe },
] as const;
type CapabilityId = (typeof capabilities)[number]['id'];
const trackSummaries: Record<TrackId, string> = {
  T1: 'Compare diverse VLM agents under one harness, from grounding and task memory to planning and next-action generation.',
  T2: 'Test future prediction, physical response, and intervention outcomes under candidate actions.',
  T3: 'Test long-horizon completion, stable control, memory, recovery, and safety in simulation.',
  T4: 'Validate task completion, recovery, and safety on standardized real-robot trials.',
};
const trackCapabilityTargets: Record<TrackId, string[]> = {
  T1: ['C1', 'C2', 'C3', 'C4'],
  T2: ['C3', 'C4', 'C7'],
  T3: ['C1', 'C2', 'C5', 'C6', 'C7'],
  T4: ['C5', 'C6', 'C7'],
};

export default function DashboardClient({ initialPage = 'Overview', initialTrack = 'T1' }: { initialPage?: Page; initialTrack?: TrackId } = {}) {
  const [page, setPage] = useState<Page>(initialPage);
  const [track, setTrack] = useState<TrackId>(initialTrack);
  const [activeCapability, setActiveCapability] = useState<CapabilityId>('C1');
  const [detail, setDetail] = useState<MetricSelection | null>(null);
  function navigate(next: Page, nextTrack: TrackId = 'T1') {
    setDetail(null); setTrack(nextTrack); setPage(next);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  return <div className="researchShell">
    <a className="skipLink" href="#main-content">Skip to content</a>
    <header className="researchNav">
      <button type="button" className="researchBrand" onClick={() => navigate('Overview')} aria-label="RoboExam home"><span className="brandGlyph" aria-hidden="true">r<span>.</span></span>RoboExam</button>
      <nav aria-label="Primary navigation">{navigation.map(item => <button key={item} type="button" className={`researchNavItem ${page === item ? 'active' : ''}`} aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{item}</button>)}<a className="researchNavItem" href="/review">Review</a></nav>
    </header>
    <main id="main-content" className="researchMain">
      {page === 'Overview' && <div className="content researchOverview">
        <section className="researchHero" aria-labelledby="hero-title">
          <div className="heroCopy">
            <p className="workshopBadge"><span/>Planned CVPR 2027 Workshop · In development</p>
            <p className="heroEyebrow">The final exam for Physical AI</p>
            <h1 id="hero-title">RoboExam</h1>
            <div className="heroMaxim">
              <strong lang="en">{"“You just can't differentiate between a robot and the very best of humans.”"}</strong>
              <cite>Isaac Asimov（艾萨克·阿西莫夫）· I, Robot（《我，机器人》）· 1950</cite>
            </div>
            <div className="heroActions"><button type="button" className="primaryAction" onClick={() => navigate('Leaderboards')}>Explore leaderboards <ArrowRight size={19}/></button><button type="button" className="secondaryAction" onClick={() => navigate('Datasets')}>Explore datasets <ArrowUpRight size={18}/></button></div>
          </div>
          <CapabilitySpectrum onCapability={setActiveCapability}/>
        </section>
        <CapabilityTrackFlow activeId={activeCapability} onCapability={setActiveCapability} onTrack={nextTrack => navigate('Leaderboards', nextTrack)}/>
      </div>}
      {page === 'Leaderboards' && <LeaderboardView key={track} initialTrack={track} onMetric={setDetail}/>}
      {page === 'Datasets' && <div className="content datasetView"><div className="pageHeading datasetPageHeading"><p className="eyebrow">DATA LIBRARY</p><h1>Datasets</h1><p>Browse simulation, real-robot, and egocentric records in one workspace.</p></div><ScenarioBrowser/></div>}
      {page === 'Correlation' && <ExplainabilityView/>}
    </main>
    <footer className="researchFooter"><div><strong>RoboExam</strong><span>Planned CVPR 2027 Workshop</span></div></footer>
    {detail && <MetricDetail key={`${detail.trackId}:${detail.mode}:${detail.metricId}:${detail.modelId}:${detail.taskId ?? ''}:${readResult(detail).version ?? 'pending'}`} selection={detail} onClose={() => setDetail(null)}/>}
  </div>;
}

function CapabilitySpectrum({ onCapability }: { onCapability: (capability: CapabilityId) => void }) {
  return <figure className="capabilitySpectrum" aria-labelledby="spectrum-title">
    <div className="spectrumHeader"><span>Seven capabilities across embodiments</span><strong id="spectrum-title">Manipulation · Humanoid</strong></div>
    <div className="spectrumStage">
      <svg viewBox="0 0 600 430" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="spectrum-line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#75a7ff"/><stop offset=".5" stopColor="#75ead1"/><stop offset="1" stopColor="#c096ff"/></linearGradient>
          <linearGradient id="robot-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#82b8ff"/><stop offset="1" stopColor="#5ee0c8"/></linearGradient>
          <radialGradient id="left-glow"><stop stopColor="#5e9dff" stopOpacity=".24"/><stop offset="1" stopColor="#5e9dff" stopOpacity="0"/></radialGradient>
          <radialGradient id="right-glow"><stop stopColor="#a27dff" stopOpacity=".22"/><stop offset="1" stopColor="#a27dff" stopOpacity="0"/></radialGradient>
          <pattern id="embodiment-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#fff" strokeOpacity=".035"/></pattern>
        </defs>
        <rect width="600" height="430" fill="url(#embodiment-grid)"/>
        <circle cx="185" cy="278" r="150" fill="url(#left-glow)"/>
        <circle cx="430" cy="270" r="155" fill="url(#right-glow)"/>
        <path className="spectrumOrbit" stroke="url(#spectrum-line)" d="M38 314C65 62 535 62 562 314"/>
        <path className="spectrumOrbit spectrumOrbitInner" d="M86 326C128 142 472 142 514 326"/>
        <path className="embodimentBridge" d="M258 276C286 255 314 255 342 276"/>
        <path className="spectrumHorizon" d="M34 352H566"/>
        <g className="robotArmFigure">
          <rect x="91" y="326" width="150" height="18" rx="9"/>
          <path d="M126 326V292H168V326"/>
          <path className="robotArmShadow" d="M147 292L174 246L228 207L269 252"/>
          <path className="robotArmLink" d="M147 292L174 246L228 207L269 252"/>
          <circle cx="147" cy="292" r="15"/><circle cx="174" cy="246" r="14"/><circle cx="228" cy="207" r="13"/>
          <path className="robotGripper" d="M269 252L285 266M269 252L286 243M285 266L294 262M286 243L295 248"/>
          <rect className="robotObject" x="296" y="274" width="42" height="42" rx="7"/>
        </g>
        <g className="humanoidFigure">
          <circle cx="438" cy="184" r="25"/>
          <path className="humanoidTorso" d="M407 225Q438 209 469 225L477 287Q438 309 399 287Z"/>
          <path d="M406 236L371 267L383 309M470 236L505 267L493 309M421 297L407 356M455 297L469 356"/>
          <circle cx="407" cy="225" r="7"/><circle cx="469" cy="225" r="7"/>
          <circle cx="383" cy="309" r="7"/><circle cx="493" cy="309" r="7"/>
          <path className="humanoidFoot" d="M407 356H389M469 356H487"/>
          <path className="humanoidFace" d="M429 184H434M442 184H447"/>
        </g>
      </svg>
      <div className="embodimentLabel embodimentLabelArm"><strong>Manipulation</strong><span>robot systems</span></div>
      <div className="embodimentLabel embodimentLabelHumanoid"><strong>Humanoid</strong><span>whole-body systems</span></div>
      <ol>{capabilities.map(capability => <li key={capability.id}><a href={`#capability-${capability.id.toLowerCase()}`} onClick={() => onCapability(capability.id)}><span>{capability.id}</span><strong>{capability.title}</strong></a></li>)}</ol>
    </div>
  </figure>;
}

function CapabilityTrackFlow({ activeId, onCapability, onTrack }: { activeId: CapabilityId; onCapability: (capability: CapabilityId) => void; onTrack: (track: TrackId) => void }) {
  const activeCapability = capabilities.find(capability => capability.id === activeId)!;
  const sourceX = [100, 300, 500, 700, 900, 1100, 1300];
  const branchPaths = [
    'M250 58 C250 112 175 112 175 180',
    'M550 58 C550 112 525 112 525 180',
    'M850 58 C850 112 875 112 875 180',
    'M1150 58 C1150 112 1225 112 1225 180',
  ];
  return <section className="capabilityFlow" aria-labelledby="capability-flow-title">
    <div className="sectionHeading">
      <div><p className="eyebrow">The RoboExam evaluation spectrum</p><h2 id="capability-flow-title">From model capabilities to task-level evidence.</h2></div>
      <p>Seven capabilities connect to four model exams, a shared task registry, and matched ID, OOD, and Recovery conditions. Select a capability to trace its evidence.</p>
    </div>
    <div className="flowSurface">
      <div className="flowQuestion" aria-live="polite"><span>{activeCapability.id}</span><strong>{activeCapability.title}</strong><p>{activeCapability.question}</p></div>
      <div className="flowCapabilities" aria-label="Physical AI capabilities">
        {capabilities.map(({ Icon, ...capability }) => <button id={`capability-${capability.id.toLowerCase()}`} type="button" className={activeId === capability.id ? 'active' : ''} aria-pressed={activeId === capability.id} onClick={() => onCapability(capability.id)} key={capability.id}>
          <span className="flowCapabilityTop"><b>{capability.id}</b><span aria-hidden="true"><Icon size={19} strokeWidth={1.7}/></span></span>
          <strong>{capability.title}</strong>
          <small>{capability.layer}</small>
        </button>)}
      </div>
      <div className="flowConduits" aria-hidden="true">
        <svg viewBox="0 0 1400 180" preserveAspectRatio="none">
          <path className="flowBus" d="M100 58H1300"/>
          {sourceX.map((x, index) => <path key={x} className={`flowSource ${capabilities[index].id === activeId ? 'active' : ''}`} d={`M${x} 0V58`}/>)}
          {branchPaths.map((path, index) => {
            const target = tracks[index];
            const active = trackCapabilityTargets[target.id].includes(activeId);
            return <path key={target.id} className={`flowBranch ${active ? 'active' : ''}`} d={path}/>;
          })}
          <circle className="flowHub" cx="700" cy="58" r="6"/>
        </svg>
      </div>
      <div className="flowTracks" aria-label={`Tracks connected to ${activeCapability.title}`}>
        {tracks.map(track => {
          const supportsActive = trackCapabilityTargets[track.id].includes(activeId);
          return <button type="button" key={track.id} className={`flowTrack flowTrack${track.id} ${supportsActive ? 'supportsActive' : ''}`} onClick={() => onTrack(track.id)}>
            <span className="flowTrackTop"><b>{track.id}</b><ArrowUpRight size={19}/></span>
            <strong>{track.title}</strong>
            <p>{trackSummaries[track.id]}</p>
            <span className="flowTargetList">{trackCapabilityTargets[track.id].map(capability => <i className={capability === activeId ? 'active' : ''} key={capability}>{capability}</i>)}</span>
          </button>;
        })}
      </div>
      <div className="flowEvidenceRail">
        <div className="flowEvidenceLabel"><strong>Shared task evidence</strong><span>Each task can carry multiple requirement tags.</span></div>
        <div className="flowScenarioTags">{Object.entries(scenarioTags).map(([tag, definition]) => <span key={tag}><b>{tag}</b>{definition.label}</span>)}</div>
        <div className="flowRegimes"><span>ID</span><span>Visual OOD</span><span>Semantic OOD</span><span>Behavioral OOD</span><span>Recovery</span></div>
      </div>
    </div>
  </section>;
}

function MetricDetail({ selection, onClose }: { selection: MetricSelection; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [modelId, setModelId] = useState(selection.modelId);
  const [tab, setTab] = useState<'definition' | 'evidence'>(() => readResult(selection).available ? 'evidence' : 'definition');
  const current = { ...selection, modelId };
  const result = readResult(current);
  const info = definitionFor(current);
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
    <nav className="detailTabs" aria-label="Metric details">{(['definition','evidence'] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'definition' ? 'Definition · 分数定义' : 'Run & evidence · 运行证据'}</button>)}</nav>
    {tab === 'definition' ? <div className="definitionGrid"><DetailBlock title="What it measures" text={info.definition}/><DetailBlock title="Scoring rule" text={info.formula} formula/><DetailBlock title="Direction & unit" text={`${info.direction} · ${info.unit}`}/><DetailBlock title="Required evidence" text={info.evidence}/>{info.caveat && <DetailBlock title="Interpretation" text={info.caveat}/>}<DetailBlock title="Source" text={info.source ?? 'RoboExam metric plan'}/></div> : <div className="metricEvidencePanel" key={`${selection.trackId}:${modelId}:${result.version}:${selection.mode}:${selection.metricId}`}>
      {result.version ? <><div className="runProvenance"><DetailBlock title="Result version" text={result.version}/><DetailBlock title="Protocol" text={result.protocol!}/></div>
        {selection.trackId === 'T1' && selection.mode === 'history' && <PilotEvidence metricId={selection.metricId}/>}
        {selection.trackId === 'T2' && selection.mode === 'history' && <AcwmMetricEvidence id={selection.metricId} model={modelId} formula={info.formula}/>}
        {selection.trackId === 'T3' && <VlaWamMetricEvidence key={`${modelId}:${selection.taskId}:${selection.metricId}`} id={selection.metricId} model={modelId} formula={info.formula} taskId={selection.taskId}/>}
      </> : <div className="pendingEvidence"><strong>No recorded run for this selection</strong><p>{result.detail}</p></div>}
    </div>}
  </dialog>;
}
function DetailBlock({ title, text, formula = false }: { title: string; text: string; formula?: boolean }) {
  return <section className="detailBlock"><h3>{title}</h3><p className={formula ? 'formula' : ''}>{text}</p></section>;
}
function PilotEvidence({ metricId }: { metricId: string }) {
  const bundle = l1Phase1ProvisionalBundle;
  const sample = bundle.examples.find(e => e.canonicalSampleId === bundle.exampleByMetricId[metricId] && e.metricMemberships.includes(metricId));
  return <section className="pilotEvidence"><p>This is a provisional development pilot. Human GT review is pending; no generalization claim is made.</p><DetailBlock title="Prediction SHA-256" text={bundle.run.predictionSha256}/><DetailBlock title="Semantic judge" text={bundle.run.judgeModel}/>{sample && <><DetailBlock title="Sample ID" text={sample.canonicalSampleId}/><DetailBlock title="Question" text={sample.question}/><div className="pilotFrames">{sample.media.map(m => <PilotFrame key={m.sha256} url={m.url} frame={m.frameIndex} camera={sample.camera}/>)}</div></>}</section>;
}

function PilotFrame({ url, frame, camera }: { url: string; frame: number; camera: string }) {
  const [unavailable, setUnavailable] = useState(false);
  return <figure>{unavailable ? <div className="pendingEvidence"><p>Input frame unavailable in this checkout.</p></div> : <img src={url} alt={`Pilot input frame ${frame}`} loading="lazy" onError={() => setUnavailable(true)}/>}<figcaption>Input frame {frame} · {camera}</figcaption></figure>;
}
