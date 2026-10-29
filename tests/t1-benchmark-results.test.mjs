import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { aggregateFinalInitial, finalEpisodeId, loadFinalSources, readFinalPinned, sha256, validateFinalCohort } from "../scripts/export-t1-final-cohort.mjs";
import { metrics } from "../scripts/export-t1-benchmark-results.mjs";
import { t1FinalCohortRegistry as registry } from "../scripts/t1-final-cohort-registry.mjs";
import { fixture, HASH } from "./fixtures/t1-final-cohort.mjs";
import published from "../app/data/generated/t1-benchmark-results.json" with { type: "json" };
const validate = source => validateFinalCohort(source, metrics, HASH);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("final source binds two candidates to 14 tasks and exactly five selected trajectories each", () => {
  const { source } = fixture(), result = validate(source);
  assert.equal(result.episodes.length, 140); assert.equal(new Set(result.episodes.map(row => row.id)).size, 140);
  assert.deepEqual(result.models.map(row => row.id), ["gpt-6-1-sol", "deepseek"]);
  assert.deepEqual([result.scope.taskCount, result.scope.sceneCount, result.scope.processSlotCount], [14, 70, 207]);
  for (const model of result.models) for (const task of result.tasks) assert.equal(result.episodes.filter(row => row.modelId === model.id && row.taskId === task.id).length, 5);
  for (const row of result.episodes) { assert.equal(row.video.id, row.id); assert.equal(row.video.url, `/api/t1-benchmark-media/${row.id}`); }
});

test("question -> subgroup hierarchy and subgroup applicability are retained", () => {
  const make = (qid, group, value) => ({ question_id: qid, dimension: "A", group, status: "scored", score: value });
  const result = aggregateFinalInitial([make("q1", "A1", 1), make("q1", "A1", 0), make("q2", "A1", 1), make("q3", "A2", 0)]);
  assert.equal(result.a1, .75); assert.equal(result.a2, 0); assert.equal(result.a, .375); assert.equal(result.a3, undefined);
});

test("process aggregation uses fixed slots -> scene -> task instead of reached-only or micro means", () => {
  const { source } = fixture(), result = validate(source);
  for (const [candidate, modelId] of [["gpt", "gpt-6-1-sol"], ["deepseek", "deepseek"]]) {
    const episodes = result.episodes.filter(row => row.modelId === modelId), model = result.models.find(row => row.id === modelId);
    const macro = result.tasks.map(task => episodes.filter(row => row.taskId === task.id).reduce((sum, row) => sum + row.scores.c2, 0) / 5).reduce((a, b) => a + b, 0) / 14;
    close(model.scores.c2, macro); assert.notEqual(model.scores.c2, 100);
    const micro = source.slots.filter(row => row.candidate === candidate).reduce((sum, row) => sum + row.C2_score, 0) / 207 * 100;
    assert.notEqual(model.scores.c2, micro);
  }
});

test("registered zero assignments affect effective scores while preserving observed nulls and statuses", () => {
  const { source } = fixture(), original = structuredClone(source), result = validate(source);
  assert.deepEqual(source, original);
  const initial = source.initial.find(row => row.score_origin === "policy_zero"), slot = source.slots.find(row => row.score_origin === "policy_zero");
  assert.equal(initial.status, "infrastructure_missing"); assert.equal(initial.observed_score, null); assert.equal(slot.status, "reached_reference_blocked"); assert.equal(slot.observed_C2_score, null);
  assert.equal(result.provenance.missingScorePolicy, "zero-unscorable");
  assert.ok(result.models[0].scores.a < 100); assert.equal(result.models[1].scores.a, 100);
});

test("normal native null progress follows original zero fallback and no ineligible VQA score becomes zero", () => {
  const { source } = fixture(), result = validate(source);
  assert.ok(source.nativeCases.every(row => row.progress_score_raw === null)); assert.ok(result.episodes.every(row => row.execution.subtask === 0));
  assert.equal(source.initial.filter(row => row.status === "not_graded" && row.score === null).length, 16);
  assert.ok(result.episodes.some(row => row.scores.a3 === null));
});

test("derived C, VQA and 70/30 overall all agree with the sealed formal report", () => {
  const result = validate(fixture().source);
  for (const { scores } of [...result.models, ...result.episodes]) { close(scores.c, (scores.c1 + scores.c2 + scores.c3) / 3); close(scores.vqa, (scores.a + scores.b + scores.c) / 3); close(scores.overall, .7 * scores.subtask + .3 * scores.vqa); }
  const source = fixture().source; source.summary.candidates.gpt.overall.VQA += .01; assert.throws(() => validate(source), /aggregate mismatch/);
});

