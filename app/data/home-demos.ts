// Homepage demo reel: browser-safe catalog built by scripts/build-home-demos.py.
import catalog from "./generated/home-demos.json" with { type: "json" };
import wall from "./generated/hero-wall.json" with { type: "json" };
import { STATIC_SITE } from "../static-site.ts";

export type DemoMedia = { file: string; sha256: string; bytes: number };
export type DemoClip = {
  rig: string; task: string; variant: number; episode: number; instruction: string; fps: number;
  camera: string; speed: number; duration: number; width: number; height: number;
  video: DemoMedia; poster: DemoMedia;
};
export type DemoRig = { id: string; label: string; unit: string; datasets: number; episodes: number; tasks: string[] };
export type DemoTask = { id: string; label: string; variants: number; episodes: number; rigs: string[] };
export type HomeDemos = {
  schema: "roboexam.home-demos.v1"; version: string; source: string;
  totals: { rigs: number; datasets: number; episodes: number; frames: number; cameras: number; fps: number[] };
  rigs: DemoRig[]; tasks: DemoTask[]; featured: DemoClip[]; strip: DemoClip[];
};

export const homeDemos = catalog as HomeDemos;

export const demoMediaUrl = (media: DemoMedia) =>
  STATIC_SITE ? `/static-media/home-demos/${media.file}` : `/api/home-demo-media/${media.file}`;
export const rigFor = (id: string) => homeDemos.rigs.find((rig) => rig.id === id);

// The real catalogs name these tasks T1–T3 (scripts/build-home-demos.py, TASKS); a clip's source
// dataset is the one whose name carries "3cameras_<rig>_<code>_ID<variant>".
const CATALOG_TASK_CODE: Record<string, string> = { button_sequence: "T1", towel_folding: "T2", vegetable_sorting: "T3" };
export function demoDatasetHint(clip: DemoClip) {
  const unit = clip.rig.split("-").pop();
  const code = CATALOG_TASK_CODE[clip.task];
  return unit && code ? `3cameras_${unit}_${code}_ID${clip.variant}` : null;
}
export const taskFor = (id: string) => homeDemos.tasks.find((task) => task.id === id);

/** Hero background: one pre-rendered scrolling column of evaluation clips per track. */
export type WallColumn = {
  track: "T1" | "T2" | "T3" | "T4"; label: string; source: string; direction: "up" | "down";
  period: number; width: number; height: number; tasks: string[]; video: DemoMedia; poster: DemoMedia;
};
export const heroWall = wall as { schema: "roboexam.hero-wall.v1"; version: string; columns: WallColumn[] };
