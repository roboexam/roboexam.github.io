"use client";

import { ArrowLeftRight, CheckCircle2, Info, ShieldCheck, Target } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { MetricOnlyMatrix } from "./pearson-matrix-section";
import {
  type CorrelationRow,
  explainabilityDashboardBundle,
} from "../data/explainability-results";
import { tracks, type TrackId } from "../data/metric-plan";
import {
  type CurrentCorrelationMetric,
  trackCorrelationResults,
} from "../data/track-correlation-results";
import { vlaWamDashboardBundle } from "../data/vla-wam-results";

const modelNames = ["Pi0.5", "FastWAM"] as const;
type ModelName = (typeof modelNames)[number];
type AnalysisWindow = "preOutcome" | "fullEpisode";

const windowCopy: Record<AnalysisWindow, { label: string; note: string }> = {
  preOutcome: {
    label: "First 250 steps",
    note: "All observations occur before the success checker, reducing early-stop confounding.",
  },
  fullEpisode: {
    label: "Full episode",
    note: "Useful for post-rollout outcome review; totals still reflect early termination and task stage.",
  },
};

const metricDisplayNames: Record<string, string> = {
  "left.ee_sparc": "Left EE smoothness (L-SPARC)",
  "right.ee_sparc": "Right EE smoothness (R-SPARC)",
  "left.ee_path_length_m": "Left EE path length",
  "right.ee_path_length_m": "Right EE path length",
  "left.ee_speed_mean_m_s": "Left EE mean speed",
  "right.ee_speed_mean_m_s": "Right EE mean speed",
  "left.joint_path_length_rad": "Left joint path length",
  "right.joint_path_length_rad": "Right joint path length",
  "left.orientation_path_length_rad": "Left orientation path length",
  "right.orientation_path_length_rad": "Right orientation path length",
  "total.joint_path_length_rad": "Total joint path length",
  "total.orientation_path_length_rad": "Total orientation path length",
};

function displayMetricName(row: CorrelationRow) {
  const metricId = row.metricId.replace("pre_outcome.", "");
  return metricDisplayNames[metricId] ?? row.label.replace("Pre-outcome ", "");
}

function metricList(rows: CorrelationRow[]) {
  return rows.map(displayMetricName).join("、");
}

function ChartExplanation({ title, children }: { title: string; children: ReactNode }) {
  return <div className="chartExplanation"><strong>{title}</strong><p>{children}</p></div>;
}

function formatQ(value: number | null) {
  if (value === null) return "N/A";
  if (value < 0.0001) return value.toExponential(2);
  return value.toFixed(4);
}

