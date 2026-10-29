import { MetricOnlyMatrix } from "./pearson-matrix-section";
import { tracks, type TrackId } from "../data/metric-plan";
import {
  type CurrentCorrelationMetric,
  trackCorrelationResults,
} from "../data/track-correlation-results";

const trackScope: Record<TrackId, string> = {
  T1: "140 episodes · subtask target",
  T2: "2 × heldout73 · metric-only",
  T3: "2 × formal100 · success target",
  T4: "Hardware results pending",
};

function TrackNav({ active, onChange }: { active: TrackId; onChange: (track: TrackId) => void }) {
  return <section className="correlationTrackNav band" aria-label="Correlation track">
    {tracks.map((track) => <button type="button" key={track.id} className={active === track.id ? "selected" : ""} aria-pressed={active === track.id} onClick={() => onChange(track.id)}>
      <span>{track.id}</span><strong>{track.title}</strong><small>{trackScope[track.id]}</small>
    </button>)}
  </section>;
}

function CorrelationBar({ metric }: { metric: CurrentCorrelationMetric }) {
  const width = `${Math.min(Math.abs(metric.r), 1) * 50}%`;
  const style = metric.r >= 0 ? { left: "50%", width } : { right: "50%", width };
  return <article className="corrRow" aria-label={`${metric.displayName} r ${metric.r.toFixed(3)}`}>
    <div className="corrMetric"><strong>{metric.displayName}</strong><code>{metric.metricId}</code></div>
    <div className="corrPlot"><i className="corrZero"/><span className={metric.r >= 0 ? "corrFill positive" : "corrFill negative"} style={style}/></div>
    <div className="corrNumbers"><strong>{metric.r > 0 ? "+" : ""}{metric.r.toFixed(3)}</strong><span>n={metric.sampleCount}</span></div>
    <div className="corrMeta"><span>{metric.r >= 0 ? "Positive association" : "Negative association"}</span></div>
  </article>;
}

function Track1() {
  const result = trackCorrelationResults.T1;
  return <section className="pearsonMatrix band" aria-labelledby="t1-current-correlation">
    <header className="pearsonMatrixHeading">
      <div><p className="eyebrow">T1 · CURRENT LEADERBOARD COHORT</p><h2 id="t1-current-correlation">VQA dimensions ↔ episode subtask completion</h2><p>Each model is analyzed separately on its current 70-scene leaderboard cohort. Overall, Subtask, and Success are excluded from predictors to avoid outcome leakage.</p></div>
      <div className="pearsonMatrixMeta"><span><strong>Result version</strong> {result.resultVersion}</span></div>
    </header>
    <div className="currentCorrelationModels">
      {result.models.map((model) => <article key={model.modelId}>
        <header><div><strong>{model.displayName}</strong><span>{model.episodeCount} episodes · {model.strictSuccessCount} strict success</span></div><small>target: Subtask</small></header>
        <div>{model.metrics.map((metric) => <CorrelationBar metric={metric} key={metric.metricId}/>)}</div>
        <footer>Descriptive Pearson r · up to n={model.episodeCount}; each row shows its paired valid count. Association is not causation.</footer>
      </article>)}
    </div>
    <div className="currentCorrelationNotice"><strong>Why strict Success is not the target</strong><p>{result.strictSuccessReason}</p></div>
  </section>;
}

function Track2() {
  const result = trackCorrelationResults.T2;
  return <section className="pearsonMatrix band" aria-labelledby="t2-current-correlation">
    <div className="pearsonMatrixHeading">
      <div><p className="eyebrow">T2 · CURRENT LEADERBOARD RESULTS</p><h2 id="t2-current-correlation">Metric redundancy on the published heldout73 cohort</h2><p>The matrices are derived directly from the current per-episode ACWM samples. They compare metrics with each other; no policy-success relationship is implied.</p></div>
      <div className="pearsonMatrixMeta">{Object.entries(result.resultVersions).map(([model, version]) => <span key={model}><strong>{model}</strong> {version}</span>)}</div>
    </div>
    <div className="metricMatrixGrid currentMatrixGrid">
      {result.matrices.map((matrix) => <MetricOnlyMatrix matrix={matrix} key={matrix.modelId}/>)}
    </div>
    <div className="currentCorrelationNotice"><strong>Outcome boundary</strong><p>{result.reason}</p></div>
  </section>;
}

function Track4() {
  const result = trackCorrelationResults.T4;
  return <section className="pearsonMatrix band" aria-labelledby="t4-current-correlation">
    <div className="pearsonMatrixHeading">
      <div><p className="eyebrow">T4 · HARDWARE EVIDENCE</p><h2 id="t4-current-correlation">Correlation will open after formal paired trials</h2><p>{result.reason} Training status alone is not evaluation evidence, so the dashboard does not manufacture coefficients from planned runs.</p></div>
      <div className="pearsonMatrixMeta">{result.models.map((model) => <span key={model.id}><strong>{model.id}</strong> {model.status}</span>)}</div>
    </div>
  </section>;
}

export function TrackCorrelationOverview({ active, onChange }: { active: TrackId; onChange: (track: TrackId) => void }) {
  return <>
    <TrackNav active={active} onChange={onChange}/>
    {active === "T1" && <Track1/>}
    {active === "T2" && <Track2/>}
    {active === "T4" && <Track4/>}
  </>;
}
