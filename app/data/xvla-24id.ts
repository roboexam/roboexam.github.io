import raw from "./generated/xvla-24id-aggregates.json" with { type: "json" };

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
};
export type XvlaTask = {
  task: string;
  model: "XVLA";
  split: "indomain";
  resultVersion: string;
  protocol: string;
  expectedEpisodes: number;
  episodes: number;
  incompleteEpisodes: number;
  successes: number;
  values: Record<string, XvlaMetric>;
  sourceSummarySha256: string;
};

export const xvla24Id = raw as unknown as Record<string, XvlaTask>;

export function xvla24IdResult(taskId: string, metricId: string) {
  const task = xvla24Id[taskId];
  const metric = task?.values[metricId];
  return {
    primary: metric?.primary ?? "—",
    detail: metric
      ? `N = ${metric.n}${metric.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`} · ${metric.detail}`
      : "No validated XVLA result for this task and metric.",
    status: metric?.available ? "Computed" : "N/A",
    available: metric?.available ?? false,
    version: task?.resultVersion,
    protocol: task?.protocol,
    sampleCount: metric?.n,
    cohort: task ? `ID · ${task.episodes}/${task.expectedEpisodes} valid` : undefined,
  };
}

export function xvlaSampleDisplay(value: XvlaScalar | undefined, unit = "rate") {
  if (value == null) return "N/A";
  if (unit === "rate") return `${(value * 100).toFixed(2)}%`;
  return `${value.toFixed(3)} ${unit}`;
}
