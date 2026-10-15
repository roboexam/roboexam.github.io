import {
  l1MinimalBundle,
  type L1MinimalBundle,
} from "../../data/l1-minimal-results";
import {
  l1Phase1ProvisionalBundle,
  type L1Phase1Example,
  type L1Phase1Metric,
} from "../../data/l1-phase1-provisional";

export type L1LayerId = "L1-A" | "L1-B" | "L1-C" | "L1-D";
export type L1CandidateMetric = L1MinimalBundle["candidateAudit"]["metrics"][number];

export const layerIds: L1LayerId[] = ["L1-A", "L1-B", "L1-C", "L1-D"];

export const layerMeta: Record<L1LayerId, {
  title: string;
  short: string;
  description: string;
  boundary: string;
}> = {
  "L1-A": {
    title: "场景与任务状态建模",
    short: "状态建模",
    description: "识别当前场景中的对象、状态、关系、位置与明确指称。",
    boundary: "不单独说明模型是否理解下一步任务意图，也不等于动作执行成功。",
  },
  "L1-B": {
    title: "任务条件下的一步交互理解",
    short: "一步交互",
    description: "判断下一步应与什么交互，以及接触、抓取或放置的位置。",
    boundary: "只评测交互目标理解，不说明执行器能否完成抓取或放置。",
  },
  "L1-C": {
    title: "进程与计划组织理解",
    short: "进程计划",
    description: "判断任务进度、下一子目标，以及计划步骤与依赖是否正确。",
    boundary: "计划文本一致不代表真实执行成功；BLEU 也不等价于规划能力。",
  },
  "L1-D": {
    title: "偏差诊断与恢复理解",
    short: "诊断恢复",
    description: "发现执行偏差、定位失败原因，并表达合理的恢复目标。",
    boundary: "诊断正确不代表模型已经执行恢复动作。",
  },
};

export const gradeMeta = {
  E3: { label: "已注册结果", detail: "真实输出与冻结评分器" },
  E2: { label: "Judge 待冻结", detail: "真实输入存在，Judge 合同未冻结" },
  E1: { label: "定义就绪", detail: "公式可解释，正式运行证据缺失" },
  E0: { label: "合同待补齐", detail: "候选设计，尚未形成可运行合同" },
} as const;

export const audit = l1MinimalBundle.candidateAudit;
export const phase1 = l1Phase1ProvisionalBundle;
const phase1ByMetricId = new Map(phase1.metrics.map((metric) => [metric.metricId, metric]));
const phase1ExampleById = new Map(
  phase1.examples.map((example) => [example.canonicalSampleId, example]),
);

export function phase1Metric(metric: L1CandidateMetric | string): L1Phase1Metric {
  const metricId = typeof metric === "string" ? metric : metric.metric_id;
  const result = phase1ByMetricId.get(metricId);
  if (!result) throw new Error(`Missing Phase 1 result for ${metricId}`);
  return result;
}

export function metricHasNumericResult(metric: L1CandidateMetric) {
  return phase1Metric(metric).score !== null;
}

export function metricStateLabel(metric: L1CandidateMetric) {
  const state = phase1Metric(metric).state;
  if (state === "scored_provisional_judge") return "Judge provisional · 未人工校准";
  if (state === "scored_provisional_gt") return "机器 GT provisional · 未人工签核";
  if (state === "scored_with_contract_pending") return "部分 scored · 仍有合同缺口";
  if (state === "contract_pending") return "Contract pending · 不补零";
  return "冻结 deterministic scorer";
}

export function metricStateToken(metric: L1CandidateMetric) {
  const state = phase1Metric(metric).state;
  if (state === "scored_provisional_judge") return "JUDGE*";
  if (state === "scored_provisional_gt") return "GT*";
  if (state === "scored_with_contract_pending") return "PARTIAL";
  if (state === "contract_pending") return "PENDING";
  return "SCORED";
}

export function metricFamily(metric: L1CandidateMetric) {
  return metric.metric_id.startsWith("l1c.bleu") ? "l1c.plan_bleu" : metric.metric_id;
}

export function matrixMetrics() {
  return audit.metrics.filter((metric) => !/^l1c\.bleu[234]$/.test(metric.metric_id));
}

export function metricDisplayName(metric: L1CandidateMetric) {
  return metric.metric_id === "l1c.bleu1" ? "RoboVQA BLEU (1–4)" : metric.name;
}

export function metricResultN(metric: L1CandidateMetric) {
  return phase1Metric(metric).scoreBearingN;
}

export function metricExample(metric: L1CandidateMetric): L1Phase1Example {
  const sampleId = phase1.exampleByMetricId[metric.metric_id];
  const example = phase1ExampleById.get(sampleId);
  if (!example) throw new Error(`Missing Phase 1 example for ${metric.metric_id}`);
  if (!example.metricMemberships.includes(metric.metric_id)) {
    throw new Error(`Phase 1 example membership mismatch for ${metric.metric_id}`);
  }
  return example;
}

export function selectedSampleFromUrl(metric: L1CandidateMetric) {
  if (typeof window === "undefined") return phase1.exampleByMetricId[metric.metric_id];
  const requested = new URLSearchParams(window.location.search).get("sample");
  return requested && /^[a-f0-9]{64}$/.test(requested) ? requested : phase1.exampleByMetricId[metric.metric_id];
}

export function taskMetricScore(taskId: string, metricId: string) {
  if (taskId !== "stack_bowls") return null;
  return phase1Metric(metricId).score;
}

export function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toFixed(1);
}

export function selectedMetricFromUrl() {
  if (typeof window === "undefined") return audit.metrics[0].metric_id;
  const requested = new URLSearchParams(window.location.search).get("metric");
  return audit.metrics.some((metric) => metric.metric_id === requested) ? requested! : audit.metrics[0].metric_id;
}

export function selectedLayerFromUrl(): L1LayerId | "ALL" {
  if (typeof window === "undefined") return "ALL";
  const requested = new URLSearchParams(window.location.search).get("layer");
  return requested === "ALL" || layerIds.includes(requested as L1LayerId) ? requested as L1LayerId | "ALL" : "ALL";
}
