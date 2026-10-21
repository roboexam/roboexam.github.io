import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import formal from "../app/data/generated/t1-benchmark-results.json" with { type: "json" };
import { t1BenchmarkRegistry as scoreRegistry } from "./t1-benchmark-result-registry.mjs";
import { t1BenchmarkVqaRegistry as registry } from "./t1-benchmark-vqa-registry.mjs";

export const sha256 = value => createHash("sha256").update(value).digest("hex");
const SHA = /^[a-f0-9]{64}$/;
function object(value, label) { assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), label + " must be an object"); }
function fields(value, names, label) { object(value, label); assert.deepEqual(Object.keys(value).sort(), [...names].sort(), label + " fields"); }
function exactSet(values, expected, label) { assert.deepEqual([...values].sort(), [...expected].sort(), label); }
function hash(value) { assert.equal(typeof value, "string", "SHA-256 value"); assert.match(value, SHA, "SHA-256 value"); }
function unique(rows, getId, label) {
  assert.ok(Array.isArray(rows), label + " must be an array");
  const map = new Map();
  for (const row of rows) { object(row, label); const id = getId(row); assert.equal(map.has(id), false, "duplicate " + label); map.set(id, row); }
  return map;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const fingerprint = value => sha256(JSON.stringify(canonical(value)) + "\n");
const sceneKey = (taskId, layoutId) => taskId + "/" + layoutId;
const initialKey = (taskId, layoutId, questionId) => sceneKey(taskId, layoutId) + "/" + questionId;
const metricId = group => group === "B_interaction_semantics" ? "b_interaction" : group.toLowerCase();
function score(value) { assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1, "saved score must be finite in [0,1]"); }
function step(value) { assert.ok(Number.isSafeInteger(value) && value >= 0, "checkpoint step must be a nonnegative integer"); }

