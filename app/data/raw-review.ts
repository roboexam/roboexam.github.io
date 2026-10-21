import type { ActionTraceSource } from "./action-trace";
export type RawFolder = { id: string; path: string; count: number };
export type RawTask = { id: string; name: string; count: number; folders: RawFolder[] };
export type RawCatalog = {
  schemaVersion: "roboexam.raw-review.v1"; version: string; scannedAt: string;
  refreshSeconds: number; tasks: RawTask[]; count: number; warnings: string[];
};
export type RawEntry = { id: string; name: string; folderId: string; folder: string };
export type RawTaskEntries = { taskId: string; version: string; entries: RawEntry[] };
export type RawEpisode = RawEntry & {
  taskId: string; originalEpisodeId: string | null; seed: number | null;
  manifestSha256: string; reviewVersion: string; identityKind: "manifest" | "source" | "file_inventory";
  instruction: string; sourceCommit: string | null;
  media: { camera: "cam_head" | "cam_left_wrist" | "cam_right_wrist"; url: string; contentSha256: string; duration: number }[];
  files: { name: string; bytes: number }[]; warnings: string[];
  strongFidelity: boolean | null; trace: ActionTraceSource;
};
