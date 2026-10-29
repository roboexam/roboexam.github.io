"use client";

import { Download, ExternalLink } from "lucide-react";
import {
  pearsonMatrixDashboardBundle,
  type PearsonMetricMatrix,
} from "../data/pearson-matrix-results";

const strengthLabels = {
  negligible: "Negligible",
  weak: "Weak",
  moderate: "Moderate",
  strong: "Strong",
} as const;

function formatValue(value: number | null) {
  if (value === null) return "N/A";
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function formatProbability(value: number) {
  if (value < 0.0001) return value.toExponential(2);
  return value.toFixed(4);
}

function pearsonTone(value: number) {
  if (value >= 0.5) return "positiveStrong";
  if (value >= 0.3) return "positiveMedium";
  if (value >= 0.1) return "positiveWeak";
  if (value > -0.1) return "neutral";
  if (value > -0.3) return "negativeWeak";
  if (value > -0.5) return "negativeMedium";
  return "negativeStrong";
}

function strongestMatrixPair(matrix: PearsonMetricMatrix) {
  let strongest = { row: 0, column: 1, r: matrix.values[0]?.[1] ?? 0 };
  matrix.values.forEach((row, rowIndex) => row.forEach((r, columnIndex) => {
    if (columnIndex > rowIndex && Math.abs(r) > Math.abs(strongest.r)) strongest = { row: rowIndex, column: columnIndex, r };
  }));
  return {
    left: matrix.metricLabels[strongest.row],
    right: matrix.metricLabels[strongest.column],
    r: strongest.r,
  };
}

const figureExplanations: Record<string, { read: string; conclusion: string }> = {
  metricVsEpisodeSuccess: {
    read: "Each cell is Pearson r between a metric and the strict per-episode success label. Red is positive, blue is negative, and dots mark BH-adjusted q<0.05. Group is the arithmetic mean of member r values.",
    conclusion: "L-Speed is the only positive signal reproduced by both Pi0.5 and FastWAM. SPARC direction is not stable across models, so smoother does not generally mean more successful.",
  },
  metricOnlyMatrices: {
    read: "Each small matrix compares metrics only; the diagonal is 1 and the two triangles repeat. The closer |r| is to 1, the more linear information the pair shares.",
    conclusion: "ACWM MSE, M-MSE, PSNR, and SSIM form a highly correlated group, indicating pixel-fidelity redundancy. TA is weaker or moderate and adds information. This does not answer whether any metric relates to SR.",
  },
};

export function MetricOnlyMatrix({ matrix }: { matrix: PearsonMetricMatrix }) {
  const strongest = strongestMatrixPair(matrix);
  return (
    <article className="metricMatrixCard">
      <header>
        <div><strong>{matrix.displayName}</strong><span>{matrix.family} · {matrix.split}</span></div>
        <small>n={matrix.episodeCount} · outcome excluded</small>
      </header>
      <div className="metricMatrixScroller" role="region" aria-label={`${matrix.displayName} metric-only Pearson matrix，horizontal scroll`}>
        <table>
          <thead><tr><th scope="col">Metric</th>{matrix.metricLabels.map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {matrix.values.map((row, rowIndex) => (
              <tr key={matrix.metricIds[rowIndex]}>
                <th scope="row">{matrix.metricLabels[rowIndex]}</th>
                {row.map((value, columnIndex) => (
                  <td
                    className={pearsonTone(value)}
                    key={matrix.metricIds[columnIndex]}
                    title={`${matrix.metricLabels[rowIndex]} ↔ ${matrix.metricLabels[columnIndex]}: r=${value.toFixed(4)}`}
                  >{value.toFixed(2)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="matrixExplanation">
        <strong>How to read</strong>
        <p>This view checks metric redundancy only and excludes success. The strongest off-diagonal pair is {strongest.left} ↔ {strongest.right}，r={strongest.r.toFixed(3)}；{Math.abs(strongest.r) >= .7 ? "The pair shares substantial linear information; avoid double weighting it in a composite score." : "The pair shares some information but is not interchangeable."}</p>
      </footer>
    </article>
  );
}

export function PearsonMatrixSection() {
  const repeatedMetricId = pearsonMatrixDashboardBundle.crossModel.repeatedSignificantMetricIds[0];
  const repeatedMetricRows = pearsonMatrixDashboardBundle.vlaFindings
    .map((finding) => finding.metrics.find((metric) => metric.metricId === repeatedMetricId))
    .filter((metric) => metric !== undefined);

  return (
    <section className="pearsonMatrix band" aria-labelledby="pearson-matrix-title">
      <div className="pearsonMatrixHeading">
        <div>
          <p className="eyebrow">STACK BOWLS · PEARSON R</p>
          <h2 id="pearson-matrix-title">Episode-success associations and metric redundancy are reported separately</h2>
          <p>The first section asks whether a metric moves with per-episode success; the second examines metric-to-metric relationships. Success rate is cohort context and is excluded from the N×N matrix.</p>
        </div>
        <div className="pearsonMatrixMeta" aria-label="Correlation analysis scope">
          {pearsonMatrixDashboardBundle.panels.map((panel) => (
            <span key={panel.modelId}><strong>{panel.displayName}</strong> n={panel.episodeCount}</span>
          ))}
        </div>
      </div>

      <div className="pearsonHeadline">
        <div>
          <span>Signal reproduced across both closed-loop models</span>
          <strong>Left EE mean speed has a moderate positive association with episode success</strong>
          <p>Both Pi0.5 and FastWAM pass within-model BH correction; this is not a causal claim that faster motion causes success.</p>
        </div>
        <div className="pearsonHeadlineValues">
          {pearsonMatrixDashboardBundle.vlaFindings.map((finding, index) => (
            <span key={finding.modelId}>
              <small>{finding.displayName}</small>
              <strong>r={repeatedMetricRows[index]?.r.toFixed(3)}</strong>
              <i>q={formatProbability(repeatedMetricRows[index]?.qValue ?? 0)}</i>
            </span>
          ))}
        </div>
      </div>

      <div className="pearsonResultBlock">
        <div className="pearsonResultIntro">
          <div><p className="eyebrow">METRIC → EPISODE SUCCESS</p><h3>Pearson correlation with strict binary success</h3></div>
          <p>Target is fixed at success=1 and half-success/failure=0. For a binary target, Pearson r equals the point-biserial correlation. Group is only the arithmetic mean of member r values.</p>
        </div>

        <div className="pearsonSuccessModels">
          {pearsonMatrixDashboardBundle.vlaFindings.map((finding) => (
            <article className="pearsonSuccessPanel" key={finding.modelId}>
              <header>
                <div><strong>{finding.displayName}</strong><span>{finding.family} · n={finding.episodeCount}</span></div>
                <p>cohort SR <b>{(finding.cohortSuccessRate * 100).toFixed(0)}%</b></p>
              </header>
              <div className="pearsonSuccessGrid">
                <span className="pearsonRowLabel">Group</span>
                {finding.groups.map((group) => (
                  <div className={`pearsonGroupCell ${pearsonTone(group.meanR)}`} key={group.groupId}>
                    <strong>{group.displayName}</strong>
                    <small>mean(r)={group.meanR > 0 ? "+" : ""}{group.meanR.toFixed(3)}</small>
                  </div>
                ))}
                <span className="pearsonRowLabel">Metric</span>
                {finding.metrics.map((metric) => (
                  <div className={`pearsonStripCell ${pearsonTone(metric.r)}`} key={metric.metricId} title={`${metric.displayName}: r=${metric.r.toFixed(4)}, q=${formatProbability(metric.qValue)}`}>
                    <strong>{metric.r > 0 ? "+" : ""}{metric.r.toFixed(3)}</strong>
                    <small>{metric.displayName}</small>
                    <em>{metric.significant ? "● q<0.05" : `q=${formatProbability(metric.qValue)}`}</em>
                  </div>
                ))}
              </div>
              <div className="successPanelExplanation">
                <strong>Figure conclusion</strong>
                <p>{finding.metrics.filter((metric) => metric.significant && metric.direction === "positive").map((metric) => metric.displayName).join(", ") || "No metrics"} have a significant positive association with SR；{finding.metrics.filter((metric) => metric.significant && metric.direction === "negative").map((metric) => metric.displayName).join(", ") || "No metrics"} have a significant negative association with SR；The remaining metrics do not pass q&lt;0.05. Color shows the direction and magnitude of r, not whether the metric is good or bad.</p>
              </div>
            </article>
          ))}
        </div>

        <div className="pearsonScale" aria-label="Pearson correlation color legend">
          <span>−1 negative</span><i /><span>0 no clear linear relation</span><i /><span>+1 positive</span><b>● BH q&lt;0.05</b>
        </div>
        <div className="pearsonReadGuide"><strong>How to read this color scale</strong><p>Start with the Metric row: only items marked “● q&lt;0.05” have corrected statistical evidence. A positive r means a higher value in successful episodes and a negative r means lower. Use the metric definition to judge direction; path length is usually more efficient when lower, so negative association can be expected.</p></div>
      </div>

      <div className="pearsonVlaDetails">
        {pearsonMatrixDashboardBundle.vlaFindings.map((finding) => (
          <section key={finding.modelId} aria-labelledby={`pearson-${finding.modelId}`}>
            <header>
              <div><p className="eyebrow">{finding.family} · FORMAL100</p><h3 id={`pearson-${finding.modelId}`}>{finding.displayName}</h3></div>
              <p>{finding.classificationCounts.success} success / {finding.classificationCounts["half-success"]} half / {finding.classificationCounts.failure} failure</p>
            </header>
            <div className="pearsonMetricTable" role="table">
              <div className="pearsonMetricTableHead" role="row"><span>Metric</span><span>r / relation</span><span>q</span><span>95% CI</span><span>success / non-success mean</span></div>
              {finding.metrics.map((metric) => (
                <div className="pearsonMetricTableRow" role="row" key={metric.metricId}>
                  <span><strong>{metric.displayName}</strong><code>{metric.metricId}</code></span>
                  <span><b>{metric.r > 0 ? "+" : ""}{metric.r.toFixed(3)}</b><small>{metric.direction === "positive" ? "positive" : "negative"} · {strengthLabels[metric.strength]}</small></span>
                  <span className={metric.significant ? "significant" : ""}>{formatProbability(metric.qValue)}{metric.significant && <small>significant</small>}</span>
                  <span>[{metric.ci95[0].toFixed(3)}, {metric.ci95[1].toFixed(3)}]</span>
                  <span>{formatValue(metric.successMean)} / {formatValue(metric.nonSuccessMean)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="pearsonResultBlock pearsonMetricOnlyBlock">
        <div className="pearsonResultIntro">
          <div><p className="eyebrow">METRIC ↔ METRIC · OUTCOME EXCLUDED</p><h3>Internal metric correlation matrices</h3></div>
          <p>Success, ordinal, official score, runtime, steps, cumulative paths, and sparse events are excluded. The matrices identify redundancy and complementarity and do not form a total score.</p>
        </div>
        <div className="metricMatrixGrid">
          {pearsonMatrixDashboardBundle.metricOnlyMatrices.map((matrix) => <MetricOnlyMatrix matrix={matrix} key={matrix.modelId} />)}
        </div>
      </div>

      <div className="pearsonAcwm">
        <div className="pearsonResultIntro">
          <div><p className="eyebrow">ACWM BOUNDARY</p><h3>Pixel metrics are redundant; TA adds a complementary dimension</h3></div>
          <p>Cosmos and CtrlWorld use oracle-success episodes and have no new closed-loop success labels after prediction. Only metric↔metric relationships can be analyzed; this is not metric-success evidence.</p>
        </div>
        <div className="pearsonAcwmModels">
          {pearsonMatrixDashboardBundle.acwmFindings.map((finding) => (
            <section key={finding.modelId}>
              <header><strong>{finding.displayName}</strong><span>heldout n={finding.episodeCount}</span></header>
              <div className="pearsonPairList">
                {finding.pixelFidelityPairs.map((pair) => <p key={`${pair.leftMetricId}-${pair.rightMetricId}`}><span>{pair.leftDisplayName} ↔ {pair.rightDisplayName}</span><strong>r={pair.r.toFixed(3)}</strong></p>)}
              </div>
              <p className="pearsonTrajectoryNote">TA&apos;s strongest absolute association: {finding.trajectoryMostRelated.rightDisplayName}, r={finding.trajectoryMostRelated.r.toFixed(3)}.</p>
              <div className="acwmExplanation"><strong>Figure conclusion</strong><p>Pixel-fidelity metrics are highly correlated and contain redundant information. TA&apos;s strongest association has |r|={Math.abs(finding.trajectoryMostRelated.r).toFixed(3)}; {Math.abs(finding.trajectoryMostRelated.r) < .3 ? "TA is largely complementary." : "TA remains complementary but is not fully independent."} Without a closed-loop success label, no ACWM metric-to-SR claim is valid.</p></div>
            </section>
          ))}
        </div>
      </div>

      <div className="pearsonFigures">
        {Object.entries(pearsonMatrixDashboardBundle.figures).map(([figureId, figure]) => (
          <article key={figureId}>
            <header><div><strong>{figure.title}</strong><span>PNG · {(figure.bytes / 1024).toFixed(0)} KB</span></div><a href={figure.url} download><Download size={14} aria-hidden="true" />Download</a></header>
            <a className="pearsonFigure" href={figure.url} target="_blank" rel="noreferrer" aria-label={`Open original in a new window: ${figure.title}`} style={{ aspectRatio: `${figure.width} / ${figure.height}` }}>
              <img src={figure.url} alt={figure.alt} width={figure.width} height={figure.height} />
              <span><ExternalLink size={14} aria-hidden="true" />View original</span>
            </a>
            <div className="figureExplanation"><strong>How to read</strong><p>{figureExplanations[figureId].read}</p><strong>Figure conclusion</strong><p>{figureExplanations[figureId].conclusion}</p></div>
          </article>
        ))}
      </div>

      <div className="pearsonBoundary">
        <div><strong>Target unit</strong><p>The target is a binary success label per episode, not an aggregate cohort SR.</p></div>
        <div><strong>Group convention</strong><p>Smoothness / Speed use `mean(r)` over member r values for description only; no joint q or CI is attached.</p></div>
        <div><strong>Ordinal</strong><p>Ordinal remains in the formal report and CSV as sensitivity evidence and is excluded from the two main figures.</p></div>
        <div><strong>ACWM</strong><p>No variable closed-loop success label is available, so metric-success correlation is neither computed nor implied.</p></div>
        <div><strong>Matrix purpose</strong><p>The N×N matrices analyze redundancy and complementarity only; no target-derived field is included.</p></div>
        <div><strong>Interpretation boundary</strong><p>Association is not causation or cross-task generalization. Result version <code>{pearsonMatrixDashboardBundle.bundleVersion}</code>.</p></div>
      </div>
    </section>
  );
}