function formatValue(value: number | null) {
  if (value === null) return "N/A";
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function alignment(row: CorrelationRow) {
  if (row.r === null || row.direction === "neutral") return "Report raw direction only";
  if ((row.direction === "higher" && row.r > 0) || (row.direction === "lower" && row.r < 0)) {
    return "Aligned with the metric direction";
  }
  return "Opposite to the metric direction";
}

function CorrelationBar({ row }: { row: CorrelationRow }) {
  const r = row.r ?? 0;
  const width = `${Math.min(Math.abs(r), 1) * 50}%`;
  const style = r >= 0 ? { left: "50%", width } : { right: "50%", width };
  return (
    <article className="corrRow" aria-label={`${row.label} r ${r.toFixed(3)}`}>
      <div className="corrMetric">
        <strong>{row.label.replace("Pre-outcome ", "")}</strong>
        <code>{row.metricId}</code>
      </div>
      <div className="corrPlot">
        <i className="corrZero" />
        <span className={r >= 0 ? "corrFill positive" : "corrFill negative"} style={style} />
      </div>
      <div className="corrNumbers">
        <strong>{r > 0 ? "+" : ""}{r.toFixed(3)}</strong>
        <span>q={formatQ(row.qValue)}</span>
      </div>
      <div className="corrMeta">
        <span>{r >= 0 ? "Positive association" : "Negative association"}</span>
        <span>{alignment(row)}</span>
        <small>95% CI [{row.ci95?.map((value) => value.toFixed(3)).join(", ")}]</small>
      </div>
    </article>
  );
}

const trackScope: Record<TrackId, string> = {
  T1: "140 episodes · subtask target",
  T2: "2 × heldout73 · metric-only",
  T3: "2 × formal100 · success target",
  T4: "Hardware results pending",
};

function CorrelationTrackNav({ active, onChange }: { active: TrackId; onChange: (track: TrackId) => void }) {
  return <section className="correlationTrackNav band" aria-label="Correlation track">
    {tracks.map((track) => <button type="button" key={track.id} className={active === track.id ? "selected" : ""} aria-pressed={active === track.id} onClick={() => onChange(track.id)}>
      <span>{track.id}</span><strong>{track.title}</strong><small>{trackScope[track.id]}</small>
    </button>)}
  </section>;
}

function CurrentCorrelationBar({ metric }: { metric: CurrentCorrelationMetric }) {
  const width = `${Math.min(Math.abs(metric.r), 1) * 50}%`;
  const style = metric.r >= 0 ? { left: "50%", width } : { right: "50%", width };
  return <article className="corrRow" aria-label={`${metric.displayName} r ${metric.r.toFixed(3)}`}>
    <div className="corrMetric"><strong>{metric.displayName}</strong><code>{metric.metricId}</code></div>
    <div className="corrPlot"><i className="corrZero"/><span className={metric.r >= 0 ? "corrFill positive" : "corrFill negative"} style={style}/></div>
    <div className="corrNumbers"><strong>{metric.r > 0 ? "+" : ""}{metric.r.toFixed(3)}</strong><span>n={metric.sampleCount}</span></div>
    <div className="corrMeta"><span>{metric.r >= 0 ? "Positive association" : "Negative association"}</span></div>
  </article>;
}

function Track1Correlation() {
  const result = trackCorrelationResults.T1;
  return <section className="pearsonMatrix band" aria-labelledby="t1-current-correlation">
    <header className="pearsonMatrixHeading">
      <div><p className="eyebrow">T1 · CURRENT LEADERBOARD COHORT</p><h2 id="t1-current-correlation">VQA dimensions ↔ episode subtask completion</h2><p>Each model is analyzed separately on its current 70-scene leaderboard cohort. Overall, Subtask, and Success are excluded from predictors to avoid outcome leakage.</p></div>
      <div className="pearsonMatrixMeta"><span><strong>Result version</strong> {result.resultVersion}</span></div>
    </header>
    <div className="currentCorrelationModels">
      {result.models.map((model) => <article key={model.modelId}>
        <header><div><strong>{model.displayName}</strong><span>{model.episodeCount} episodes · {model.strictSuccessCount} strict success</span></div><small>target: Subtask</small></header>
        <div>{model.metrics.map((metric) => <CurrentCorrelationBar metric={metric} key={metric.metricId}/>)}</div>
        <footer>Descriptive Pearson r · up to n={model.episodeCount}; each row shows its paired valid count. A positive value means the VQA dimension is higher in episodes with more completed subtasks; it is not a causal claim.</footer>
      </article>)}
    </div>
    <div className="currentCorrelationNotice"><strong>Why strict Success is not the target</strong><p>{result.strictSuccessReason}</p></div>
  </section>;
}

function Track2Correlation() {
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

function Track4Correlation() {
  const result = trackCorrelationResults.T4;
  return <section className="pearsonMatrix band" aria-labelledby="t4-current-correlation">
    <div className="pearsonMatrixHeading">
      <div><p className="eyebrow">T4 · HARDWARE EVIDENCE</p><h2 id="t4-current-correlation">Correlation will open after formal paired trials</h2><p>{result.reason} Training status alone is not evaluation evidence, so the dashboard does not manufacture coefficients from planned runs.</p></div>
      <div className="pearsonMatrixMeta">{result.models.map((model) => <span key={model.id}><strong>{model.id}</strong> {model.status}</span>)}</div>
    </div>
  </section>;
}

export function ExplainabilityView() {
  const [trackId, setTrackId] = useState<TrackId>("T1");
  const [modelName, setModelName] = useState<ModelName>("Pi0.5");
  const [window, setWindow] = useState<AnalysisWindow>("preOutcome");
  const [significantOnly, setSignificantOnly] = useState(true);
  const model = explainabilityDashboardBundle.models[modelName];
  const overviewModel = vlaWamDashboardBundle.models[modelName];
  const cohortAligned = overviewModel.provenance.inputManifestSha256 === model.provenance.inputManifestSha256;
  const rows = model.series[window];
  const visibleRows = useMemo(
    () => [...rows]
      .filter((row) => row.status === "computed" && (!significantOnly || row.significant))
      .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0)),
    [rows, significantOnly],
  );
  const significantRows = rows.filter((row) => row.significant);
  const positiveSignificant = significantRows.filter((row) => (row.r ?? 0) > 0);
  const negativeSignificant = significantRows.filter((row) => (row.r ?? 0) < 0);
  const strongest = visibleRows[0] ?? rows.find((row) => row.status === "computed");
  const eventSignal = model.series.events.find((row) => row.significant);
  const piFull = explainabilityDashboardBundle.models["Pi0.5"].series.fullEpisode;
  const fastFull = explainabilityDashboardBundle.models.FastWAM.series.fullEpisode;
  const repeatedNegative = piFull.filter((row) => row.significant && (row.r ?? 0) < 0 && fastFull.some((candidate) => candidate.metricId === row.metricId && candidate.significant && (candidate.r ?? 0) < 0));
  const piLeftSpeed = piFull.find((row) => row.metricId === "left.ee_speed_mean_m_s");
  const fastLeftSpeed = fastFull.find((row) => row.metricId === "left.ee_speed_mean_m_s");
  return (
    <div className="content explainabilityView">
      <div className="pageHeading">
        <p className="eyebrow">Leaderboard evidence</p>
        <h1>Correlation analysis</h1>
        <p>Track-specific analysis synchronized with the current published leaderboard cohorts. Correlations are shown only when paired episode-level evidence exists.</p>
      </div>
      <CorrelationTrackNav active={trackId} onChange={setTrackId}/>
      {trackId === "T1" && <Track1Correlation/>}
      {trackId === "T2" && <Track2Correlation/>}
      {trackId === "T4" && <Track4Correlation/>}
      {trackId === "T3" && <>
      <section className="explainHero band">
        <div className="explainIntro">
          <p className="eyebrow">T3 · CURRENT LEADERBOARD COHORT</p>
          <h2>Metrics <ArrowLeftRight size={22} aria-hidden="true" /> Task Success</h2>
          <p>Which episode-level metrics move with strict task success? The page reports raw association direction, confidence intervals, and multiple-testing results; association is not causation.</p>
        </div>
        <div className="modelSwitch" aria-label="Correlation analysis model">
          <span>Analysis model</span>
          {modelNames.map((name) => (
            <button key={name} type="button" className={modelName === name ? "selected" : ""} onClick={() => setModelName(name)}>
              <strong>{name}</strong><small>{explainabilityDashboardBundle.models[name].family}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="explainStats" aria-label={`${modelName} analysis cohort`}>
        <article className="primaryStat"><span>Strict success rate</span><strong>{(model.cohort.successRate * 100).toFixed(2)}%</strong><small>{model.cohort.success} success / {model.cohort.episodes} episodes</small></article>
        <article><span>Outcome split</span><strong>{model.cohort.success} / {model.cohort.partial} / {model.cohort.failure}</strong><small>success / half-success / failure</small></article>
        <article><span>Analysis N</span><strong>{model.cohort.uniqueSeeds}</strong><small>distinct seeds · no duplicate</small></article>
        <article><span>Statistical gate</span><strong>q &lt; 0.05</strong><small>20,000 bootstrap · BH FDR</small></article>
      </section>

      <section className="cohortAlignment band">
        <CheckCircle2 size={18} aria-hidden="true" />
        <div><strong>{cohortAligned ? "Same frozen cohort as the overview" : "Cohort versions differ"}</strong><p>The correlation input manifest is {modelName} the current overview result{cohortAligned ? "aligned" : "different"}；This page uses result version <code>{model.resultVersion}</code>。</p></div>
        <span>{model.provenance.inputManifestSha256.slice(0, 12)}…</span>
      </section>

      <section className="explainConclusion band" aria-labelledby="explain-conclusion-title">
        <div className="explainConclusionHeading">
          <p className="eyebrow">CONCLUSION FIRST</p>
          <h2 id="explain-conclusion-title">Current conclusions</h2>
          <p>SR here is a strict per-episode label: success=1 and half-success/failure=0. Every association below is within one model and one frozen cohort.</p>
        </div>
        <div className="explainConclusionGrid">
          <article className="conclusionPositive"><span>Replicated across models · positive</span><strong>Left EE mean speed</strong><p>On full episodes, Pi0.5 r={piLeftSpeed?.r?.toFixed(3)} and FastWAM r={fastLeftSpeed?.r?.toFixed(3)}. Both pass BH q&lt;0.05; this is the only repeated moderate positive signal.</p></article>
          <article className="conclusionNegative"><span>Replicated across models · negative</span><strong>{metricList(repeatedNegative)}</strong><p>These full-episode totals are lower for successful samples. The direction is stable and significant, but early termination may contribute; it does not imply that fewer actions improve SR.</p></article>
          <article><span>Unstable or non-significant</span><strong>Right-arm mean speed and SPARC</strong><p>Right-arm mean speed fails q&lt;0.05 for both models. SPARC changes direction for Pi0.5 and is non-significant for FastWAM, so neither is a stable success proxy yet.</p></article>
          <article><span>Fixed first-250-step window</span><strong>No repeated cross-model signal</strong><p>Pi0.5 shows a significant positive association only for left-arm joint/orientation paths; FastWAM only for right-arm orientation path. This is model-specific, not a general conclusion.</p></article>
        </div>
      </section>

      <section className="correlationWorkspace band">
        <div className="correlationToolbar">
          <div><p className="eyebrow">CORRELATION LENS</p><h2>{windowCopy[window].label}</h2><p>{windowCopy[window].note}</p></div>
          <div className="analysisControls">
            <div className="windowSwitch" aria-label="Correlation observation window">
              {(Object.keys(windowCopy) as AnalysisWindow[]).map((id) => <button key={id} type="button" className={window === id ? "selected" : ""} onClick={() => setWindow(id)}>{windowCopy[id].label}</button>)}
            </div>
            <button type="button" className={significantOnly ? "filterButton active" : "filterButton"} aria-pressed={significantOnly} onClick={() => setSignificantOnly((value) => !value)}>{significantOnly ? "Significant only (q<0.05)" : "All metrics"}</button>
          </div>
        </div>

        <div className="correlationBody">
          <div className="correlationChart">
            <div className="corrAxis"><span>−1 Negative association</span><i /><span>+1 Positive association</span></div>
            <div className="corrRows">{visibleRows.map((row) => <CorrelationBar key={row.metricId} row={row} />)}</div>
            <ChartExplanation title="How to read this correlation chart">
              Bars to the right mean a higher metric value in successful episodes; bars to the left mean lower. Length is |r|, not a score. For {modelName}  of {windowCopy[window].label}there are {significantRows.length} metrics passing BH q&lt;0.05：{positiveSignificant.length ? `${metricList(positiveSignificant)}are positive` : "no significant positive associations"}；{negativeSignificant.length ? `${metricList(negativeSignificant)}are negative` : "no significant negative associations"}。Intervals crossing 0 or q≥0.05 indicate insufficient evidence.
            </ChartExplanation>
          </div>
          <aside className="analysisReadout">
            <article className="signalCard">
              <span>CURRENT READOUT</span>
              <strong>{significantRows.length} metrics pass q&lt;0.05</strong>
              <p>{positiveSignificant.length} show a raw positive association. A positive association means the metric tends to be higher among successful samples; it is not automatically better.</p>
            </article>
            {strongest && <article><Target size={17} /><div><span>Strongest current signal</span><strong>{strongest.label.replace("Pre-outcome ", "")}</strong><p>r={strongest.r?.toFixed(3)} · q={formatQ(strongest.qValue)}<br/>success mean {formatValue(strongest.successMean)} / non-success {formatValue(strongest.nonSuccessMean)}</p></div></article>}
            <article><Info size={17} /><div><span>How to read direction</span><strong>The sign of r is not a quality label</strong><p>Path Length is usually more efficient when lower, so a negative r can align with expectations; a positive fixed-window r may mean successful episodes progressed further.</p></div></article>
            <article><ShieldCheck size={17} /><div><span>Statistical boundaries</span><strong>Association ≠ causation</strong><p>Fixed windows can include initial difficulty and task-stage differences; full episodes also include early-stop and duration confounding.</p></div></article>
          </aside>
        </div>
      </section>

      <section className="eventEvidence band">
        <div className="eventHeading"><div><p className="eyebrow">EVENT EVIDENCE</p><h2>Failure events and success</h2></div><span>telemetry coverage 100%</span></div>
        <div className="eventGrid">
          {model.series.events.map((row) => (
            <article key={row.metricId} className={row.significant ? "eventSignal" : ""}>
              <strong>{row.label}</strong>
              {row.status === "computed" ? <><b>r={row.r?.toFixed(3)}</b><span>q={formatQ(row.qValue)} · success mean {formatValue(row.successMean)} / non-success {formatValue(row.nonSuccessMean)}</span></> : <><b>Variance not estimable</b><span>All 100 telemetry records are valid, but this event count is constant; it is not missing and no correlation is fabricated.</span></>}
            </article>
          ))}
        </div>
        <ChartExplanation title="How to read these event cards">
          Each card compares event counts in successful and non-successful episodes. A negative r means more events accompany fewer successes. “Variance not estimable” means all 100 telemetry records are valid but the event is always zero; the sample has no variation for correlation estimation.
        </ChartExplanation>
        {eventSignal && <p className="eventFootnote">{modelName} {eventSignal.label} count is negatively associated with success in the current cohort (q={formatQ(eventSignal.qValue)}). The event-flag Fisher test is a different analysis from count correlation.</p>}
      </section>

      <section className="interpretationBoundary band">
        <div><span>01</span><strong>Current relation</strong><p>episode-level metrics ↔ binary task success</p></div>
        <div><span>02</span><strong>Explicitly excluded</strong><p>success / score outcome-derived values are not predictors</p></div>
        <div><span>03</span><strong>Model boundary</strong><p>Cosmos、CtrlWorld have no task outcome and are excluded from this analysis</p></div>
        <div><span>04</span><strong>Evidence version</strong><p>SHA {model.provenance.correlationSha256.slice(0, 12)}… · pipeline {model.provenance.pipelineCommit.slice(0, 7)}</p></div>
      </section>
      </>}
    </div>
  );
}
