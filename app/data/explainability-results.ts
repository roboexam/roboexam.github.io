import publishedBundle from "./generated/explainability-results.json" with { type: "json" };

export type CorrelationWindow = "fullEpisode" | "preOutcome" | "diagnostics" | "events";
export type CorrelationStatus = "computed" | "unavailable";

export type CorrelationRow = {
  metricId: string;
  label: string;
  status: CorrelationStatus;
  window: CorrelationWindow;
  direction: "higher" | "lower" | "neutral";
  r: number | null;
  ci95: [number, number] | null;
  pValue: number | null;
  qValue: number | null;
  significant: boolean;
  successMean: number | null;
  nonSuccessMean: number | null;
  successN: number;
  nonSuccessN: number;
  n: number;
  missing: number;
  reason: string | null;
};

export type EventAssociation = CorrelationRow & {
  association: {
    metric: string;
    status: string;
    n: number;
    telemetry_coverage: number;
    success_rate_given_event: number | null;
    success_rate_given_no_event: number;
    fisher_exact_p_value: number;
    odds_ratio_success_event_vs_no_event: number | "inf";
    contingency: {
      event_success: number;
      event_non_success: number;
      no_event_success: number;
      no_event_non_success: number;
    };
  } | null;
};

export type ExplainabilityModel = {
  modelId: string;
  displayName: string;
  family: "VLA" | "WAM";
  task: string;
  resultVersion: string;
  cohort: {
    episodes: number;
    uniqueSeeds: number;
    success: number;
    partial: number;
    failure: number;
    nonSuccess: number;
    successRate: number;
  };
  method: {
    correlation: string;
    target: string;
    bootstrapSamples: number;
    confidenceInterval: string;
    multipleTesting: string;
    randomSeed: number;
    preOutcomeSteps: number;
  };
  series: {
    fullEpisode: CorrelationRow[];
    preOutcome: CorrelationRow[];
    diagnostics: CorrelationRow[];
    events: EventAssociation[];
  };
  provenance: {
    correlationSha256: string;
    episodesSha256: string;
    inputManifestSha256: string;
    sourceSchemaVersion: number;
    createdAtUtc: string;
    pipelineCommit: string;
    correlationScriptSha256: string;
  };
};

export type ExplainabilityDashboardBundle = {
  schemaVersion: "unibench.dashboard.explainability.v1";
  bundleVersion: string;
  generatedBy: string;
  relationship: "metric-success-association";
  models: Record<"Pi0.5" | "FastWAM", ExplainabilityModel>;
};

export const explainabilityDashboardBundle =
  publishedBundle as unknown as ExplainabilityDashboardBundle;
