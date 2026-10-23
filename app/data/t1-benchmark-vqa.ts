/** Public detail contract. Client components import these types only. */
export type T1BenchmarkVqaInitialQuestion = {
  questionId: string;
  metricId: string;
  question: string;
  response: string | null;
  score: number | null;
  status: "scored" | "not_graded" | "infrastructure_missing";
  formatCompliant: boolean | null;
  scoreOrigin?: "policy_zero";
  observedScore?: null;
};

export type T1BenchmarkVqaCheckpoint = {
  slotId: string;
  stageId: string;
  status: "scored" | "not_reached" | "reached_reference_blocked";
  questionId: string | null;
  question: string | null;
  response: string | null;
  triggerStep: number | null;
  returnStep: number | null;
  scores: { c2: number; c3: number };
  scoreOrigin?: "policy_zero";
  observedScores?: { c2: null; c3: null };
};

export type T1BenchmarkVqaEpisode = {
  episodeId: string;
  resultVersion: string;
  modelId: string;
  taskId: string;
  layoutId: number;
  attempt: string;
  initial: T1BenchmarkVqaInitialQuestion[];
  checkpoints: T1BenchmarkVqaCheckpoint[];
};

export type T1BenchmarkVqaBundle = {
  schemaVersion: "roboexam.t1-benchmark-vqa.v1";
  resultVersion: string;
  sourceHashes: Record<string, string>;
  episodes: T1BenchmarkVqaEpisode[];
};
