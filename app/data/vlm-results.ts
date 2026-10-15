import publishedBundle from "./generated/vlm-results.json" with { type: "json" };

export type VlmMetricResult = {
  availability: "available";
  granularity: "membership_aggregate";
  direction: "higher";
  unit: string;
  primary: string;
  aux: string;
  status: "OK";
  sourceBenchmark: string;
  split: string;
  scope: string;
  metricName: string;
  metricKind: "binary" | "continuous";
  metricRole: string;
  plannedN: number;
  effectiveN: number;
  rawN: number;
  parseRate: number;
  score: number;
  mean: number;
  median: number;
  std: number;
  q25: number;
  q75: number;
  parseFailureN: number;
  modelFailureN: number;
  infrastructureFailureN: number;
};

export type VlmMetricSample = {
  metricId: string;
  evaluationId: string;
  canonicalSampleId: string;
  sourceBenchmark: string;
  split: string;
  nativeTask: string;
  question: string;
  rawResponse: string;
  parsedResponse: unknown;
  terminalState: "scored";
  metricName: string;
  score: number;
  scoreDisplay: string;
  nativeScore: number;
  nativeScoreDisplay: string;
  correct: boolean | null;
  promptVersion: string;
  inputCount: number;
  displayedInputCount: number;
  media: Array<{
    url: string;
    sha256: string;
    label: string;
    inputIndex: number;
  }>;
  note: string;
};

export type VlmModelResult = {
  modelId: string;
  displayName: string;
  resultVersion: string;
  runId: string;
  status: "PASS_DETERMINISTIC";
  completed: string;
  promptVersion: string;
  sourceCommit: string;
  metricLane: "deterministic";
  cohort: {
    memberships: number;
    canonicalPredictions: number;
    deterministicScored: number;
    judgePending: number;
    parseFailures: number;
    infrastructureFailures: number;
  };
  judge: {
    availability: "judge_pending";
    memberships: number;
    status: "JUDGE_PENDING";
    note: string;
  };
  values: Record<string, VlmMetricResult>;
  samples: Record<string, VlmMetricSample>;
  provenance: Record<string, string | boolean>;
};

export type VlmDashboardBundle = {
  schemaVersion: string;
  bundleVersion: string;
  generatedBy: string;
  protocol: string;
  models: Record<string, VlmModelResult>;
};

export const vlmDashboardBundle = publishedBundle as VlmDashboardBundle;
