import publishedBundle from "./generated/pearson-matrix-results.json" with { type: "json" };

export type PearsonModelId = "pi05" | "fastwam" | "cosmos_predict2_5" | "ctrlworld";
export type PearsonFamily = "VLA" | "WAM" | "ACWM";

export type PearsonMatrixPanel = {
  modelId: PearsonModelId;
  displayName: string;
  family: PearsonFamily;
  episodeCount: number;
  split: "formal100" | "heldout73";
  relationship: "metric-to-episode-success-and-metric-to-metric" | "metric-to-metric";
  successCorrelationAvailable: boolean;
};

export type PearsonFigure = {
  title: string;
  url: string;
  alt: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
};

export type PearsonMetricPair = {
  leftMetricId: string;
  leftDisplayName: string;
  rightMetricId: string;
  rightDisplayName: string;
  r: number;
  strength: "negligible" | "weak" | "moderate" | "strong";
};

export type PearsonMetricMatrix = {
  modelId: PearsonModelId;
  displayName: string;
  family: PearsonFamily;
  episodeCount: number;
  split: "formal100" | "heldout73";
  metricIds: string[];
  metricLabels: string[];
  values: number[][];
  outcomeFieldsExcluded: true;
};

export type PearsonMatrixDashboardBundle = {
  schemaVersion: "unibench.dashboard.pearson-matrix.v3";
  bundleVersion: string;
  generatedBy: string;
  task: "stack_bowls";
  title: string;
  method: {
    correlation: string;
    targetUnit: "episode";
    targetKind: "strict-binary-success";
    binaryOutcome: string;
    aggregateSuccessRateIsTarget: false;
    groupAggregation: string;
    ordinalSensitivity: string;
    confidenceInterval: string;
    multiplicity: string;
    causalityClaim: false;
  };
  figures: {
    metricVsEpisodeSuccess: PearsonFigure;
    metricOnlyMatrices: PearsonFigure;
  };
  panels: PearsonMatrixPanel[];
  vlaFindings: Array<{
    modelId: "pi05" | "fastwam";
    displayName: string;
    family: "VLA" | "WAM";
    episodeCount: number;
    cohortSuccessRate: number;
    classificationCounts: Record<"success" | "half-success" | "failure", number>;
    target: {
      unit: "episode";
      kind: "strict-binary-success";
      definition: string;
      aggregateSuccessRateIsTarget: false;
    };
    groups: Array<{
      groupId: string;
      displayName: string;
      metricIds: string[];
      aggregation: "arithmetic-mean-of-member-correlations";
      meanR: number;
    }>;
    metrics: Array<{
      metricId: string;
      displayName: string;
      r: number;
      qValue: number;
      ci95: [number, number];
      successMean: number;
      nonSuccessMean: number;
      significant: boolean;
      direction: "positive" | "negative";
      strength: "negligible" | "weak" | "moderate" | "strong";
    }>;
  }>;
  metricOnlyMatrices: PearsonMetricMatrix[];
  crossModel: {
    repeatedSignificantMetricIds: string[];
    pairedSeedSuccess: {
      pairedSeedCount: number;
      r: number;
      pValue: number;
      contingency: Record<string, number>;
    };
  };
  acwmFindings: Array<{
    modelId: "cosmos_predict2_5" | "ctrlworld";
    displayName: string;
    episodeCount: number;
    successCorrelationAvailable: false;
    pixelFidelityPairs: PearsonMetricPair[];
    trajectoryMostRelated: PearsonMetricPair;
  }>;
  provenance: {
    resultManifestSha256: string;
    analysisSummarySha256: string;
    sourceSha256: Record<string, string>;
  };
};

export const pearsonMatrixDashboardBundle =
  publishedBundle as unknown as PearsonMatrixDashboardBundle;
