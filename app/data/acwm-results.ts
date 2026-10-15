import publishedBundle from "./generated/acwm-results.json" with { type: "json" };

export type AcwmMetricStatus =
  | "OK"
  | "NOT_RUN"
  | "INPUT_MISSING"
  | "EVALUATOR_FAILED"
  | "PARTIAL"
  | "UNSUPPORTED";
export type AcwmMetricAvailability =
  | "available"
  | "not_run"
  | "input_missing"
  | "evaluator_failed"
  | "partial"
  | "unsupported";
export type AcwmMetricGranularity =
  | "episode"
  | "distribution"
  | "judge_episode"
  | "counterfactual_group";

export type AcwmMetricGroup = {
  sampleCount: number;
  value: number | null;
};

export type AcwmMetricResult = {
  availability: AcwmMetricAvailability;
  granularity: AcwmMetricGranularity;
  direction: string;
  unit: string;
  primary: string;
  aux: string;
  status: AcwmMetricStatus;
  groups: Record<string, AcwmMetricGroup>;
  missingEvidence?: {
    episodeCount: number;
    distinctInitialFrameCount: number;
    eligibleGroupCount: number;
    requirement: string;
  };
};

export type AcwmPublishedMedia = {
  prediction: { url: string; sha256: string };
  groundTruth: { url: string; sha256: string };
};

export type AcwmInteractionEvidence = {
  rawScore: number;
  normalizedScore: number;
  reason: string;
  instruction: string;
  sampledFrameCount: number;
  sourceVideoSha256: string;
  error: null;
};

export type AcwmSampleResult = {
  id: string;
  episodeId: string;
  heldout73: boolean;
  trainingMembership: string;
  values: Record<string, string>;
  media: AcwmPublishedMedia | null;
  interaction: AcwmInteractionEvidence | null;
};

export type AcwmModelResult = {
  modelId: string;
  displayName: string;
  task: string;
  resultVersion: string;
  status: string;
  completed: string;
  protocol: string;
  values: Record<string, AcwmMetricResult>;
  samples: AcwmSampleResult[];
  provenance: Record<string, unknown>;
};

export type AcwmDashboardBundle = {
  schemaVersion: string;
  bundleVersion: string;
  generatedBy: string;
  primarySplit: string;
  protocol: string;
  sourceRevisions: Record<string, string>;
  mediaManifestSha256: string;
  models: Record<string, AcwmModelResult>;
};

export const acwmDashboardBundle = publishedBundle as AcwmDashboardBundle;
export const acwmSampleResults = Object.fromEntries(
  Object.entries(acwmDashboardBundle.models).map(([model, result]) => [model, result.samples]),
) as Record<string, AcwmSampleResult[]>;
