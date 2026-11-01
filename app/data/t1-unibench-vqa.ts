/** Public per-episode VQA contract for the Track 1 UniBench-24 board. Client components import types only. */
export type T1UnibenchInitialQuestion = {
  questionId: string;
  metricId: string;
  dimension: string;
  question: string;
  response: string | null;
  score: number | null;
  status: "scored" | "policy_zero" | "not_graded";
};

export type T1UnibenchCheckpoint = {
  slotId: string;
  status: string;
  c2: number | null;
  c3: number | null;
};

export type T1UnibenchVqaEpisode = {
  episodeId: string;
  modelId: string;
  split: string;
  taskId: string;
  instruction: string | null;
  initial: T1UnibenchInitialQuestion[];
  checkpoints: T1UnibenchCheckpoint[];
};

export type T1UnibenchVqaBundle = {
  schemaVersion: "roboexam.t1-unibench-vqa.v1";
  resultVersion: string;
  episodes: T1UnibenchVqaEpisode[];
};
