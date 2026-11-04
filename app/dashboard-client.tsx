"use client";

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LeaderboardView } from './components/leaderboard-view';
import { AcwmMetricEvidence } from './components/acwm-metric-evidence';
import { VlaWamMetricEvidence } from './components/vla-wam-metric-evidence';
import { metricExplanationFor, type BilingualText } from './data/metric-explanations';
import { tracks, type TrackId } from './data/metric-plan';
import { definitionFor, readResult, type MetricSelection } from './data/track-results';

export default function DashboardClient({ initialTrack = 'T1' }: { initialTrack?: TrackId } = {}) {
  const [detail, setDetail] = useState<MetricSelection | null>(null);
  return <>
    <LeaderboardView initialTrack={initialTrack} onMetric={setDetail}/>
    {detail && <MetricDetail key={`${detail.trackId}:${detail.mode}:${detail.metricId}:${detail.modelId}:${detail.taskId ?? ''}:${readResult(detail).version ?? 'pending'}`} selection={detail} onClose={() => setDetail(null)}/>}
  </>;
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
    <nav className="detailTabs" aria-label="Metric details">{(['definition','evidence'] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'definition' ? 'Definition · 分数定义' : 'Run & evidence · 运行证据'}</button>)}</nav>
    {tab === 'definition' ? <div className="definitionGrid"><BilingualDetailBlock title="What it measures · 指标说明" text={explanation.definition}/><BilingualDetailBlock title="Input · 输入" text={explanation.input}/><BilingualDetailBlock title="Output · 输出" text={explanation.output}/><DetailBlock title="Scoring rule · 评分公式" text={info.formula} formula/>{info.caveat && <DetailBlock title="Interpretation · 解读" text={info.caveat}/>}<DetailBlock title="Source · 来源" text={info.source ?? 'RoboExam metric plan'}/></div> : <div className="metricEvidencePanel" key={`${selection.trackId}:${modelId}:${result.version}:${selection.mode}:${selection.metricId}`}>
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
  return <section className="detailBlock bilingualDetail"><h3>{title}</h3><p lang="en">{text.en}</p><p lang="zh-CN">{text.zh}</p></section>;
}
