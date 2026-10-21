import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import formal from "../app/data/generated/t1-benchmark-results.json" with { type: "json" };
import published from "../app/data/generated/t1-benchmark-vqa.json" with { type: "json" };
import { buildVqaBundle, fingerprint, readPinned, safeText, sha256, validateVqaSource } from "../scripts/export-t1-benchmark-vqa.mjs";
import { t1BenchmarkVqaRegistry as registry } from "../scripts/t1-benchmark-vqa-registry.mjs";

const HASH = "a".repeat(64);
const formalFile = new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url);
const formalBefore = await readFile(formalFile);

// Synthetic receipts and saved-grade fixtures use already-public display text.
// They are never accepted by the production loader's frozen source SHA pins.
function fixture() {
  const episodes = structuredClone(published.episodes);
  const initial = [], slots = [], execution = [];
  const initialReceipts = [], processReceipts = new Map();
  for (const episode of episodes) {
    const nativeId = "fixture-native-" + episode.episodeId;
    const publicEpisode = formal.episodes.find(row => row.id === episode.episodeId);
    execution.push({ id: episode.episodeId, taskId: episode.taskId, layoutId: episode.layoutId, attempt: episode.attempt,
      relativeAttempt: `episodes/${episode.taskId}/${episode.layoutId}/${episode.attempt}`, episodeId: nativeId, steps: publicEpisode.execution.steps });
    initialReceipts.push({ episodeId: episode.episodeId, manifestSha256: HASH, questionsSha256: HASH, predictionsSha256: HASH,
      answers: episode.initial.map(row => ({ questionId: row.questionId, instanceId: "fixture-" + row.questionId, publicInputSha256: HASH, answerSha256: HASH })) });
    for (const question of episode.initial) {
      if (question.score !== null) question.score /= 100;
      initial.push({ taskId: episode.taskId, layoutId: episode.layoutId, attempt: episode.attempt, questionId: question.questionId,
        group: question.metricId === "b_interaction" ? "B_interaction_semantics" : question.metricId.toUpperCase(),
        score: question.score, status: question.status, formatCompliant: question.formatCompliant });
    }
    for (const checkpoint of episode.checkpoints) {
      checkpoint.scores.c2 /= 100; checkpoint.scores.c3 /= 100;
      slots.push({ slot_id: checkpoint.slotId, stage_id: checkpoint.stageId, task_name: episode.taskId, layout_id: episode.layoutId,
        attempt: `episodes/${episode.taskId}/${episode.layoutId}/${episode.attempt}`, episode_id: nativeId,
        status: checkpoint.status, question_id: checkpoint.questionId, C2_score: checkpoint.scores.c2, C3_score: checkpoint.scores.c3,
        source_verified: checkpoint.status === "scored" ? true : null, official_question_result: checkpoint.status === "scored" ? true : null });
      if (checkpoint.status === "scored") processReceipts.set(checkpoint.questionId, { questionId: checkpoint.questionId,
        publicQuestionSha256: HASH, firstResponseSha256: HASH, responseEvidenceSha256: HASH, requestSha256: HASH });
    }
  }
  const evidence = { initial: initialReceipts, process: [...processReceipts.values()] };
  const sourceHashes = { ...published.sourceHashes, initialEvidence: fingerprint(evidence.initial), processEvidence: fingerprint(evidence.process) };
  delete sourceHashes.vqaDetails;
  return { source: { schema: registry.sourceSchema, resultVersion: registry.resultVersion, sourceHashes, evidence, episodes },
    snapshots: { initial: { grades: initial }, execution: { episodes: execution }, process: { slots } } };
}

