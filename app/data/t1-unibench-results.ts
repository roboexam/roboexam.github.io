import publishedBundle from "./generated/t1-unibench-results.json" with { type: "json" };
import { paperT1ModelIds } from "./paper-results.ts";

/** Track 1 UniBench-24 board: models x {ID, V/S/B OOD, failure recovery}. Scores are 0-100; null = not available. */
export type T1SplitId = "ID" | "V" | "S" | "B" | "REC";

export type T1TaskMetrics = {
  subtask: number | null;
  success: number | null;
  vqa?: number | null;
  a?: number | null;
  b?: number | null;
  c1?: number | null;
  c2?: number | null;
  c3?: number | null;
  scoreGain?: number | null;
  cases: number;
};

export type T1SplitMetrics = {
  score: number | null;
  subtask: number | null;
  success: number | null;
  vqa: number | null;
  a: number | null;
  b: number | null;
  c1: number | null;
  c2: number | null;
  c3: number | null;
  scoreGain: number | null;
  tasks: number;
  cases: number;
  perTask: Record<string, T1TaskMetrics>;
};

export type T1UnibenchModel = {
  id: string;
  label: string;
  family: string;
  overall: { overall: number | null; subtask: number | null; vqa: number | null } | null;
  splits: Record<T1SplitId, T1SplitMetrics | null>;
  splitsPresent: T1SplitId[];
};

export type T1UnibenchVideo = {
  id: string;
  url: string;
  sha256: string;
  bytes: number;
  frames: number | null;
  fps: number | null;
};

export type T1UnibenchEpisode = {
  id: string;
  modelId: string;
  split: T1SplitId;
  taskId: string;
  slot: string;
  layoutId: number;
  execution: {
    steps: number | null;
    subtask: number | null;
    success: boolean;
    elapsedSeconds: number | null;
    endReason: string | null;
  };
  scores: Record<string, number | null>;
  recovery: { scoreGain: number | null; failureType: string | null } | null;
  notes: string[];
  video: T1UnibenchVideo | null;
  replayVideo: T1UnibenchVideo | null;
};

export type T1UnibenchResults = {
  schemaVersion: "roboexam.t1-unibench-results.v1";
  resultVersion: string;
  generatedAt: string;
  splits: { id: T1SplitId; short: string; label: string }[];
  tasks: { id: string; label: string }[];
  models: T1UnibenchModel[];
  episodes: T1UnibenchEpisode[];
  coverage: Record<T1SplitId, Record<string, { planned?: number; scored?: number; status_counts?: Record<string, number> }>>;
  provenance: { codeCommit: string; graderRevision: string; selection: string; boardSha256: string; episodesSha256: string };
};

const releasedBundle = publishedBundle as T1UnibenchResults;
/** Bundle model ids drop the effort suffix and dots: "gpt-6.1-sol-xhigh" -> "gpt-6-1-sol". */
const paperRosterKey = (id: string) => id.replace(/-(xhigh|high)$/, "").replaceAll(".", "-");
const paperRoster = new Set([...paperT1ModelIds].map(paperRosterKey));
/** Only agents reported in the manuscript are published; ID-only extras stay out of the site. */
export const t1UnibenchResults: T1UnibenchResults = {
  ...releasedBundle,
  models: releasedBundle.models.filter((model) => paperRoster.has(model.id)),
  episodes: releasedBundle.episodes.filter((episode) => paperRoster.has(episode.modelId)),
};

export const T1_SPLITS: T1SplitId[] = ["ID", "V", "S", "B", "REC"];

/** Media catalogue: every published rollout and replay video, keyed by its stable id. */
export function t1UnibenchMediaCatalog(results: T1UnibenchResults = t1UnibenchResults): T1UnibenchVideo[] {
  return results.episodes.flatMap((episode) => [episode.video, episode.replayVideo].filter((video): video is T1UnibenchVideo => video !== null));
}
