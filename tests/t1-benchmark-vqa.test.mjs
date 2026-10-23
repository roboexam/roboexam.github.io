import assert from "node:assert/strict";
import test from "node:test";
import { safeDisplayText, validateFinalCohort, validateFinalVqa } from "../scripts/export-t1-final-cohort.mjs";
import { metrics } from "../scripts/export-t1-benchmark-results.mjs";
import { fixture, HASH } from "./fixtures/t1-final-cohort.mjs";
import formal from "../app/data/generated/t1-benchmark-results.json" with { type: "json" };
import published from "../app/data/generated/t1-benchmark-vqa.json" with { type: "json" };
const setup = () => { const { source, details } = fixture(); const formal = validateFinalCohort(source, metrics, HASH); return { source, details, formal }; };
const validate = ({ source, details, formal }) => validateFinalVqa(details, source, formal, HASH);

test("VQA projects 140 exact episodes, 780 initial records, 414 slots and 82 captured first answers", () => {
  const input = setup(), result = validate(input);
  assert.deepEqual(result.episodes.map(row => row.episodeId), input.formal.episodes.map(row => row.id));
  assert.equal(result.episodes.flatMap(row => row.initial).length, 780); assert.equal(result.episodes.flatMap(row => row.checkpoints).length, 414);
  const answers = result.episodes.flatMap(row => row.checkpoints).filter(row => row.status === "scored"); assert.equal(answers.length, 82); assert.equal(new Set(answers.map(row => row.questionId)).size, 82);
});

test("existing saved grades are scaled once and full answer text is preserved", () => {
  const input = setup(); input.details.episodes[0].initial[0].response = JSON.stringify({ value: "a long public answer".repeat(1000) });
  const result = validate(input); assert.equal(result.episodes[0].initial[0].response, input.details.episodes[0].initial[0].response); assert.equal(result.episodes[0].initial[0].score, 100);
  const checkpoint = result.episodes[0].checkpoints[0]; assert.equal(checkpoint.scores.c2, 100); assert.ok(Math.abs(checkpoint.scores.c3 - 100 / 3) < 1e-10);
});

test("two policy zeros retain original statuses and do not fabricate a model answer", () => {
  const result = validate(setup()), initial = result.episodes.flatMap(row => row.initial).find(row => row.scoreOrigin === "policy_zero"), point = result.episodes.flatMap(row => row.checkpoints).find(row => row.scoreOrigin === "policy_zero");
  assert.equal(initial.status, "infrastructure_missing"); assert.equal(initial.score, 0); assert.equal(initial.response, null); assert.equal(initial.observedScore, null);
  assert.equal(point.status, "reached_reference_blocked"); assert.equal(point.question, null); assert.equal(point.response, null); assert.deepEqual(point.observedScores, { c2: null, c3: null }); assert.deepEqual(point.scores, { c2: 0, c3: 0 });
});

test("ineligible questions preserve source answers while remaining ungraded null", () => {
  const result = validate(setup()), rows = result.episodes.flatMap(row => row.initial).filter(row => row.status === "not_graded");
  assert.equal(rows.length, 16); assert.ok(rows.every(row => row.score === null && row.response === "{}"));
});

test("wrong model, task, attempt, source digest and missing rows are rejected", () => {
  for (const change of [
    d => { d.episodes[0].modelId = "deepseek"; }, d => { d.episodes[0].taskId = "fold_clothes"; }, d => { d.episodes[0].attempt = "attempt_99"; },
    d => d.episodes.pop(), d => d.episodes.push(d.episodes[0]), d => d.episodes[0].initial.pop(), d => d.episodes[0].checkpoints.pop(),
    d => { d.sourceHashes.selection = "b".repeat(64); }, d => { d.episodes[0].initial[0].score = .5; },
    d => { d.episodes[0].initial[0].metricId = "c3"; }, d => { d.episodes[0].checkpoints[0].scores.c2 = .5; },
    d => { d.evidence.process[0].requestSha256 = "b".repeat(64); }, d => { d.evidence.process[0].firstResponseSha256 = "b".repeat(64); },
    d => { d.evidence.initial[0].answers[0].publicInputSha256 = "b".repeat(64); },
  ]) { const input = setup(); change(input.details); assert.throws(() => validate(input)); }
});

test("source-private fields, hidden reasoning and fabricated unanswered content cannot be published", () => {
  for (const change of [
    d => { d.episodes[0].initial[0].reference = "private gold"; }, d => { d.episodes[0].initial[0].response = "/bh/private/data"; },
    d => { d.episodes[0].initial[0].response = "<think>hidden reasoning</think>"; }, d => { d.episodes[0].context = "private"; },
    d => { d.episodes.flatMap(row => row.checkpoints).find(row => row.status === "not_reached").response = "fabricated"; },
    d => { d.episodes.flatMap(row => row.initial).find(row => row.scoreOrigin === "policy_zero").response = "fabricated"; },
    d => { d.episodes.flatMap(row => row.checkpoints).find(row => row.scoreOrigin === "policy_zero").question = "fabricated"; },
  ]) { const input = setup(); change(input.details); assert.throws(() => validate(input)); }
  for (const text of ["/root/private", "https://private.example/api", "\\u002fhome/private", "sk-1234567890123456", "Bearer abcd1234567890123"]) assert.throws(() => safeDisplayText(text, "test"));
});

test("native trigger and first returned context steps bind to the same selected episode", () => {
  const input = setup(); input.details.episodes[0].checkpoints[0].triggerStep = 21; assert.throws(() => validate(input), /beyond/);
  const other = setup(); other.details.episodes[0].checkpoints[0].returnStep = 101; assert.throws(() => validate(other), /beyond/);
});

test("published questions and saved first answers cover both formal candidates with final source hashes", () => {
  assert.equal(published.episodes.length, 140); assert.equal(published.resultVersion, formal.resultVersion);
  assert.deepEqual(published.episodes.map(row => row.episodeId), formal.episodes.map(row => row.id));
  for (const [name, hash] of Object.entries(formal.provenance.sourceHashes)) assert.equal(published.sourceHashes[name], hash);
  const questions = published.episodes.flatMap(row => row.initial), points = published.episodes.flatMap(row => row.checkpoints);
  assert.equal(questions.length, 780); assert.equal(points.length, 414);
  assert.equal(questions.filter(row => row.scoreOrigin === "policy_zero").length, 1); assert.equal(points.filter(row => row.scoreOrigin === "policy_zero").length, 1);
  assert.equal(points.filter(row => row.status === "scored").length, 82);
  for (const modelId of ["gpt-6-1-sol", "deepseek"]) for (const task of formal.tasks) assert.equal(published.episodes.filter(row => row.modelId === modelId && row.taskId === task.id).length, 5);
});
