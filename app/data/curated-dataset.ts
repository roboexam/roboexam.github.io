import data from "./generated/explorer-dataset.json";

export type FailureType = "clean" | "wrong_object" | "missing_step" | "wrong_sequence" | "wrong_position";
export type Camera = "cam_head" | "cam_left_wrist" | "cam_right_wrist";
export type OodKind = "visual" | "semantic" | "behavioral";
export type CuratedMedia = { camera: Camera; sha256: string; bytes: number; frames: number; fps: number; duration: number; url: string };
export type CuratedEpisode = { id: string; index: number; seed: number; type: FailureType; oodCondition: string | null; manifestSha256: string;
  instruction: string; manifest: string; sourceCommit: string | null; media: CuratedMedia[];
  admissionStatus?: string; reviewScope?: string; validatorSha256?: string; reviewSha256?: string;
  marks: { label: string; frame: number; seconds: number }[] };
export type CuratedChunk = { schemaVersion: string; catalogSha256: string; taskId: string; episodes: CuratedEpisode[] };
export const curatedDataset = data;
export type CuratedTask = typeof data.tasks[number];
export type TaskTag = "G" | "R" | "F" | "P" | "S" | "M";
export const taskTagLabels: Record<TaskTag, string> = {
  G: "Object and attribute grounding",
  R: "Spatial relations",
  F: "Functional interaction",
  P: "Precise pose alignment",
  S: "Order and stage constraints",
  M: "Multi-object completion",
};
export { partitionEpisodes } from "./curated-partition";

export const typeLabels: Record<FailureType, string> = {
  clean: "Clean success", wrong_object: "Wrong object", missing_step: "Missing step", wrong_sequence: "Wrong order", wrong_position: "Wrong placement",
};
export const cameraLabels: Record<Camera, string> = { cam_head: "Head", cam_left_wrist: "Left wrist", cam_right_wrist: "Right wrist" };
export const eventMarkLabels: Record<string, string> = { "故障开始": "Failure onset", "恢复开始": "Recovery onset" };
export const oodKindLabels: Record<OodKind, string> = {
  visual: "Visual OOD",
  semantic: "Semantic OOD",
  behavioral: "Behavioral OOD",
};
export function oodKind(condition: string | null): OodKind | null {
  if (!condition) return null;
  const normalized = condition.toLowerCase();
  if (normalized.startsWith("v")) return "visual";
  if (normalized.startsWith("s")) return "semantic";
  if (normalized.startsWith("b") || normalized.startsWith("solve_e")) return "behavioral";
  return null;
}
// Display order and labels for declared OOD conditions: visual, then semantic, then behavioral.
export const oodConditionLabels: Record<string, string> = {
  V1: "V1 · Global light 0.6×", V2: "V2 · Global light 1.4×",
  V3: "V3 · Camera pitch down 10°", V4: "V4 · Camera pitch up 10°",
  V5: "V5 · Scene appearance shift", V6: "V6 · Distractor clutter",
  V7: "V7 · Unseen object geometry", V8: "V8 · Combined visual shift",
  S1: "S1 · Equivalent instruction", S2: "S2 · Equivalent instruction",
  v1_light060: "V1 · Global light 0.6×", v2_light140: "V2 · Global light 1.4×",
  v3_cam_down10: "V3 · Camera pitch down 10°", v4_cam_up10: "V4 · Camera pitch up 10°",
  v5_background_table: "V5 · New room and table texture", v6_clutter: "V6 · Distractor clutter",
  v7_digit_family: "V7 · Unseen digit appearance", v7_unseen_instances: "V7 · Unseen object instance", v7_piece_appearance: "V7 · Unseen piece appearance", v8_combined: "V8 · Combined shift",
  s1_paraphrase: "S1 · Equivalent instruction", s2_paraphrase: "S2 · Equivalent instruction", s3_paraphrase: "S3 · Equivalent instruction",
  s4_paraphrase: "S4 · Equivalent instruction", s5_paraphrase: "S5 · Equivalent instruction",
  b1_five_digit_descending: "B1 · Five-digit descending", b2_four_digit_ascending: "B2 · Four-digit ascending",
  // Classify Objects By Language held-out mappings, listed left/middle/right basket.
  b1_mapping_watch_car_pepper: "B1 · Held-out mapping: watch / car / pepper",
  b2_mapping_car_pepper_chocolate_bar: "B2 · Held-out mapping: car / pepper / chocolate bar",
  b3_mapping_watch_wooden_toy_chocolate_bar: "B3 · Held-out mapping: watch / wooden toy / chocolate bar",
  b4_mapping_pepper_watch_wooden_toy: "B4 · Held-out mapping: pepper / watch / wooden toy",
  b5_mapping_chocolate_bar_wooden_toy_car: "B5 · Held-out mapping: chocolate bar / wooden toy / car",
};
for (const n of ["01", "02", "03", "04", "05"]) {
  oodConditionLabels["solve_e" + n] = "E" + n + " · Three-equation combination";
}
const oodOrder = Object.keys(oodConditionLabels);
export function oodLabel(condition: string | null) {
  return condition ? oodConditionLabels[condition] ?? condition : "";
}
export function oodRank(condition: string) {
  const rank = oodOrder.indexOf(condition);
  return rank === -1 ? oodOrder.length : rank;
}
export function secondsLabel(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