test("exact model/run/attempt/result/question/slot joins reject stale or mixed evidence", () => {
  for (const change of [
    s => s.episodes.pop(), s => s.episodes.push(s.episodes[0]), s => { s.episodes[0].modelId = "deepseek"; },
    s => { s.episodes[0].sourceRun += "-other"; }, s => { s.episodes[0].attempt = "attempt_01"; },
    s => { s.episodes[0].resultSha256 = "b".repeat(64); }, s => { s.initial[0].attempt_path += "-other"; },
    s => { s.initial[0].case_id = "fold_clothes/100000"; }, s => { s.initial[0].group = "A3"; }, s => s.initial.pop(), s => s.initial.push(s.initial[0]),
    s => s.slots.pop(), s => s.slots.push(s.slots[0]), s => { s.slots[0].attempt += "-other"; },
    s => { s.processQuestions[0].source_id = "repair-wrong"; }, s => { s.processQuestions[0].C2_score = .5; },
    s => { s.nativeCases[0].source_run += "-other"; }, s => { s.episodes[0].video.id = s.episodes[1].id; },
  ]) { const source = fixture().source; change(source); assert.throws(() => validate(source)); }
});

test("unapproved missing categories and arbitrary zero assignments cannot silently enter publication", () => {
  for (const change of [
    s => { s.initial[0].status = "infrastructure_missing"; s.initial[0].score = 0; },
    s => { s.initial[0].score_origin = "policy_zero"; s.initial[0].observed_score = null; s.initial[0].status = "infrastructure_missing"; },
    s => { s.slots[0].status = "reached_reference_blocked"; s.slots[0].score_origin = "policy_zero"; },
    s => { s.initial.find(row => row.score_origin === "policy_zero").observed_score = 0; },
    s => { s.summary.missing_score_policy = "zero-all-missing"; }, s => { s.summary.policy_assignments.initial_assignments = []; },
    s => { s.episodes[0].status = "infra_error"; }, s => { s.summary.initial_qualification.status = "unverified"; },
    s => { s.summary.initial_grader_revision = "agentbench.lenient-matching.v2"; }, s => { s.summary.equivalences_sha256 = "b".repeat(64); },
  ]) { const source = fixture().source; change(source); assert.throws(() => validate(source)); }
});

test("nonfinite scores, media mismatch and private public strings are rejected", () => {
  for (const change of [s => { s.initial[0].score = NaN; }, s => { s.slots[0].C3_score = Infinity; }, s => { s.episodes[0].video.url = "https://private.example/video.mp4"; }, s => { s.episodes[0].video.sha256 = "bad"; }, s => { s.episodes[0].video.frames = s.episodes[0].steps; }]) { const source = fixture().source; change(source); assert.throws(() => validate(source)); }
});

test("frozen file reader rejects drift and escaped source roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "t1-cohort-"));
  try {
    const bytes = Buffer.from("{}\n"), file = path.join(root, "cohort.json"); await writeFile(file, bytes);
    assert.deepEqual(await readFinalPinned(file, sha256(bytes)), bytes); await assert.rejects(readFinalPinned(file, HASH), /drift/);
    const outside = path.join(root, "outside"); await writeFile(outside, bytes); const child = path.join(root, "child"); await import("node:fs/promises").then(fs => fs.mkdir(child)); await symlink(outside, path.join(child, "cohort.json"));
    await assert.rejects(loadFinalSources(child), /escapes/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("published release is reproducible and has final v3 policy/provenance and 140 video records", async () => {
  assert.equal(published.resultVersion, registry.resultVersion); assert.equal(published.episodes.length, 140);
  assert.equal(published.provenance.initialScorerPolicy, registry.initialScorerPolicy); assert.equal(published.provenance.missingScorePolicy, "zero-unscorable");
  assert.equal(published.episodes.filter(row => row.video !== null).length, 140);
  for (const model of published.models) { const s = model.scores; close(s.c, (s.c1 + s.c2 + s.c3) / 3); close(s.vqa, (s.a + s.b + s.c) / 3); close(s.overall, .7 * s.subtask + .3 * s.vqa); }
  const bytes = await readFile(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url)); assert.ok(bytes.length > 0);
  assert.equal(finalEpisodeId("gpt-6-1-sol", "cover_blocks", 100012), published.episodes.find(row => row.modelId === "gpt-6-1-sol" && row.taskId === "cover_blocks" && row.layoutId === 100012).id);
});
