import publishedBundle from "./generated/t1-benchmark-results.json" with { type: "json" };

export type T1BenchmarkScores = Record<string, number | null>;

export type T1BenchmarkMetric = {
  id: string;
  label: string;
  definition: string;
  formula: string;
  aggregation: string;
  unit: "percent";
};

export type T1BenchmarkEpisode = {
  id: string;
  resultVersion?: string;
  modelId: string;
  taskId: string;
  layoutId: number;
  attempt: string;
  execution: {
    steps: number;
    subtask: number | null;
    success: boolean | null;
    elapsedSeconds: number | null;
  };
  scores: T1BenchmarkScores;
  video: {
    id: string;
    url: string;
    sha256: string;
    bytes: number;
    frames: number | null;
    fps: number | null;
    hasMotion?: boolean;
  } | null;
};

export type T1BenchmarkModel = {
  id: string;
  label: string;
  requestModel: string;
  scores: T1BenchmarkScores;
  publication?: {
    resultVersion: string | null;
    sourceModelId: string;
    scope: {
      taskCount: number;
      sceneCount: number;
      processSlotCount: number | null;
    } | null;
    metricOverrides?: Record<string, T1BenchmarkMetric>;
    sourceHashes?: Record<string, string>;
    scorerPolicy?: string;
    scorerCommit?: string;
  };
};

export type T1BenchmarkResults = {
  schemaVersion: "roboexam.t1-benchmark-results.v1";
  resultVersion: string;
  generatedAt: string;
  scope: {
    taskCount: number;
    sceneCount: number;
    processSlotCount: number;
    layoutIds: number[];
    taskIds: string[];
  };
  models: T1BenchmarkModel[];
  tasks: { id: string; label: string }[];
  episodes: T1BenchmarkEpisode[];
  metrics: T1BenchmarkMetric[];
  provenance: {
    publicationScopeId: string;
    sourceHashes: Record<string, string>;
    initialScorerPolicy: string;
    processProtocol: string;
    processCaptureSha256: string;
    processScorerSha256: string;
    baselineCommit?: string;
    equivalencesSha256?: string;
    missingScorePolicy?: string;
  };
};

export const t1BenchmarkResults = publishedBundle as T1BenchmarkResults;
