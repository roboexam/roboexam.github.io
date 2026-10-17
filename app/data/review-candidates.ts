import data from "./generated/review-candidates.json";

export type ReviewCamera =
  | "cam_head"
  | "cam_left_wrist"
  | "cam_right_wrist";
export type ReviewMedia = {
  camera: ReviewCamera;
  sha256: string;
  bytes: number;
  frames: number;
  fps: number;
  duration: number;
  url: string;
};
export type ReviewCandidate = {
  id: string;
  attempt: string;
  seed: number;
  manifestSha256: string;
  finalCountKeySha256: string;
  selectionReportSha256: string;
  reviewStatus: "pending_human_video_review";
  instruction: string;
  qualification: { functional: boolean; clean: boolean; strongFidelity: boolean;
    time: { status: string; passed?: boolean | null } };
  contractId: string;
  sourceCommit: string | null;
  media: ReviewMedia[];
};
export type ReviewTaskChunk = {
  schemaVersion: "unibench.review-candidate-task.v1";
  snapshotId: string;
  taskId: string;
  reviewStatus: "pending_human_video_review";
  admissionStatus: "not_authorized_not_admitted";
  episodes: ReviewCandidate[];
};

export type ReviewTask = {
  id: string;
  count: number;
  dataUrl: string;
  sha256: string;
};

// A fully admitted snapshot legitimately has no tasks. Keep the contract typed
// independently of that snapshot so [] does not infer the element type never.
export const reviewCandidates: Omit<typeof data, "tasks"> & {
  tasks: ReviewTask[];
} = data;
