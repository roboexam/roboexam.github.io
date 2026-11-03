import raw from "./generated/xvla-24id-aggregates.json" with { type: "json" };
import oodRaw from "./generated/xvla-ood-aggregates.json" with { type: "json" };

export type XvlaScalar = number | null;
export type XvlaMetric = {
  value: XvlaScalar;
  n: number;
  unit: string;
  primary: string;
  available: boolean;
  coverage: number | null;
  detail: string;
};
export type XvlaVideo = {
  camera: string;
  url: string;
  sha256: string;
  durationSeconds: number;
  frameCount: number;
  width: number;
  height: number;
};
export type XvlaSample = {
  id: string;
  sourceEpisode: string;
  layoutId: number;
  status: string;
  success: boolean;
  score: number | null;
  metricsAvailable: boolean;
  values: Record<string, XvlaScalar>;
  units: Record<string, string>;
  videos: XvlaVideo[];
  reportSha256: string | null;
  promptVersion: string;
  prompt: string | null;
  sourceBatch: string;
};
export type XvlaTask = {
  task: string;
  model: "XVLA";
  split: "indomain" | "visual" | "semantic" | "behavior";
  resultVersion: string;
  protocol: string;
  promptVersion: string;
  sourceBatch: string;
  expectedEpisodes: number;
  episodes: number;
  incompleteEpisodes: number;
  successes: number;
  values: Record<string, XvlaMetric>;
  sourceSummarySha256: string;
};

export const xvla24Id = raw as unknown as Record<string, XvlaTask>;
export const xvlaOod = oodRaw as unknown as Record<"visual" | "semantic" | "behavior", Record<string, XvlaTask>>;
export const xvla24IdTaskIds = Object.keys(xvla24Id);

export type XvlaSetting = "id" | "visual" | "semantic" | "behavioral";

export function xvlaTaskFor(taskId: string, setting: XvlaSetting): XvlaTask | undefined {
  if (setting === "id") return xvla24Id[taskId];
  return xvlaOod[setting === "behavioral" ? "behavior" : setting]?.[taskId];
}

const xvlaTasks = Object.values(xvla24Id);
const xvlaTaskCount = xvlaTasks.length;
const xvlaResultVersion = xvlaTasks[0]?.resultVersion;
const xvlaExpectedEpisodes = xvlaTasks.reduce((sum, task) => sum + task.expectedEpisodes, 0);
const xvlaValidEpisodes = xvlaTasks.reduce((sum, task) => sum + task.episodes, 0);

export function xvla24IdOverallMetric(metricId: string): XvlaMetric | undefined {
  const taskMetrics = xvlaTasks
    .map((task) => task.values[metricId])
    .filter((metric): metric is XvlaMetric => metric !== undefined);
  if (taskMetrics.length === 0) return undefined;
  const available = taskMetrics.filter(
    (metric): metric is XvlaMetric & { value: number } =>
      metric.value !== null && Number.isFinite(metric.value),
  );
  const unit = taskMetrics[0].unit;
  const value = available.length
    ? available.reduce((sum, metric) => sum + metric.value, 0) / available.length
    : null;
  return {
    value,
    n: available.length,
    unit,
    primary: xvlaSampleDisplay(value, unit),
    available: value !== null,
    coverage: xvlaTaskCount ? available.length / xvlaTaskCount : null,
    detail: value === null
      ? taskMetrics[0].detail
      : `arithmetic mean of per-task aggregates over ${available.length} available tasks`,
  };
}

export function xvla24IdResult(taskId: string, metricId: string) {
  const isOverall = taskId === "all";
  const task = isOverall ? undefined : xvla24Id[taskId];
  const metric = isOverall ? xvla24IdOverallMetric(metricId) : task?.values[metricId];
  return {
    primary: metric?.primary ?? "—",
    detail: metric
      ? `${isOverall ? "Tasks" : "N"} = ${metric.n}${metric.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`} · ${metric.detail}`
      : "No validated XVLA result for this task and metric.",
    status: metric?.available ? "Computed" : "N/A",
    available: metric?.available ?? false,
    version: task?.resultVersion ?? xvlaResultVersion,
    protocol: task?.protocol ?? "XVLA final 24-task DLAa ID cohort; task-macro aggregate",
    sampleCount: metric?.n,
    cohort: isOverall
      ? `ID · ${xvlaTaskCount} tasks · ${xvlaValidEpisodes}/${xvlaExpectedEpisodes} valid episodes`
      : task ? `ID · ${task.episodes}/${task.expectedEpisodes} valid` : undefined,
  };
}

export function xvlaResult(taskId: string, metricId: string, setting: XvlaSetting = "id") {
  if (setting === "id") return xvla24IdResult(taskId, metricId);
  const split = setting === "behavioral" ? "behavior" : setting;
  const tasks = Object.values(xvlaOod[split]);
  const isOverall = taskId === "all";
  const task = isOverall ? undefined : xvlaOod[split][taskId];
  const taskMetrics = tasks.map((item) => item.values[metricId]).filter((item): item is XvlaMetric => item !== undefined);
  const available = taskMetrics.filter((item): item is XvlaMetric & { value: number } => item.value !== null && Number.isFinite(item.value));
  const overallValue = available.length ? available.reduce((sum, item) => sum + item.value, 0) / available.length : null;
  const metric = isOverall ? (taskMetrics[0] ? {
    value: overallValue,
    n: available.length,
    unit: taskMetrics[0].unit,
    primary: xvlaSampleDisplay(overallValue, taskMetrics[0].unit),
    available: overallValue !== null,
    coverage: tasks.length ? available.length / tasks.length : null,
    detail: overallValue === null ? taskMetrics[0].detail : `arithmetic mean of per-task aggregates over ${available.length} available tasks`,
  } : undefined) : task?.values[metricId];
  const validEpisodes = tasks.reduce((sum, item) => sum + item.episodes, 0);
  const expectedEpisodes = tasks.reduce((sum, item) => sum + item.expectedEpisodes, 0);
  return {
    primary: metric?.primary ?? "—",
    detail: metric ? `${isOverall ? "Tasks" : "N"} = ${metric.n}${metric.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`} · ${metric.detail}` : "No validated XVLA result for this task and metric.",
    status: metric?.available ? "Computed" : "N/A",
    available: metric?.available ?? false,
    version: task?.resultVersion ?? tasks[0]?.resultVersion,
    protocol: task?.protocol ?? `XVLA final 24-task DLAa ${split} OOD cohort; task-macro aggregate`,
    sampleCount: metric?.n,
    cohort: isOverall ? `${split} OOD · ${tasks.length} tasks · ${validEpisodes}/${expectedEpisodes} valid episodes` : task ? `${split} OOD · ${task.episodes}/${task.expectedEpisodes} valid` : undefined,
  };
}

export function xvlaSampleDisplay(value: XvlaScalar | undefined, unit = "rate") {
  if (value == null) return "N/A";
  if (unit === "rate") return `${(value * 100).toFixed(2)}%`;
  if (unit === "percentage") return (value * 100).toFixed(2);
  return `${value.toFixed(3)} ${unit}`;
}
