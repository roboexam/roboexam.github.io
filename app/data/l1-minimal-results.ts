import publishedBundle from "./generated/l1-minimal-results.json" with { type: "json" };

export type L1Outcome = "success" | "partial" | "failure";
export type L1TaskStatus = "golden_ready" | "building";

export type L1Episode = {
  id: string;
  outcome: L1Outcome;
  label: string;
  branch: string;
  sceneSeed: number;
  actionCount: number | null;
  frameCount: number;
  completedCount: number;
  totalSubgoals: number;
  progressPercent: number;
  nativeProcessScore: number | null;
  normalizedScore: number | null;
  intervention?: string;
  haltSeconds?: number | null;
  gtSource?: string;
  reviewStatus?: string;
  media: {
    url: string;
    sha256: string;
    bytes: number;
    frameCount: number;
    frameRate: string;
    width: number;
    height: number;
    durationSeconds: number;
  };
};

export type L1Task = {
  id: string;
  name: string;
  instruction: string;
  status: L1TaskStatus;
  reviewStatus: "user_accepted" | "awaiting_user_review";
  reviewNote: string;
  episodes: L1Episode[];
};

export type L1DimensionId = "spatial" | "decomposition" | "progress" | "failure";

export type L1Metric = {
  id: string;
  dimension: L1DimensionId;
  name: string;
  zh: string;
  formula: string;
  question: string;
  eligible: number;
  scope: string;
  methodClass: string;
  ownership: string;
  why: string;
  method: string;
  citation: { label: string; url: string };
  runCalculation: string;
  score: number;
};

export type L1Dimension = {
  id: L1DimensionId;
  resultKey: string;
  name: string;
  zh: string;
  description: string;
  score: number;
  metrics: L1Metric[];
};

export type L1Sample = {
  id: string;
  dimensionId: L1DimensionId;
  capability: string;
  taskId: string;
  taskName: string;
  outcome: string;
  outcomeLabel: string;
  prompt: string;
  status: string;
  media: Array<{ url: string; sha256: string; bytes: number; timestampSeconds: number }>;
  prediction: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  groundTruthEvidence: string;
  modelEvidence: string;
  metrics: Array<{
    id: string;
    score: number | null;
    aggregateScore: number;
    name: string;
    zh: string;
    formula: string;
    methodClass: string;
    explanation: string;
    calculation: {
      scope: string;
      inputs: string[];
      substitution: string;
      result: string;
      aggregateScore: number;
    };
  }>;
};

export type L1MinimalBundle = {
  schemaVersion: "unibench.dashboard.l1-minimal.v1";
  bundleVersion: string;
  evidenceStatus: string;
  headline: string;
  definition: string;
  protocol: {
    publicCamera: string;
    privateDebugCameras: string[];
    matchedPrefixFrames: number[];
    matchedPrefixExact: string;
    sourceSummarySha256: string;
    multiTaskSourceSummarySha256: string;
    scoreScale: string;
    aggregation: string;
    resultSummarySha256: string;
    metricContractVersion: string;
    model: string;
    runId: string;
  };
  dimensions: L1Dimension[];
  candidateAudit: {
    schemaVersion: string;
    definitionSource: {
      documentUrl: string;
      documentTitle: string;
      documentRevision: number;
      schemaVersion: string;
      selectionPolicy: string;
    };
    definition: string;
    evidenceGrades: Record<"E0" | "E1" | "E2" | "E3", string>;
    layers: Record<"L1-A" | "L1-B" | "L1-C" | "L1-D", string>;
    metrics: Array<{
      metric_id: string;
      layer: "L1-A" | "L1-B" | "L1-C" | "L1-D";
      name: string;
      evidence_grade: "E0" | "E1" | "E2" | "E3";
      score_eligible: boolean;
      score: number | null;
      source: string;
      document_section: string;
      document_heading: string;
      input_contract: string;
      output_contract: string;
      calculation: string;
      why_considered: string;
      origin: string;
      source_note: string;
      need: string;
      question: string;
      answer_example: string;
      plain_scoring: string[];
      explains: string;
      blocker: string | null;
      legacy_metric_id: string | null;
      source_candidate_evidence_grade: "E0" | "E1" | "E2" | "E3" | null;
      source_candidate_score: number | null;
    }>;
    layerScores: Record<"L1-A" | "L1-B" | "L1-C" | "L1-D", number | null>;
    partialLevel1Score: number | null;
    coverageWarning: string;
    perTask: Record<string, {
      metric_results: Array<{ metric_id: string; layer: string; score_eligible: boolean; score: number | null }>;
      layer_scores: Record<string, number | null>;
      partial_level_1_score: number | null;
    }>;
    sourceRunId: string;
    model: string;
    defaultSelectedMetricIds: string[];
    upstreamPins: Record<string, string>;
    bleuSampleEvidence: Array<Record<string, unknown>>;
  };
  pipeline: Array<{ id: string; label: string; detail: string }>;
  tasks: L1Task[];
  samples: L1Sample[];
  results: {
    level1Score: number;
    taskResults: Array<{
      taskId: string;
      taskName: string;
      level1Score: number;
      dimensions: Array<{ id: L1DimensionId; score: number }>;
    }>;
    strongestDimensionId: L1DimensionId;
    weakestDimensionId: L1DimensionId;
    sampleCount: number;
    parseFailures: number;
    status: string;
  };
  evidenceBoundary: string;
  counts: {
    plannedTasks: number;
    readyTasks: number;
    plannedEpisodes: number;
    readyEpisodes: number;
    plannedMetrics: number;
    frozenMetrics: number;
    modelPredictions: number;
  };
};

export const l1MinimalBundle = publishedBundle as L1MinimalBundle;