test("release contains all seventy exact episodes, 390 initial records and 207 fixed checkpoint slots", () => {
  assert.equal(published.schemaVersion, registry.schemaVersion); assert.equal(published.resultVersion, formal.resultVersion);
  assert.deepEqual(published.episodes.map(row => row.episodeId), formal.episodes.map(row => row.id));
  assert.equal(published.episodes.length, 70);
  const initial = published.episodes.flatMap(episode => episode.initial), checkpoints = published.episodes.flatMap(episode => episode.checkpoints);
  assert.equal(initial.length, 390); assert.equal(initial.filter(row => row.status === "scored").length, 382);
  assert.equal(initial.filter(row => row.status === "not_graded").length, 8);
  assert.equal(checkpoints.length, 207); assert.equal(checkpoints.filter(row => row.status === "not_reached").length, 199);
  const scored = checkpoints.filter(row => row.status === "scored");
  assert.equal(scored.length, 8); assert.equal(new Set(scored.map(row => row.questionId)).size, 8);
  assert.equal(published.episodes.filter(episode => episode.checkpoints.some(row => row.status === "scored")).length, 7);
  for (const episode of published.episodes) {
    const original = formal.episodes.find(row => row.id === episode.episodeId);
    for (const key of ["resultVersion", "modelId", "taskId", "layoutId", "attempt"]) assert.equal(episode[key], key === "resultVersion" ? formal.resultVersion : original[key]);
  }
});

test("copies complete questions and final answers while scaling existing saved grades once", () => {
  const { source, snapshots } = fixture(), result = validateVqaSource(source, snapshots);
  for (const episode of result.episodes) {
    const original = published.episodes.find(row => row.episodeId === episode.episodeId);
    for (let i = 0; i < episode.initial.length; i++) {
      assert.equal(episode.initial[i].question, original.initial[i].question); assert.equal(episode.initial[i].response, original.initial[i].response);
      assert.equal(episode.initial[i].score, original.initial[i].score);
    }
    for (let i = 0; i < episode.checkpoints.length; i++) assert.deepEqual(episode.checkpoints[i], original.checkpoints[i]);
  }
  assert.ok(published.episodes.some(episode => episode.initial.some(row => row.response && row.response.length > 1000)), "full saved plans are not truncated");
  const zero = result.episodes.flatMap(row => row.initial).find(row => row.status === "scored" && row.score === 0);
  assert.ok(zero && typeof zero.response === "string");
});

test("qualification nulls and unreached zeros never become fabricated answers", () => {
  const { source, snapshots } = fixture(), result = validateVqaSource(source, snapshots);
  for (const row of result.episodes.flatMap(episode => episode.initial).filter(row => row.status === "not_graded")) {
    assert.equal(row.score, null); assert.equal(row.response, null); assert.equal(row.formatCompliant, null);
  }
  for (const row of result.episodes.flatMap(episode => episode.checkpoints).filter(row => row.status === "not_reached")) {
    for (const field of ["questionId", "question", "response", "triggerStep", "returnStep"]) assert.equal(row[field], null);
    assert.deepEqual(row.scores, { c2: 0, c3: 0 });
  }
  const checkpoint = source.episodes[0].checkpoints.find(row => row.status === "not_reached"); checkpoint.question = "A fabricated question";
  assert.throws(() => validateVqaSource(source, snapshots), /fabricated/);
});

test("checkpoint display preserves the native event and first returned boundary as separate steps", () => {
  const episode = published.episodes.find(row => row.taskId === "insert_key" && row.layoutId === 100002);
  const checkpoint = episode.checkpoints.find(row => row.status === "scored");
  assert.equal(checkpoint.triggerStep, 158); assert.equal(checkpoint.returnStep, 192);
  const { source, snapshots } = fixture();
  source.episodes.find(row => row.episodeId === episode.episodeId).checkpoints.find(row => row.status === "scored").returnStep = 157;
  assert.throws(() => validateVqaSource(source, snapshots), /outside saved episode/);
});

