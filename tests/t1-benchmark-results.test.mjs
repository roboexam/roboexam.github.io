import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { aggregateInitial, buildPublishedBundle, episodeId, readPinned, sha256, validatePublicationSources } from "../scripts/export-t1-benchmark-results.mjs";
import { t1BenchmarkRegistry as registry } from "../scripts/t1-benchmark-result-registry.mjs";
import published from "../app/data/generated/t1-benchmark-results.json" with { type: "json" };

const HASH = "a".repeat(64);
const taskIds = registry.tasks.map(row => row.id);
const plans = registry.scenePlans.filter(row => taskIds.includes(row.taskId));
const scoreSourceHashes = Object.fromEntries(["initial", "execution", "process", "media"].map(name => [name, HASH]));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// Synthetic source records exercise the publication contract without private archives.
// Every source answer is represented only by a numeric score; no model is invoked.
function fixture() {
  const episodes = plans.map(plan => ({
    id: episodeId(plan.taskId, plan.layoutId), taskId: plan.taskId, layoutId: plan.layoutId,
    attempt: "attempt_02", relativeAttempt: `episodes/${plan.taskId}/${plan.layoutId}/attempt_02`,
    episodeId: `synthetic-${plan.taskId}-${plan.layoutId}`, status: "failure", steps: 10,
    progressScore: 0, elapsedSeconds: 1, resultSha256: HASH,
  }));
  const excluded = new Set(registry.initialExcludedInstances);
  const grades = plans.flatMap(plan => Object.entries(registry.initialQuestions[plan.taskId]).map(([questionId, metadata]) => {
    const exempt = excluded.has(`${plan.taskId}/${plan.layoutId}/${questionId}`);
    return { taskId: plan.taskId, layoutId: plan.layoutId, attempt: "attempt_02", questionId, ...metadata,
      status: exempt ? "not_graded" : "scored", score: exempt ? null : 1, formatCompliant: true };
  }));
  const slots = registry.scenePlans.flatMap(plan => plan.slotIds.map(slot_id => ({
    slot_id, task_name: plan.taskId, layout_id: plan.layoutId, stage_id: slot_id.split("/")[2],
    status: "not_reached", attempt: `episodes/${plan.taskId}/${plan.layoutId}/attempt_02`,
    episode_id: `synthetic-${plan.taskId}-${plan.layoutId}`, C2_score: 0, C3_score: 0,
    source_verified: null, question_id: null, official_question_result: null,
  })));
  return {
    initial: { schema: "roboexam.t1-benchmark-initial-source.v1", scorerPolicy: "agentbench.lenient-matching.v2", originalSummarySha256: HASH, originalGradesSha256: HASH,
      summary: { schema: "agentbench.run-summary.v2", tasks: taskIds.map(task => ({ task, layouts: 5, A: 1, B: 1, C: 1, vqa_composite: 1, mean_progress: 0, success_rate: 0 })), overall: { layouts: 70, A: 1, B: 1, C: 1, vqa_composite: 1, mean_progress: 0, success_rate: 0 } }, grades },
    execution: { schema: "roboexam.t1-benchmark-execution-source.v1", episodes },
    process: { schema: "roboexam.t1-benchmark-process-source.v1", originalSummarySha256: HASH, originalSlotsSha256: HASH, protocol: "agentbench.native16.c2c3.v1", slots,
      summary: { schema: "agentbench.native16.live-scores.v1", answer_provenance: "verified_capture", answer_provenance_verified: true, diagnostic_only: false,
        capture_implementation_sha256: HASH, scorer_implementation_sha256: HASH, implementation_sha256: HASH, catalogue_sha256: HASH, campaign_plan_sha256: HASH,
        coverage: { planned_slots: 237, scored_slots: 0, status_counts: { not_reached: 237 } }, verified_scored_questions: 0, qa_dispatch_count: 0 } },
    media: { schema: "roboexam.t1-benchmark-media-source.v1", episodes: episodes.map(row => ({ id: row.id, taskId: row.taskId, layoutId: row.layoutId, attempt: row.attempt, video: null })) },
  };
}

function markScored(source, selected, c2 = 1, c3 = 1) {
  for (const row of source.process.slots.filter(selected)) Object.assign(row, { status: "scored", C2_score: c2, C3_score: c3, source_verified: true, official_question_result: true, question_id: "synthetic-" + row.slot_id });
  const scored = source.process.slots.filter(row => row.status === "scored").length;
  source.process.summary.coverage.scored_slots = scored;
  source.process.summary.coverage.status_counts = { not_reached: 237 - scored, scored };
  source.process.summary.verified_scored_questions = scored;
  source.process.summary.qa_dispatch_count = scored;
}

