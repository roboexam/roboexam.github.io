import { ArrowUpRight } from "lucide-react";
import type { T1BenchmarkMetric, T1BenchmarkResults } from "../../data/t1-benchmark-results";

type Props = {
  models: T1BenchmarkResults["models"];
  metrics: T1BenchmarkMetric[];
  selectedModelId: string;
  viewerId: string;
  onSelectModel: (modelId: string) => void;
  onMetric: (metricId: string, modelId: string) => void;
};

const headlineMetrics = ["overall", "vqa", "subtask", "success"];
const detailMetrics = ["a1", "a2", "a3", "b1", "b3", "b_interaction", "c1", "c2", "c3"];
const headlineLabels: Record<string, string> = { overall: "Overall", vqa: "VQA", subtask: "Subtask", success: "Success" };

export function benchmarkScoreText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

export function benchmarkMetricLabel(metric: T1BenchmarkMetric): string {
  if (headlineLabels[metric.id]) return headlineLabels[metric.id];
  if (/^[abc][123]$/.test(metric.id)) return metric.id.toUpperCase();
  if (metric.id === "b_interaction") return "B interaction";
  return metric.label;
}

export function T1BenchmarkTable({ models, metrics, selectedModelId, viewerId, onSelectModel, onMetric }: Props) {
  const definitions = new Map(metrics.map((metric) => [metric.id, metric]));
  const reported = (metric: T1BenchmarkMetric) => models.some((model) => typeof model.scores[metric.id] === "number" && Number.isFinite(model.scores[metric.id]));
  const extraMetrics = metrics.filter((metric) => ![...headlineMetrics, ...detailMetrics, "a", "b", "c"].includes(metric.id) && reported(metric));
  const columns = [
    ...headlineMetrics.flatMap((id) => definitions.has(id) ? [definitions.get(id)!] : []),
    ...detailMetrics.flatMap((id) => {
      const metric = definitions.get(id);
      return metric && reported(metric) ? [metric] : [];
    }),
    ...extraMetrics,
  ];

  return <div className="t1bTableScroll" role="region" aria-label="T1 model leaderboard, horizontally scrollable"
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
    tabIndex={0}>
    <table className="t1bTable">
      <caption className="srOnly">Model leaderboard. All scores are out of 100. Select any metric to see its definition and scoring formula.</caption>
      <thead><tr>
        <th scope="col">Model</th>
        {columns.map((metric) => <th key={metric.id} scope="col" className={metric.id === "overall" ? "t1bOverall" : undefined}>
          <button type="button" className="t1bMetricHeading" onClick={() => onMetric(metric.id, selectedModelId)}
            aria-label={`Define ${metric.label}`} title={metric.label}>
            <span>{benchmarkMetricLabel(metric)}</span><ArrowUpRight size={13} aria-hidden="true"/>
          </button>
        </th>)}
      </tr></thead>
      <tbody>{models.map((model) => <tr key={model.id} className={model.id === selectedModelId ? "t1bSelectedModel" : undefined}>
        <th scope="row"><button type="button" className="t1bModelName" aria-controls={viewerId}
          aria-pressed={model.id === selectedModelId} onClick={() => onSelectModel(model.id)}>
          {model.label}<ArrowUpRight size={14} aria-hidden="true"/>
        </button></th>
        {columns.map((metric) => <td key={metric.id} className={metric.id === "overall" ? "t1bOverall" : undefined}>
          <button type="button" className="t1bScore" onClick={() => onMetric(metric.id, model.id)}
            aria-label={`${model.label}, ${metric.label}: ${benchmarkScoreText(model.scores[metric.id])} out of 100. View scoring formula.`}>
            {benchmarkScoreText(model.scores[metric.id])}
          </button>
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