test("rejects stale model/task/layout/attempt/version identities and missing or duplicate records", () => {
  for (const change of [
    s => { s.episodes[0].modelId = "other-model"; }, s => { s.episodes[0].taskId = "other-task"; },
    s => { s.episodes[0].layoutId = 123; }, s => { s.episodes[0].attempt = "attempt_99"; },
    s => { s.episodes[0].resultVersion = "stale"; }, s => s.episodes.pop(), s => s.episodes.push(s.episodes[0]),
    s => s.episodes[0].initial.pop(), s => s.episodes[0].initial.push(s.episodes[0].initial[0]),
    s => s.episodes[0].checkpoints.pop(), s => s.episodes[0].checkpoints.push(s.episodes[0].checkpoints[0]),
  ]) { const { source, snapshots } = fixture(); change(source); assert.throws(() => validateVqaSource(source, snapshots)); }
});

test("saved grade and source receipt mismatches are rejected without regrading answers", () => {
  for (const change of [
    s => { s.episodes[0].initial[0].score = .5; },
    s => { s.episodes[0].initial[0].metricId = "c3"; },
    s => { s.episodes[0].initial[0].formatCompliant = null; },
    s => { s.episodes[0].checkpoints.find(row => row.status === "scored").scores.c2 = .5; },
    s => { s.evidence.initial[0].answers[0].answerSha256 = "b".repeat(64); },
    s => { s.sourceHashes.initial = "b".repeat(64); },
  ]) { const { source, snapshots } = fixture(); change(source); assert.throws(() => validateVqaSource(source, snapshots)); }
  const { source, snapshots } = fixture(); snapshots.process.slots.find(row => row.status === "scored").source_verified = false;
  assert.throws(() => validateVqaSource(source, snapshots));
});

test("rejects unsafe strings and hidden context/reference fields without changing final text", () => {
  for (const unsafe of ["/bh/private/data", "/Users/example/file", "https://example.com/private", "sk-1234567890123456", "<think>hidden reasoning</think>", "\\u002fhome/private/data"]) {
    assert.throws(() => safeText(unsafe, "test"), /unsafe private content/);
  }
  safeText("", "normal empty first answer");
  for (const change of [
    s => { s.episodes[0].initial[0].response = "/root/private/file"; },
    s => { s.episodes[0].initial[0].reference = "hidden"; },
    s => { s.episodes[0].checkpoints[0].context = "hidden"; },
    s => { s.episodes[0].systemMessages = []; },
  ]) { const { source, snapshots } = fixture(); change(source); assert.throws(() => validateVqaSource(source, snapshots)); }
  assert.doesNotMatch(JSON.stringify(published), /\/bh\/|\/Users\/|"reference"|"systemMessages"|"raw_response"|https?:\/\//);
});

test("source SHA drift and escaped source paths fail before publication", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "t1-vqa-"));
  try {
    const original = Buffer.from("saved public evidence\n"), file = path.join(root, "initial.json");
    await writeFile(file, original); assert.deepEqual(await readPinned(file, sha256(original)), original);
    await writeFile(file, "changed"); await assert.rejects(readPinned(file, sha256(original)), /SHA-256 drift/);
    const outside = path.join(root, "outside.json"); await writeFile(outside, "{}");
    const { mkdir } = await import("node:fs/promises"); const sourceRoot = path.join(root, "sources"); await mkdir(sourceRoot);
    await symlink(outside, path.join(sourceRoot, "initial.json"));
    await assert.rejects(buildVqaBundle(sourceRoot), /escapes allowlisted/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public JSON is deterministic, source pins agree and formal scores are never rewritten", async () => {
  const bytes = await readFile(new URL("../app/data/generated/t1-benchmark-vqa.json", import.meta.url));
  assert.equal(bytes.toString("utf8"), JSON.stringify(published, null, 2) + "\n");
  assert.equal(published.sourceHashes.vqaDetails, registry.detailsSha256);
  for (const [name, hash] of Object.entries(formal.provenance.sourceHashes)) assert.equal(published.sourceHashes[name], hash);
  assert.deepEqual(await readFile(formalFile), formalBefore);
  assert.equal(createHash("sha256").update(formalBefore).digest("hex"), registry.formalBundleSha256);
});