test("published release preserves the approved fixed scope and actual model identity", () => {
  assert.equal(published.schemaVersion, "roboexam.t1-benchmark-results.v1");
  assert.equal(published.resultVersion, "t1-robodojo14-deepseek-20261021-v1");
  assert.equal(published.scope.taskCount, 14); assert.equal(published.scope.sceneCount, 70); assert.equal(published.scope.processSlotCount, 207);
  assert.deepEqual(published.scope.taskIds, taskIds);
  assert.ok(!taskIds.some(id => ["pack_objects_into_box", "pour_by_language", "stack_bowls"].includes(id)));
  assert.deepEqual(published.episodes.filter(row => row.taskId === "cover_blocks").map(row => row.layoutId), [100000, 100001, 100002, 100007, 100012]);
  assert.equal(new Set(published.episodes.map(row => row.id)).size, 70);
  assert.equal(published.models.length, 1); assert.equal(published.models[0].requestModel, "deepseek-flash");
  assert.equal(published.episodes.filter(row => row.video !== null).length, 70);
  for (const episode of published.episodes) {
    assert.equal(episode.video.id, episode.id);
    assert.equal(episode.video.url, "/api/t1-benchmark-media/" + episode.id);
    assert.match(episode.attempt, /^attempt_\d+$/);
  }
});

test("published scores follow hierarchical C, ABC and seventy/thirty formulas", () => {
  const scores = published.models[0].scores;
  close(scores.c, (scores.c1 + scores.c2 + scores.c3) / 3);
  close(scores.vqa, (scores.a + scores.b + scores.c) / 3);
  close(scores.overall, .7 * scores.subtask + .3 * scores.vqa);
  close(scores.overall, 18.880331302644514);
  close(scores.c2, 3.428571428571429); close(scores.c3, 3.9523809523809526);
  assert.notEqual(scores.c2, 75); assert.notEqual(scores.c3, 100 * 11 / 12);
  for (const row of [scores, ...published.episodes.map(episode => episode.scores)]) for (const value of Object.values(row)) assert.ok(value === null || (Number.isFinite(value) && value >= 0 && value <= 100));
});

test("C2 macro aggregation retains all planned slots and does not pool unequal task sizes", () => {
  const source = fixture();
  markScored(source, row => row.task_name === "arrange_largest_number");
  const result = validatePublicationSources(source, scoreSourceHashes);
  close(result.models[0].scores.c2, 100 / 14);
  const reached = source.process.slots.filter(row => row.status === "scored").length;
  assert.ok(Math.abs(result.models[0].scores.c2 - reached / 207 * 100) > 1);
  assert.equal(result.scope.processSlotCount, 207);
});

test("initial subgroup aggregation gives registered groups equal weight rather than pooling questions", () => {
  const row = (questionId, group, score) => ({ questionId, dimension: "A", group, status: "scored", score });
  const result = aggregateInitial([row("q1", "A1", 1), row("q2", "A1", 1), row("q3", "A2", 0)]);
  assert.equal(result.a, .5); assert.equal(result.a1, 1); assert.equal(result.a2, 0);
  assert.notEqual(result.a, 2 / 3); assert.equal(result.a3, undefined);
});

test("full C extends initial subgroup hierarchy instead of averaging initial composite with C2/C3", () => {
  const result = validatePublicationSources(fixture(), scoreSourceHashes);
  close(result.models[0].scores.c, 100 / 3);
  close(result.models[0].scores.vqa, 700 / 9);
  assert.notEqual(result.models[0].scores.vqa, 100 / 3);
});

test("nonapplicable subgroups remain null; only admitted normal failures use the frozen progress fallback", () => {
  const source = fixture(); source.execution.episodes[0].progressScore = null;
  const result = validatePublicationSources(source, scoreSourceHashes);
  assert.equal(result.episodes[0].execution.subtask, 0);
  assert.equal(result.episodes[0].scores.subtask, 0); // explicit frozen normal-failure report policy
  assert.equal(source.execution.episodes[0].progressScore, null); // source is preserved
  assert.equal(result.episodes[0].video, null);
  assert.equal(source.initial.grades.filter(row => row.score === null).length, 8);
  const noA3 = plans.find(plan => !Object.values(registry.initialQuestions[plan.taskId]).some(row => row.group === "A3"));
  assert.equal(result.episodes.find(row => row.taskId === noA3.taskId).scores.a3, null);
  source.execution.episodes[0].status = "missing_episode";
  assert.throws(() => validatePublicationSources(source, scoreSourceHashes), /cannot become zero/);
});

test("missing, repeated and out-of-scope scenes or questions are rejected", () => {
  for (const change of [
    s => s.execution.episodes.pop(),
    s => s.execution.episodes.push(s.execution.episodes[0]),
    s => { s.execution.episodes[0].taskId = "pack_objects_into_box"; },
    s => s.initial.grades.pop(),
    s => s.initial.grades.push(s.initial.grades[0]),
    s => { s.initial.grades[0].status = "pending"; s.initial.grades[0].score = null; },
  ]) { const source = fixture(); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes)); }
});

