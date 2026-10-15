import assert from "node:assert/strict";

export const TYPES = ["clean", "wrong_object", "missing_step", "wrong_sequence", "wrong_position"];
// OOD conditions, declared by the pipeline's visual, semantic and behavioral
// contracts (configs/contracts/*_ood_conditions.v1.json). v7_digit_family and
// the two digit-order behaviors are Arrange's; v7_unseen_instances and the
// five b*_mapping_* held-out basket mappings are Classify Objects By
// Language's (ood18_20260924 cohort); v7_piece_appearance is Play
// Tic-Tac-Toe's (same-symbol piece appearance). The other ids are shared.
export const OOD_CONDITIONS = ["v1_light060", "v2_light140", "v3_cam_down10", "v4_cam_up10",
  "v5_background_table", "v6_clutter", "v7_digit_family", "v7_unseen_instances", "v7_piece_appearance", "v8_combined",
  "s1_paraphrase", "s2_paraphrase", "s3_paraphrase", "s4_paraphrase", "s5_paraphrase",
  "b1_five_digit_descending", "b2_four_digit_ascending",
  "b1_mapping_watch_car_pepper", "b2_mapping_car_pepper_chocolate_bar",
  "b3_mapping_watch_wooden_toy_chocolate_bar", "b4_mapping_pepper_watch_wooden_toy",
  "b5_mapping_chocolate_bar_wooden_toy_car"];
export const DOCUMENT_OOD_CONDITIONS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "S1", "S2"];
export const DOCUMENT_OOD_TASKS = ["stack_bowls", "store_tools_in_toolbox", "play_stacking_toy", "insert_key"];
const ALL_OOD_CONDITIONS = [...OOD_CONDITIONS, ...DOCUMENT_OOD_CONDITIONS];
export const CAMERAS = ["cam_head", "cam_left_wrist", "cam_right_wrist"];
export const ROOT = "/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data";
export function relativePath(value) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0 && !value.startsWith("/") && !value.includes("\\"));
  assert.ok(value.split("/").every((v) => /^[a-zA-Z0-9_.-]+$/.test(v) && v !== "." && v !== ".."));
  return value;
}
export function validateRow(row, manifest, registry) {
  assert.equal(row.acceptance_status, "strictly_selected");
  assert.match(row.task_name, /^[a-zA-Z][a-zA-Z0-9_]*$/);
  assert.ok(TYPES.includes(row.failure_type));
  const documentOod = DOCUMENT_OOD_CONDITIONS.includes(row.ood_condition);
  const preservedBowlId = documentOod && row.task_name === "stack_bowls" && /^episode_ood65:[a-f0-9]{20}$/.test(row.episode_id);
  assert.ok(preservedBowlId || /^episode:[a-f0-9]+$/.test(row.episode_id), "invalid immutable episode ID");
  assert.match(row.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(row.episode_index) && row.episode_index >= 0);
  for (const key of ["task_name", "failure_type", "episode_id", "scene_seed"]) assert.equal(row[key], manifest[key]);
  assert.equal(manifest.schema_version, "benchmark2027.robodojo_failure_recovery_episode.v3");
  // An OOD episode is a clean execution under a declared visual, semantic or
  // behavioral condition, so it keeps failure_type "clean" and is separated by
  // its condition in both the directory tree and the numbering registry.
  const condition = row.ood_condition ?? null;
  if (documentOod || DOCUMENT_OOD_CONDITIONS.includes(manifest.ood_condition)) {
    assert.ok(documentOod && DOCUMENT_OOD_TASKS.includes(row.task_name), "document OOD task/condition mismatch");
    assert.equal(manifest.dataset_category, "ood");
    assert.equal(manifest.ood_condition, condition);
    assert.equal(manifest.ood?.condition, condition);
    assert.equal(manifest.task_variant_id, null);
    const quota = ["V8", "S1", "S2"].includes(condition) ? 10 : 5;
    assert.ok(Array.from({length:quota}, (_, i) => `C${String(i + 1).padStart(2, "0")}`).includes(manifest.ood?.base_id));
    assert.equal(row.document_ood_evidence?.schema_version, "benchmark2027.document_ood_evidence.v1");
    assert.match(row.document_ood_evidence.validator_sha256, /^[a-f0-9]{64}$/);
  }
  let category;
  let namespaceKey;
  if (condition !== null) {
    assert.ok(ALL_OOD_CONDITIONS.includes(condition), `undeclared OOD condition: ${condition}`);
    assert.equal(row.failure_type, "clean");
    assert.equal(row.category, "ood");
    category = `ood/${condition}`;
    namespaceKey = `${row.task_name}/ood:${condition}`;
  } else {
    category = row.failure_type === "clean" ? "clean" : `failure_recovery/${row.failure_type}`;
    assert.equal(row.category, row.failure_type === "clean" ? "clean" : "failure_recovery");
    namespaceKey = `${row.task_name}/${row.failure_type}`;
  }
  assert.equal(row.manifest, `${row.task_name}/${category}/episode_${row.episode_index}/episode_manifest.json`);
  assert.equal(registry.namespaces[namespaceKey].assignments[row.episode_id], row.episode_index);
  assert.deepEqual(Object.keys(row.videos).sort(), [...CAMERAS].sort());
  for (const camera of CAMERAS) {
    relativePath(row.videos[camera]);
    assert.ok(row.videos[camera].startsWith(row.manifest.replace("episode_manifest.json", "")));
  }
}
export function validateChunk(chunk) {
  assert.equal(chunk.schemaVersion, "unibench.curated-task.v1");
  const ids = new Set();
  for (const e of chunk.episodes) {
    assert.equal(ids.has(e.id), false); ids.add(e.id);
    assert.ok(TYPES.includes(e.type));
    if (e.oodCondition != null) assert.ok(ALL_OOD_CONDITIONS.includes(e.oodCondition));
    if (DOCUMENT_OOD_CONDITIONS.includes(e.oodCondition)) {
      assert.ok(DOCUMENT_OOD_TASKS.includes(chunk.taskId));
      assert.equal(e.type, "clean");
      assert.notEqual(e.inDomain, true, "OOD cannot also be in domain");
    }
    assert.ok(Number.isSafeInteger(e.index) && e.index >= 0);
    assert.deepEqual(e.media.map((m) => m.camera), CAMERAS);
    for (const m of e.media) {
      assert.match(m.sha256, /^[a-f0-9]{64}$/);
      assert.equal(m.url, `/api/curated-media?file=${m.sha256}.mp4`);
      assert.ok(m.bytes > 0 && m.frames > 0 && m.fps > 0 && m.duration > 0);
    }
  }
  assert.ok(!JSON.stringify(chunk).includes("/mnt/"));
  return chunk;
}
