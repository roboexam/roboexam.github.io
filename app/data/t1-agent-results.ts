import publishedBundle from "./generated/t1-agent-results.json" with { type: "json" };

export type T1Scores = {
  count: number | null;
  color: number | null;
  a1: number | null;
  a2: number | null;
  b1: number | null;
  c1: number | null;
  a: number | null;
  b: number | null;
  c: number | null;
  composite: number | null;
};

export type T1Model = {
  id: string;
  label: string;
  family: string;
  requestModel: string;
  responseModel: string;
  answered: number;
  expected: number;
  scores: T1Scores;
  maxProgress: number | null;
};

export type T1Episode = {
  id: string;
  modelId: string;
  layoutId: number;
  answered: number;
  expected: number;
  scores: T1Scores;
  execution: {
    steps: number;
    progress: number | null;
    success: boolean | null;
    state: string;
    reason: string;
    elapsedSeconds: number | null;
  };
  video: {
    id: string;
    url: string;
    sha256: string;
    bytes: number;
    frames: number | null;
    fps: number | null;
    hasMotion: boolean;
  };
  provenance: {
    initialSealSha256: string;
    executionSealSha256: string;
    sameEpisode: boolean;
    attempt: string;
  };
};

export type T1AgentResults = {
  schemaVersion: "roboexam.t1-results.v1";
  resultVersion: "t1-stack-bowls-20261018-v1";
  generatedAt: string;
  task: { id: "stack_bowls"; label: "Stack Bowls"; layoutIds: number[] };
  models: T1Model[];
  episodes: T1Episode[];
  scorer: { commit: string; policy: string; reportSha256: string; notes: string[] };
  sourceHashes: Record<string, string>;
};

export const t1AgentResults = publishedBundle as T1AgentResults;