test("all 237 original slots must remain and selected missing/blocked/pending slots cannot count as zero", () => {
  for (const change of [
    s => s.process.slots.pop(),
    s => s.process.slots.push(s.process.slots[0]),
    ...["missing_episode", "reached_reference_blocked", "pending", "ready"].map(status => s => { s.process.slots[0].status = status; s.process.slots[0].C2_score = null; s.process.slots[0].C3_score = null; }),
  ]) { const source = fixture(); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes)); }
});

test("exact final attempt and episode bindings reject stale initial, process or video evidence", () => {
  for (const change of [
    s => { s.initial.grades[0].attempt = "attempt_01"; },
    s => { s.process.slots[0].attempt = "episodes/arrange_largest_number/100000/attempt_01"; },
    s => { s.process.slots[0].episode_id = "other-episode"; },
    s => { s.media.episodes[0].attempt = "attempt_01"; },
    s => { s.execution.episodes[0].status = "infra_error"; },
  ]) { const source = fixture(); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes)); }
});

test("claimed scores need verified capture and individually verified official first responses", () => {
  for (const change of [
    s => { s.process.summary.answer_provenance = "unverified_import"; },
    s => { s.process.summary.answer_provenance_verified = false; },
    s => { s.process.summary.diagnostic_only = true; },
    s => { s.process.slots[0].source_verified = false; },
    s => { s.process.slots[0].official_question_result = false; },
    s => { s.process.slots[0].C3_score = null; },
  ]) { const source = fixture(); markScored(source, row => row.slot_id === source.process.slots[0].slot_id); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes)); }
});

test("formal task/overall aggregates cannot override question scores", () => {
  for (const change of [
    s => { s.initial.summary.tasks[0].A = .9; },
    s => { s.initial.summary.tasks[0].vqa_composite = .9; },
    s => { s.initial.summary.overall.B = .9; },
    s => { s.initial.grades[0].score = .5; },
    s => { s.initial.summary.tasks[0].mean_progress = .5; },
  ]) { const source = fixture(); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes), /aggregate/); }
});

test("schema and finite ranges reject fields that could leak raw answers or private paths", () => {
  for (const change of [
    s => { s.initial.rawResponse = "private"; },
    s => { s.initial.grades[0].reference = "private"; },
    s => { s.initial.grades[0].score = NaN; },
    s => { s.initial.grades[0].score = true; },
    s => { s.execution.episodes[0].steps = Infinity; },
    s => { s.media.episodes[0].video = { id: s.media.episodes[0].id, url: "/bh/private/video.mp4", sha256: HASH, bytes: 1, frames: 1, fps: 1 }; },
  ]) { const source = fixture(); change(source); assert.throws(() => validatePublicationSources(source, scoreSourceHashes)); }
  const text = JSON.stringify(published);
  assert.doesNotMatch(text, /\/bh\/|\/Users\/|raw_response|answer_text|"reference"|https?:\/\//);
});

test("source byte drift fails SHA pin and source symlinks cannot escape the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "t1-benchmark-"));
  try {
    const original = Buffer.from('{"score":1}\n'), file = path.join(root, "data.json");
    await writeFile(file, original); assert.deepEqual(await readPinned(file, sha256(original)), original);
    await writeFile(file, '{"score":0}\n'); await assert.rejects(readPinned(file, sha256(original)), /SHA-256 drift/);
    const source = path.join(root, "source");
    const { mkdir } = await import("node:fs/promises"); await mkdir(source);
    await symlink(file, path.join(source, "initial.json"));
    await assert.rejects(buildPublishedBundle(source), /escapes/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("committed public bundle has deterministic JSON and all pinned source digests", async () => {
  const text = await readFile(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), "utf8");
  assert.equal(text, JSON.stringify(published, null, 2) + "\n");
  for (const [name, digest] of Object.entries(registry.sourcePins)) assert.equal(published.provenance.sourceHashes[name], digest);
  assert.deepEqual(new Set(published.metrics.map(row => row.id)), new Set(Object.keys(published.models[0].scores)));
});

test("managed artifact source root can be selected by operator environment without changing pins", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "t1-benchmark-root-"));
  const previous = process.env.T1_BENCHMARK_SOURCE_ROOT;
  try {
    process.env.T1_BENCHMARK_SOURCE_ROOT = root;
    await writeFile(path.join(root, "initial.json"), "{}");
    await assert.rejects(buildPublishedBundle(), /source SHA-256 drift: initial.json/);
    assert.equal(published.provenance.sourceHashes.initial, registry.sourcePins.initial);
  } finally {
    if (previous === undefined) delete process.env.T1_BENCHMARK_SOURCE_ROOT;
    else process.env.T1_BENCHMARK_SOURCE_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
