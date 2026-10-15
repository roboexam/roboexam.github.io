import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  audit,
  formatScore,
  layerIds,
  layerMeta,
  matrixMetrics,
  metricDisplayName,
  metricHasNumericResult,
  metricResultN,
  metricStateLabel,
  metricStateToken,
  phase1Metric,
  type L1CandidateMetric,
  type L1LayerId,
} from "./l1-view-model";

export function MetricMatrix({
  layer,
  selectedMetricId,
  onLayer,
  onMetric,
}: {
  layer: L1LayerId | "ALL";
  selectedMetricId: string;
  onLayer: (layer: L1LayerId | "ALL") => void;
  onMetric: (metric: L1CandidateMetric) => void;
}) {
  const [query, setQuery] = useState("");
  const metrics = useMemo(() => matrixMetrics().filter((metric) => {
    const matchesLayer = layer === "ALL" || metric.layer === layer;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || `${metric.name} ${metric.metric_id} ${metric.source}`.toLowerCase().includes(needle);
    return matchesLayer && matchesQuery;
  }), [layer, query]);

  return <section className="l1rSection" id="metric-matrix">
    <header className="l1rSectionHeader">
      <div><span>CHOOSE ONE METRIC</span><h2>先选一个指标，再沿例子读懂它</h2></div>
      <p>{audit.metrics.length} 个定义严格来自飞书文档编号条目；文档之外的 metric 不进入矩阵。BLEU-1 至 BLEU-4 按一个 family 展示。</p>
    </header>
    <div className="l1rMatrixTools">
      <div className="l1rSegments" aria-label="按能力层筛选">
        <button type="button" className={layer === "ALL" ? "active" : ""} onClick={() => onLayer("ALL")}>全部</button>
        {layerIds.map((id) => <button type="button" key={id} className={layer === id ? "active" : ""} onClick={() => onLayer(id)}>{id}</button>)}
      </div>
      <label className="l1rSearch"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索指标或来源" aria-label="搜索指标或来源"/></label>
    </div>
    <div className="l1rMatrix" role="table" aria-label="Level 1 指标矩阵">
      <div className="l1rMatrixHead" role="row">
        <span>Metric</span><span>Layer</span><span>Method source</span><span>Result</span><span>N</span><span>Status</span><span aria-hidden="true"/>
      </div>
      {metrics.map((metric) => {
        const resultN = metricResultN(metric);
        const resultReady = metricHasNumericResult(metric);
        const result = phase1Metric(metric);
        return <button
          type="button"
          role="row"
          key={metric.metric_id}
          className={selectedMetricId === metric.metric_id ? "l1rMatrixRow active" : "l1rMatrixRow"}
          onClick={() => onMetric(metric)}
        >
          <span role="cell"><strong>{metricDisplayName(metric)}</strong><em>{metric.why_considered}</em><small>{metric.metric_id === "l1c.bleu1" ? "4 orders · one family" : metric.metric_id}</small></span>
          <span role="cell"><b>{metric.layer}</b><small>{layerMeta[metric.layer].short}</small></span>
          <span role="cell">{metric.source}<small>飞书 §{metric.document_section}</small></span>
          <span role="cell" className={resultReady ? "result" : "pending"}><strong>{resultReady ? formatScore(result.score) : "— pending"}</strong><small>{resultReady ? "0–100 display" : "not scored as zero"}</small></span>
          <span role="cell">{resultN}<small>score-bearing</small></span>
          <span role="cell"><i className={`l1rState ${result.state}`}>{metricStateToken(metric)}</i><small>{metricStateLabel(metric)}</small></span>
          <span role="cell"><ChevronRight size={16}/></span>
        </button>;
      })}
      {!metrics.length && <div className="l1rEmpty">没有符合当前筛选条件的指标。</div>}
    </div>
  </section>;
}