export function safeText(value, label) {
  assert.equal(typeof value, "string", label + " must be text");
  const scanned = value.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\//g, "/");
  assert.doesNotMatch(scanned, /(?:\/(?:mnt|bh|Users|root|home|tmp|private)\/|file:\/\/|https?:\/\/|data:image\/|\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|["']?(?:api[_-]?key|authorization)["']?\s*[:=]|<\/?think\b)/i, label + " contains unsafe private content");
}

// This is a display projection. Existing grades are compared and scaled once;
// it never invokes a scorer, creates reference answers or aggregates a metric.
export function validateVqaSource(source, snapshots) {
  fields(source, ["schema", "resultVersion", "sourceHashes", "evidence", "episodes"], "VQA source");
  assert.equal(source.schema, registry.sourceSchema); assert.equal(source.resultVersion, registry.resultVersion);
  fields(source.sourceHashes, [...Object.keys(formal.provenance.sourceHashes), ...registry.extraSourceHashes], "VQA source hashes");
  for (const [name, value] of Object.entries(source.sourceHashes)) { assert.match(name, /^[A-Za-z0-9][A-Za-z0-9_-]*$/); hash(value); }
  for (const [name, value] of Object.entries(formal.provenance.sourceHashes)) assert.equal(source.sourceHashes[name], value, "formal source digest mismatch");
  fields(source.evidence, ["initial", "process"], "source evidence");
  assert.equal(fingerprint(source.evidence.initial), source.sourceHashes.initialEvidence, "initial evidence digest mismatch");
  assert.equal(fingerprint(source.evidence.process), source.sourceHashes.processEvidence, "process evidence digest mismatch");

  const execution = unique(snapshots.execution.episodes, row => row.id, "frozen execution");
  const initial = unique(snapshots.initial.grades, row => initialKey(row.taskId, row.layoutId, row.questionId), "frozen initial grade");
  const slots = unique(snapshots.process.slots, row => row.slot_id, "frozen process slot");
  const formalEpisodes = unique(formal.episodes, row => row.id, "formal episode");
  const rows = unique(source.episodes, row => row.episodeId, "VQA episode");
  exactSet(rows.keys(), formalEpisodes.keys(), "exact seventy VQA episodes");
  exactSet(execution.keys(), formalEpisodes.keys(), "frozen execution scope");
  const receipts = unique(source.evidence.initial, row => row.episodeId, "initial receipt");
  exactSet(receipts.keys(), formalEpisodes.keys(), "exact seventy initial receipts");
  const processReceipts = unique(source.evidence.process, row => row.questionId, "process receipt");
  for (const receipt of processReceipts.values()) {
    fields(receipt, ["questionId", "publicQuestionSha256", "firstResponseSha256", "responseEvidenceSha256", "requestSha256"], "process receipt");
    for (const [name, value] of Object.entries(receipt)) if (name !== "questionId") hash(value);
  }

  const seenInitial = new Set(), seenSlots = new Set(), seenProcessQuestions = new Map();
  const episodes = formal.episodes.map(publicEpisode => {
    const row = rows.get(publicEpisode.id), saved = execution.get(publicEpisode.id);
    fields(row, ["episodeId", "resultVersion", "modelId", "taskId", "layoutId", "attempt", "initial", "checkpoints"], "VQA episode");
    assert.equal(row.resultVersion, registry.resultVersion);
    for (const name of ["modelId", "taskId", "layoutId", "attempt"]) assert.equal(row[name], publicEpisode[name], "formal episode identity mismatch");
    assert.equal(saved.taskId, row.taskId); assert.equal(saved.layoutId, row.layoutId); assert.equal(saved.attempt, row.attempt);
    const initialRows = unique(row.initial, question => question.questionId, "initial question");
    const expectedInitial = snapshots.initial.grades.filter(grade => grade.taskId === row.taskId && grade.layoutId === row.layoutId);
    exactSet(initialRows.keys(), expectedInitial.map(grade => grade.questionId), "complete initial question slots");
    const receipt = receipts.get(row.episodeId);
    fields(receipt, ["episodeId", "manifestSha256", "questionsSha256", "predictionsSha256", "answers"], "initial receipt");
    for (const name of ["manifestSha256", "questionsSha256", "predictionsSha256"]) hash(receipt[name]);
    const answerReceipts = unique(receipt.answers, answer => answer.questionId, "initial answer receipt");
    exactSet(answerReceipts.keys(), initialRows.keys(), "initial receipt question binding");
    for (const answer of answerReceipts.values()) {
      fields(answer, ["questionId", "instanceId", "publicInputSha256", "answerSha256"], "initial answer receipt");
      assert.ok(typeof answer.instanceId === "string" && answer.instanceId.length > 0);
      hash(answer.publicInputSha256); hash(answer.answerSha256);
    }
    const displayedInitial = expectedInitial.map(grade => {
      const question = initialRows.get(grade.questionId), id = initialKey(row.taskId, row.layoutId, grade.questionId);
      fields(question, ["questionId", "metricId", "question", "response", "score", "status", "formatCompliant"], "initial question");
      assert.equal(grade.attempt, row.attempt); assert.ok(initial.has(id)); seenInitial.add(id);
      assert.equal(question.metricId, metricId(grade.group)); assert.equal(question.status, grade.status);
      assert.equal(question.score, grade.score, "initial saved score mismatch");
      assert.equal(question.formatCompliant, grade.formatCompliant, "initial saved format mismatch");
      safeText(question.question, "question"); assert.ok(question.question.length > 0);
      assert.ok(question.formatCompliant === null || typeof question.formatCompliant === "boolean");
      if (question.status === "scored") { safeText(question.response, "final answer"); score(question.score); }
      else { assert.equal(question.status, "not_graded"); assert.equal(question.response, null); assert.equal(question.score, null); }
      return { ...question, score: question.score === null ? null : question.score * 100 };
    });

    const checkpointRows = unique(row.checkpoints, checkpoint => checkpoint.slotId, "checkpoint slot");
    const expectedSlots = snapshots.process.slots.filter(slot => slot.task_name === row.taskId && slot.layout_id === row.layoutId);
    exactSet(checkpointRows.keys(), expectedSlots.map(slot => slot.slot_id), "complete planned checkpoint slots");
    const displayedCheckpoints = expectedSlots.map(slot => {
      const checkpoint = checkpointRows.get(slot.slot_id);
      fields(checkpoint, ["slotId", "stageId", "status", "questionId", "question", "response", "triggerStep", "returnStep", "scores"], "checkpoint");
      fields(checkpoint.scores, ["c2", "c3"], "checkpoint scores");
      assert.equal(checkpoint.stageId, slot.stage_id); assert.equal(checkpoint.status, slot.status);
      assert.equal(slot.attempt, saved.relativeAttempt); assert.equal(slot.episode_id, saved.episodeId);
      assert.equal(checkpoint.scores.c2, slot.C2_score, "C2 saved score mismatch");
      assert.equal(checkpoint.scores.c3, slot.C3_score, "C3 saved score mismatch");
      score(checkpoint.scores.c2); score(checkpoint.scores.c3); seenSlots.add(slot.slot_id);
      if (checkpoint.status === "not_reached") {
        for (const name of ["questionId", "question", "response", "triggerStep", "returnStep"]) assert.equal(checkpoint[name], null, "unreached checkpoint has no fabricated question or response");
        assert.equal(checkpoint.scores.c2, 0); assert.equal(checkpoint.scores.c3, 0);
      } else {
        assert.equal(checkpoint.status, "scored", "unresolved checkpoints cannot be published as zero");
        assert.equal(slot.source_verified, true); assert.equal(slot.official_question_result, true);
        assert.equal(checkpoint.questionId, slot.question_id); assert.ok(processReceipts.has(checkpoint.questionId));
        safeText(checkpoint.question, "question"); assert.ok(checkpoint.question.length > 0); safeText(checkpoint.response, "final answer");
        step(checkpoint.triggerStep); step(checkpoint.returnStep);
        assert.ok(checkpoint.triggerStep <= checkpoint.returnStep && checkpoint.returnStep <= saved.steps, "checkpoint steps outside saved episode");
        const shared = { episodeId: row.episodeId, question: checkpoint.question, response: checkpoint.response, returnStep: checkpoint.returnStep, scores: checkpoint.scores };
        if (seenProcessQuestions.has(checkpoint.questionId)) assert.deepEqual(shared, seenProcessQuestions.get(checkpoint.questionId), "shared checkpoint answer changed");
        else seenProcessQuestions.set(checkpoint.questionId, shared);
      }
      assert.ok(slots.has(slot.slot_id));
      return { ...checkpoint, scores: { c2: checkpoint.scores.c2 * 100, c3: checkpoint.scores.c3 * 100 } };
    });
    return { episodeId: row.episodeId, resultVersion: row.resultVersion, modelId: row.modelId, taskId: row.taskId, layoutId: row.layoutId, attempt: row.attempt, initial: displayedInitial, checkpoints: displayedCheckpoints };
  });
  assert.equal(seenInitial.size, snapshots.initial.grades.length); assert.equal(seenInitial.size, 390);
  assert.equal(seenSlots.size, formal.scope.processSlotCount); assert.equal(seenSlots.size, 207);
  exactSet(seenProcessQuestions.keys(), processReceipts.keys(), "scored first-response receipts");
  const result = { schemaVersion: registry.schemaVersion, resultVersion: registry.resultVersion, sourceHashes: { ...source.sourceHashes, vqaDetails: registry.detailsSha256 }, episodes };
  for (const episode of result.episodes) for (const name of ["episodeId", "resultVersion", "modelId", "taskId", "attempt"]) safeText(episode[name], "public identity");
  return result;
}

export async function readPinned(file, expected) {
  hash(expected); const bytes = await readFile(file);
  assert.equal(sha256(bytes), expected, "VQA source SHA-256 drift: " + path.basename(file instanceof URL ? fileURLToPath(file) : file));
  return bytes;
}

export async function buildVqaBundle(sourceRoot = process.env.T1_BENCHMARK_SOURCE_ROOT || new URL("../.local/t1-benchmark/source/", import.meta.url)) {
  await readPinned(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), registry.formalBundleSha256);
  const root = await realpath(sourceRoot), values = {};
  const pins = { initial: scoreRegistry.sourcePins.initial, execution: scoreRegistry.sourcePins.execution, process: scoreRegistry.sourcePins.process, "vqa-details": registry.detailsSha256 };
  for (const [name, pin] of Object.entries(pins)) {
    const file = await realpath(path.join(root, name + ".json"));
    assert.ok(file.startsWith(root + path.sep), "VQA source escapes allowlisted root");
    assert.ok((await lstat(file)).isFile(), "VQA source must be a regular file");
    values[name] = JSON.parse((await readPinned(file, pin)).toString("utf8"));
  }
  return validateVqaSource(values["vqa-details"], values);
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--check"), "only --check is supported");
  const serialized = JSON.stringify(await buildVqaBundle(), null, 2) + "\n";
  const output = new URL("../app/data/generated/t1-benchmark-vqa.json", import.meta.url);
  if (args.includes("--check")) assert.equal(await readFile(output, "utf8"), serialized, "VQA display bundle is stale");
  else await writeFile(output, serialized);
  console.log(args.includes("--check") ? "VQA display bundle matches the pinned evidence snapshots." : "Published saved VQA questions, final first answers and existing grades.");
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
