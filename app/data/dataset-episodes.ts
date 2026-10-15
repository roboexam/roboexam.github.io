import publishedIndex from "./generated/dataset-episodes.json" with { type: "json" };

export type DatasetAvailability =
  | "available"
  | "not_run"
  | "input_missing"
  | "evaluator_failed"
  | "partial"
  | "unsupported";

export type DatasetProtocolKind = "oracle_gt" | "policy_rollout" | "acwm_open_loop";
export type DatasetPairingStatus = "verified_same_seed" | "requested_seed_only" | "source_episode";
export type DatasetOutcome = "success" | "half-success" | "failure" | "not_applicable";

export type DatasetEpisodeMedia = {
  id: string;
  kind: string;
  label: string;
  preferred: boolean;
  url: string;
  relativePath: string;
  sha256: string;
  bytes: number;
  frameCount: number;
  frameRate: string;
  width: number;
  height: number;
  durationSeconds: number;
};

export type DatasetEpisode = {
  id: string;
  taskId: string;
  modelId: string;
  catalogOrdinal: number;
  requestedSeed: number | null;
  sourceEpisodeIndex: number | null;
  outcome: DatasetOutcome;
  sourceOutcome: string;
  finalScore: number | null;
  protocolKind: DatasetProtocolKind;
  pairingStatus: DatasetPairingStatus;
  media: DatasetEpisodeMedia[];
};

export type DatasetEpisodeChunk = {
  schemaVersion: "unibench.dashboard.dataset-episode-cohort.v1";
  cohortId: string;
  taskId: string;
  modelId: string;
  pairingStatus: DatasetPairingStatus;
  episodes: DatasetEpisode[];
};

export type DatasetCohort = {
  id: string;
  taskId: string;
  modelId: string;
  displayName: string;
  family: "Oracle" | "VLA" | "WAM" | "ACWM";
  resultVersion: string;
  protocolKind: DatasetProtocolKind;
  protocolLabel: string;
  availability: DatasetAvailability;
  pairingStatus: DatasetPairingStatus;
  catalogEpisodeCount: number;
  distinctRequestedSeedCount: number | null;
  outcomeCounts: {
    success: number;
    "half-success": number;
    failure: number;
    notApplicable: number;
  };
  sourceSha256: string;
  manifestSha256: string | null;
  dataUrl: string;
  episodeDataSha256: string;
};

export type DatasetTask = {
  id: string;
  displayName: string;
  availability: DatasetAvailability;
  selectionMode: "seed" | "source_episode";
  pairingStatus: DatasetPairingStatus;
  pairingNote: string;
  catalogEpisodeCount: number;
  baselineCount: number;
  alignmentSha256: string;
};

export type DatasetEpisodeIndex = {
  schemaVersion: "unibench.dashboard.dataset-episodes.v2";
  bundleVersion: string;
  generatedBy: string;
  mediaBundleVersion: string;
  mediaManifestSha256: string;
  taskCount: number;
  cohortCount: number;
  episodeCount: number;
  mediaCount: number;
  tasks: DatasetTask[];
  cohorts: DatasetCohort[];
};

export const datasetEpisodeBundle = publishedIndex as unknown as DatasetEpisodeIndex;
