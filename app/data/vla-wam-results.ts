import publishedBundle from "./generated/vla-wam-results.json" with { type: "json" };

export type VlaWamMetricAvailability =
  | "available"
  | "not_run"
  | "input_missing"
  | "evaluator_failed"
  | "partial"
  | "unsupported";
export type VlaWamMetricValue =
  | number
  | string
  | null
  | [number, number]
  | Record<string, { count: number; proportion: number }>;

export type VlaWamMetricResult = {
  availability: VlaWamMetricAvailability;
  status:
    | "pass"
    | "computed"
    | "not_run"
    | "input_missing"
    | "evaluator_failed"
    | "partial"
    | "unsupported";
  direction: string | null;
  unit: string;
  value: VlaWamMetricValue;
  sampleStd: number | null;
  n: number;
  primary: string;
  aux: string;
};

export type VlaWamModelResult = {
  modelId: string;
  displayName: string;
  family: "VLA" | "WAM";
  policy: string;
  task: string;
  resultVersion: string;
  protocol: string;
  pipelineVersion: string;
  createdAtUtc: string;
  cohort: {
    episodes: number;
    uniqueSeeds: number;
    success: number;
    partial: number;
    failure: number;
  };
  values: Record<string, VlaWamMetricResult>;
  provenance: {
    summarySha256: string;
    inputManifestSha256: string;
    pipelineCommit: string;
    eventSpecVersion: string;
    tmcAnnotationVersion: string;
  };
};

export type VlaWamDashboardBundle = {
  schemaVersion: "unibench.dashboard.vla-wam.v1";
  bundleVersion: string;
  generatedBy: string;
  protocol: string;
  pipelineVersion: string;
  sourceRevision: string;
  models: Record<string, VlaWamModelResult>;
};

export const vlaWamDashboardBundle = publishedBundle as unknown as VlaWamDashboardBundle;
