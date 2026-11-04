import raw from "./generated/policy-baselines-aggregates.json" with { type: "json" };

export const policyBaselineModelIds = ["G05", "HyVLA", "XVLA"] as const;
export type PolicyBaselineModel = (typeof policyBaselineModelIds)[number];
export type PolicySetting = "id" | "visual" | "semantic" | "behavioral";
type StoredSetting = "id" | "visual" | "semantic" | "behavior";
export type PolicyScalar = number | null;
export type PolicyMetric = {
  value: PolicyScalar;
  n: number;
  unit: string;
  primary: string;
  available: boolean;
  coverage: number | null;
  detail: string;
};
export type PolicyTask = {
  task: string;
  model: PolicyBaselineModel;
  split: StoredSetting;
  resultVersion: string;
  protocol: string;
  promptVersion: string;
  sourceBatch: string;
  expectedEpisodes: number;
  episodes: number;
  incompleteEpisodes: number;
  successes: number;
  values: Record<string, PolicyMetric>;
};
type PolicyBundle = {
  resultVersion: string;
  sourceDataset: string;
  models: Record<PolicyBaselineModel, Record<StoredSetting, Record<string, PolicyTask>>>;
};

export const policyBaselines = raw as unknown as PolicyBundle;
export const policyTaskIds = Object.keys(policyBaselines.models.G05.id);

function storedSetting(setting: PolicySetting): StoredSetting {
  return setting === "behavioral" ? "behavior" : setting;
}

export function isPolicyBaselineModel(model: string): model is PolicyBaselineModel {
  return policyBaselineModelIds.includes(model as PolicyBaselineModel);
}

export function policyTaskFor(model: PolicyBaselineModel, taskId: string, setting: PolicySetting) {
  return policyBaselines.models[model][storedSetting(setting)]?.[taskId];
}

export function policySampleDisplay(value: PolicyScalar | undefined, unit = "rate") {
  if (value == null) return "N/A";
  if (unit === "rate") return `${(value * 100).toFixed(2)}%`;
  if (unit === "percentage") return (value * 100).toFixed(2);
  return `${value.toFixed(3)} ${unit}`;
}

export function policyBaselineResult(model: PolicyBaselineModel, taskId: string, metricId: string, setting: PolicySetting = "id") {
  const split = storedSetting(setting);
  const tasks = Object.values(policyBaselines.models[model][split]);
  const isOverall = taskId === "all";
  const task = isOverall ? undefined : policyBaselines.models[model][split]?.[taskId];
  const taskMetrics = tasks.map((item) => item.values[metricId]).filter((item): item is PolicyMetric => item !== undefined);
  const available = taskMetrics.filter((item): item is PolicyMetric & { value: number } => item.value !== null && Number.isFinite(item.value));
  const overallValue = available.length ? available.reduce((sum, item) => sum + item.value, 0) / available.length : null;
  const metric = isOverall ? (taskMetrics[0] ? {
    value: overallValue,
    n: available.length,
    unit: taskMetrics[0].unit,
    primary: policySampleDisplay(overallValue, taskMetrics[0].unit),
    available: overallValue !== null,
    coverage: tasks.length ? available.length / tasks.length : null,
    detail: overallValue === null ? taskMetrics[0].detail : `arithmetic mean of per-task aggregates over ${available.length} available tasks`,
  } : undefined) : task?.values[metricId];
  const episodes = tasks.reduce((sum, item) => sum + item.episodes, 0);
  const expectedEpisodes = tasks.reduce((sum, item) => sum + item.expectedEpisodes, 0);
  return {
    primary: metric?.primary ?? "N/A",
    detail: metric ? `${isOverall ? "Tasks" : "N"} = ${metric.n}${metric.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`} · ${metric.detail}` : "No validated policy-baseline result for this task and metric.",
    status: metric?.available ? "Computed" : "N/A",
    available: metric?.available ?? false,
    version: task?.resultVersion ?? policyBaselines.resultVersion,
    protocol: task?.protocol ?? `Benchmark Policy v1 · ${split} cohort · task-macro aggregate`,
    sampleCount: metric?.n,
    cohort: isOverall
      ? `${split} · ${tasks.length} tasks · ${episodes}/${expectedEpisodes} episodes`
      : task ? `${split} · ${task.episodes}/${task.expectedEpisodes} episodes` : undefined,
  };
}
