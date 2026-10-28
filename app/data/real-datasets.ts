import type { ActionTraceSource } from "./action-trace";

export type RealDatasetCamera = { key: string; label: string };
export type RealDatasetSummary = {
  id: string; name: string; kind: "robot" | "ego"; format: string; robotType: string;
  taskCount: number; episodeCount: number; frameCount: number; fps: number;
  cameras: RealDatasetCamera[]; availability: "available" | "unavailable"; warnings: string[];
};
export type RealDatasetCatalog = {
  schemaVersion: "roboexam.real-datasets.v1"; version: string; scannedAt: string;
  refreshSeconds: number; datasets: RealDatasetSummary[]; warnings: string[];
};
export type RealEpisodeEntry = {
  id: string; index: number; name: string; frames: number; durationSeconds: number;
  instruction: string; originalEpisodeId: string | null;
};
export type RealDatasetEntries = { dataset: RealDatasetSummary; version: string; episodes: RealEpisodeEntry[] };
export type RealDatasetEpisode = RealEpisodeEntry & {
  datasetId: string; metadataSha256: string;
  media: { id: string; camera: string; label: string; url: string;
    startSeconds: number; endSeconds: number; durationSeconds: number }[];
  trace: ActionTraceSource;
  warnings: string[];
};
