import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { t1BenchmarkRegistry as scopeRegistry } from "./t1-benchmark-result-registry.mjs";
import { t1FinalCohortRegistry as registry } from "./t1-final-cohort-registry.mjs";

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const taskIds = scopeRegistry.tasks.map(row => row.id);
const plans = scopeRegistry.scenePlans.filter(row => taskIds.includes(row.taskId));
const metricFields = { overall: "total_score", vqa: "VQA", subtask: "Subtask", success: "success_rate", a: "A", b: "B", c: "Reasoning", a1: "A1", a2: "A2", a3: "A3", b1: "B1", b3: "B3", b_interaction: "B_interaction_semantics", c1: "C1", c2: "C2", c3: "C3" };
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const finalEpisodeId = (modelId, taskId, layoutId) => `${registry.resultVersion}-${modelId}-${taskId}-layout${layoutId}`;
const sceneKey = (task, layout) => `${task}/${layout}`;
const initialKey = row => `${row.candidate}/${row.task_name}/${row.layout_id}/${row.question_id}`;
const slotKey = row => `${row.candidate}/${row.slot_id}`;
const metricId = group => group === "B_interaction_semantics" ? "b_interaction" : group.toLowerCase();
const mean = rows => { assert.ok(rows.length, "empty denominator"); return rows.reduce((a, b) => a + b, 0) / rows.length; };
function object(value, label) { assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`); }
function fields(value, names, label, optional = []) { object(value, label); const keys = Object.keys(value); assert.ok(names.every(key => keys.includes(key)) && keys.every(key => names.includes(key) || optional.includes(key)), `${label} fields`); }
function exactSet(values, expected, label) { assert.deepEqual([...values].sort(), [...expected].sort(), label); }
function hash(value, label = "SHA-256") { assert.equal(typeof value, "string", label); assert.match(value, SHA, label); }
function score(value) { assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1, "score outside [0,1]"); }
function integer(value, label) { assert.ok(Number.isSafeInteger(value) && value >= 0, label); }
function close(actual, expected, label) { if (expected === null || expected === undefined) assert.equal(actual ?? null, null, label); else { score(expected); assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-10, `${label}: aggregate mismatch`); } }
function unique(rows, key, label) { assert.ok(Array.isArray(rows), `${label} array`); const map = new Map(); for (const row of rows) { object(row, label); const id = key(row); assert.ok(!map.has(id), `duplicate ${label}: ${id}`); map.set(id, row); } return map; }
export function safeDisplayText(value, label) {
  assert.equal(typeof value, "string", `${label} text`);
  const scanned = value.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\//g, "/");
  assert.doesNotMatch(scanned, /(?:\/(?:mnt|bh|Users|root|home|tmp|private)\/|file:\/\/|https?:\/\/|data:image\/|\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|["']?(?:api[_-]?key|authorization)["']?\s*[:=]|<\/?think\b)/i, `${label} contains private content`);
}
function publicSafe(value) { if (typeof value === "string") { if (value.startsWith("/api/t1-benchmark-media/")) { assert.match(value.slice("/api/t1-benchmark-media/".length), ID); return; } safeDisplayText(value, "public value"); } else if (Array.isArray(value)) value.forEach(publicSafe); else if (value && typeof value === "object") { for (const [key, item] of Object.entries(value)) { assert.doesNotMatch(key.replaceAll("_", ""), /^(?:apikey|authorization|secret|baseurl|endpoint|groundtruth|rawresponse|answertext|context|reference|predicted)$/i); publicSafe(item); } } }

// Reproduce the sealed report's question -> subgroup -> dimension aggregation.
// The two explicitly authorised policy assignments remain distinguishable from answers.
export function aggregateFinalInitial(rows) {
  const questions = new Map();
  for (const row of rows) {
    if (row.status === "not_graded") continue;
    assert.ok(row.status === "scored" || (row.status === "infrastructure_missing" && row.score_origin === "policy_zero"), "unapproved initial status");
    score(row.score);
    const key = `${row.dimension}/${row.group}/${row.question_id}`;
    if (!questions.has(key)) questions.set(key, []);
    questions.get(key).push(row.score);
  }
  const groups = new Map();
  for (const [key, values] of questions) { const group = key.split("/").slice(0, 2).join("/"); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(mean(values)); }
  const result = {}, dimensions = new Map();
  for (const [key, values] of groups) { const [dimension, group] = key.split("/"); const value = mean(values); result[metricId(group)] = value; if (!dimensions.has(dimension)) dimensions.set(dimension, []); dimensions.get(dimension).push(value); }
  for (const [dimension, values] of dimensions) result[dimension === "C" ? "c1" : dimension.toLowerCase()] = mean(values);
  return result;
}
function completeScores(raw) { raw.c = mean([raw.c1, raw.c2, raw.c3]); raw.vqa = mean([raw.a, raw.b, raw.c]); raw.overall = .7 * raw.subtask + .3 * raw.vqa; return raw; }
function publicScores(raw) { return Object.fromEntries(Object.keys(metricFields).map(key => [key, Object.hasOwn(raw, key) && raw[key] !== null && raw[key] !== undefined ? raw[key] * 100 : null])); }
function validateVideo(video, episode) {
  if (video === null) return;
  fields(video, ["id", "url", "sha256", "bytes", "frames", "fps"], "video", ["hasMotion"]);
  assert.equal(video.id, episode.id); assert.equal(video.url, `/api/t1-benchmark-media/${episode.id}`); hash(video.sha256); integer(video.bytes, "video bytes"); assert.ok(video.bytes > 0);
  if (video.frames !== null) { integer(video.frames, "video frames"); assert.ok(video.frames > 0); }
  if (video.fps !== null) assert.ok(Number.isFinite(video.fps) && video.fps > 0);
  if (video.hasMotion !== undefined) assert.equal(typeof video.hasMotion, "boolean");
}
function policyKey(row) { return `${row.candidate}/${row.task_name}/${row.layout_id}/${row.question_id}`; }

export function validateFinalCohort(source, metricDefinitions, sourceDigest) {
  fields(source, ["schema", "resultVersion", "generatedAt", "sourceHashes", "summary", "selection", "initial", "slots", "processQuestions", "nativeCases", "episodes"], "cohort source");
  assert.equal(source.schema, "roboexam.t1-benchmark-cohort-source.v2"); assert.equal(source.resultVersion, registry.resultVersion); assert.equal(source.generatedAt, registry.generatedAt);
  fields(source.sourceHashes, ["cohortSummary", "initialQuestions", "processSlots", "processQuestions", "nativeCases", "selection", "initialInputs", "processMap", "zeroPolicy"], "formal source digests");
  for (const value of Object.values(source.sourceHashes)) hash(value);
  const summary = source.summary;
  assert.equal(summary.schema, "agentbench.vqa-cohort-report.v1"); assert.equal(summary.baseline_revision, registry.baselineCommit); assert.equal(summary.initial_grader_revision, registry.initialScorerPolicy); assert.equal(summary.equivalences_sha256, registry.equivalencesSha256); assert.equal(summary.missing_score_policy, registry.missingScorePolicy);
  assert.deepEqual(summary.scope, { tasks: 14, scenes: 70, planned_slots: 207 }); assert.equal(summary.initial_qualification.status, "verified");
  assert.equal(summary.model_calls, 0); assert.equal(summary.physical_steps, 0);
  if (summary.selection_sha256 !== undefined) assert.equal(source.sourceHashes.selection, summary.selection_sha256);
  if (summary.initial_inputs_sha256 !== undefined) assert.equal(source.sourceHashes.initialInputs, summary.initial_inputs_sha256);
  if (summary.process_map_sha256 !== undefined) assert.equal(source.sourceHashes.processMap, summary.process_map_sha256);
  exactSet(Object.keys(summary.candidates), registry.models.map(row => row.candidate), "exact candidates");
  assert.equal(summary.policy_assignments.revision, "agentbench.vqa-missing-zero.v1");
  const initialPolicies = unique(summary.policy_assignments.initial_assignments, policyKey, "initial policy");
  const processPolicies = unique(summary.policy_assignments.process_assignments, slotKey, "process policy");
  assert.equal(initialPolicies.size, 1); assert.equal(processPolicies.size, 1);
  const approvedInitial = "gpt/classify_objects_by_language/100001/classify_objects_by_language.revised.basket_color_order";
  const approvedSlot = "gpt/classify_objects_by_language/100001/ONE_CATEGORY_SORTED";
  exactSet(initialPolicies.keys(), [approvedInitial], "approved initial zero"); exactSet(processPolicies.keys(), [approvedSlot], "approved process zero");
  const selected = unique(source.selection.cases, row => row.case_id, "selected case"); exactSet(selected.keys(), plans.map(row => sceneKey(row.taskId, row.layoutId)), "selected 70 cases");
  const initial = unique(source.initial, initialKey, "initial question"), slots = unique(source.slots, slotKey, "process slot");
  const questions = unique(source.processQuestions, row => `${row.candidate}/${row.question_id}`, "process first answer");
  const native = unique(source.nativeCases, row => `${row.candidate}/${row.case_id}`, "native case");
  const episodes = unique(source.episodes, row => row.id, "episode");
  assert.equal(initial.size, 780); assert.equal(slots.size, 414); assert.equal(questions.size, 82); assert.equal(native.size, 140); assert.equal(episodes.size, 140);
  for (const row of source.initial) assert.equal(row.case_id, sceneKey(row.task_name, row.layout_id), "initial case identity");
  const expectedInitial = registry.models.flatMap(model => plans.flatMap(plan => Object.keys(scopeRegistry.initialQuestions[plan.taskId]).map(qid => `${model.candidate}/${plan.taskId}/${plan.layoutId}/${qid}`)));
  exactSet(initial.keys(), expectedInitial, "exact initial denominator"); exactSet(slots.keys(), registry.models.flatMap(model => plans.flatMap(plan => plan.slotIds.map(slot => `${model.candidate}/${slot}`))), "exact fixed process denominator");
  const seenQuestions = new Set(), publishedEpisodes = [], taskAggregates = new Map();
  for (const model of registry.models) {
    const ownEpisodes = [];
    const ownQuestions = source.processQuestions.filter(row => row.candidate === model.candidate);
    assert.equal(ownQuestions.length, model.candidate === "gpt" ? 74 : 8, "verified first-answer coverage");
    const ownStatusCounts = source.slots.filter(row => row.candidate === model.candidate).reduce((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {});
    assert.deepEqual(ownStatusCounts, model.candidate === "gpt" ? { scored: 74, not_reached: 132, reached_reference_blocked: 1 } : { scored: 8, not_reached: 199 }, "fixed-slot status coverage");
    for (const plan of plans) {
      const key = sceneKey(plan.taskId, plan.layoutId), id = finalEpisodeId(model.id, plan.taskId, plan.layoutId), row = episodes.get(id), chosen = selected.get(key)[model.candidate], execution = native.get(`${model.candidate}/${key}`);
      assert.ok(row && chosen && execution, "complete selected execution");
      fields(row, ["id", "modelId", "taskId", "layoutId", "attempt", "relativeAttempt", "sourceRun", "resultSha256", "nativeEpisodeId", "status", "steps", "progressScore", "elapsedSeconds", "video"], "episode");
      assert.equal(row.modelId, model.id); assert.equal(row.taskId, plan.taskId); assert.equal(row.layoutId, plan.layoutId); assert.equal(row.sourceRun, chosen.source_run); assert.equal(row.attempt, chosen.attempt_name); assert.equal(row.relativeAttempt, chosen.attempt_relative); assert.equal(row.relativeAttempt, `episodes/${key}/${row.attempt}`); assert.equal(row.resultSha256, chosen.result_sha256); hash(row.resultSha256);
      assert.equal(execution.source_run, chosen.source_run); assert.equal(execution.attempt_path, chosen.attempt_path); assert.equal(execution.status, row.status); assert.equal(chosen.status, row.status); assert.ok(["success", "failure"].includes(row.status), "infrastructure is not a normal execution zero");
      integer(row.steps, "native control steps"); if (row.progressScore !== null) score(row.progressScore); assert.equal(row.progressScore, execution.progress_score_raw); close(row.progressScore ?? 0, execution.mean_progress_value, "native progress fallback");
      if (row.elapsedSeconds !== null) assert.ok(Number.isFinite(row.elapsedSeconds) && row.elapsedSeconds >= 0);
      assert.equal(typeof row.nativeEpisodeId, "string"); assert.ok(row.nativeEpisodeId.length > 0); validateVideo(row.video, row);
      const ownInitial = source.initial.filter(item => item.candidate === model.candidate && item.case_id === key);
      for (const item of ownInitial) {
        assert.equal(item.source_run, chosen.source_run); assert.equal(item.attempt_path, chosen.attempt_path);
        const metadata = scopeRegistry.initialQuestions[plan.taskId][item.question_id]; assert.equal(item.dimension, metadata.dimension); assert.equal(item.group, metadata.group); hash(item.public_input_sha256); hash(item.regrade_row_sha256);
        const exempt = scopeRegistry.initialExcludedInstances.includes(`${key}/${item.question_id}`);
        if (exempt) { assert.equal(item.status, "not_graded"); assert.equal(item.score, null); }
        else if (item.score_origin === "policy_zero") { assert.deepEqual(item, initialPolicies.get(initialKey(item)), "exact initial policy assignment"); assert.equal(item.status, "infrastructure_missing"); assert.equal(item.score, 0); assert.equal(item.observed_score, null); }
        else { assert.equal(item.status, "scored"); score(item.score); }
        assert.ok(item.format_compliant === null || typeof item.format_compliant === "boolean");
      }
      const ownSlots = plan.slotIds.map(slot => slots.get(`${model.candidate}/${slot}`));
      for (const item of ownSlots) {
        assert.equal(item.task_name, plan.taskId); assert.equal(item.layout_id, plan.layoutId); assert.equal(item.slot_id, `${key}/${item.stage_id}`); assert.equal(item.source_run, chosen.source_run); assert.equal(item.attempt, chosen.attempt_relative);
        score(item.C2_score); score(item.C3_score); hash(item.score_manifest_sha256);
        if (item.status === "scored") {
          const questionKey = `${model.candidate}/${item.question_id}`, answer = questions.get(questionKey); assert.ok(answer, "scored slot needs real first answer"); assert.equal(answer.source_run, chosen.source_run); assert.equal(answer.attempt, chosen.attempt_relative); assert.equal(answer.source_id, item.source_id); assert.ok(answer.slot_ids.includes(item.slot_id)); close(item.C2_score, answer.C2_score, "saved C2"); close(item.C3_score, answer.C3_score, "saved C3");
          for (const name of ["request_sha256", "answer_record_sha256", "response_evidence_sha256"]) hash(answer[name]); seenQuestions.add(questionKey);
        } else if (item.status === "not_reached") { assert.equal(item.C2_score, 0); assert.equal(item.C3_score, 0); assert.equal(item.question_id, null); }
        else { assert.equal(item.status, "reached_reference_blocked"); assert.deepEqual(item, processPolicies.get(slotKey(item)), "exact process policy assignment"); assert.equal(item.score_origin, "policy_zero"); assert.equal(item.observed_C2_score, null); assert.equal(item.observed_C3_score, null); assert.equal(item.C2_score, 0); assert.equal(item.C3_score, 0); }
      }
      const raw = completeScores({ ...aggregateFinalInitial(ownInitial), c2: mean(ownSlots.map(item => item.C2_score)), c3: mean(ownSlots.map(item => item.C3_score)), subtask: row.progressScore ?? 0, success: row.status === "success" ? 1 : 0 });
      const episode = { id, resultVersion: registry.resultVersion, modelId: model.id, taskId: plan.taskId, layoutId: plan.layoutId, attempt: row.attempt, execution: { steps: row.steps, subtask: raw.subtask * 100, success: row.status === "success", elapsedSeconds: row.elapsedSeconds }, scores: publicScores(raw), video: row.video };
      ownEpisodes.push(episode); publishedEpisodes.push(episode);
    }
    const declaredTasks = unique(summary.candidates[model.candidate].tasks, row => row.task_name, "formal task"); exactSet(declaredTasks.keys(), taskIds, "14 declared tasks");
    const tasks = taskIds.map(taskId => {
      const raw = aggregateFinalInitial(source.initial.filter(row => row.candidate === model.candidate && row.task_name === taskId));
      const episodes = ownEpisodes.filter(row => row.taskId === taskId); assert.equal(episodes.length, 5);
      for (const key of ["c2", "c3", "subtask", "success"]) raw[key] = mean(episodes.map(row => row.scores[key] / 100)); completeScores(raw);
      for (const [key, field] of Object.entries(metricFields)) close(raw[key], declaredTasks.get(taskId)[field], `${model.candidate}/${taskId}/${field}`);
      return raw;
    });
    const overall = Object.fromEntries(Object.keys(metricFields).map(key => { const applicable = tasks.filter(row => Object.hasOwn(row, key)); return [key, applicable.length ? mean(applicable.map(row => row[key])) : null]; }));
    for (const [key, field] of Object.entries(metricFields)) close(overall[key], summary.candidates[model.candidate].overall[field], `${model.candidate} overall ${field}`);
    assert.equal(summary.candidates[model.candidate].overall.status, "complete"); taskAggregates.set(model.id, overall);
  }
  exactSet(seenQuestions, questions.keys(), "all 82 real first answers accounted");
  const result = { schemaVersion: "roboexam.t1-benchmark-results.v1", resultVersion: registry.resultVersion, generatedAt: registry.generatedAt,
    scope: { taskCount: 14, sceneCount: 70, processSlotCount: 207, layoutIds: [...new Set(plans.map(row => row.layoutId))].sort((a, b) => a - b), taskIds },
    models: registry.models.map(model => ({ id: model.id, label: model.label, requestModel: model.requestModel, scores: publicScores(taskAggregates.get(model.id)) })), tasks: scopeRegistry.tasks, episodes: publishedEpisodes, metrics: metricDefinitions,
    provenance: { publicationScopeId: registry.publicationScopeId, sourceHashes: { ...source.sourceHashes, cohort: sourceDigest }, initialScorerPolicy: registry.initialScorerPolicy, processProtocol: "agentbench.native16.c2c3.v1", processCaptureSha256: registry.processCaptureSha256s[0], processCaptureSha256s: registry.processCaptureSha256s, processScorerSha256: "fb7d90dae01054ea488c512f5ac76ebbdf61e1cc3b6206b44609e01f69151d3b", baselineCommit: registry.baselineCommit, equivalencesSha256: registry.equivalencesSha256, missingScorePolicy: registry.missingScorePolicy } };
  hash(sourceDigest); publicSafe(result); return result;
}

export function validateFinalVqa(source, cohort, formal, detailsDigest) {
  fields(source, ["schema", "resultVersion", "sourceHashes", "evidence", "episodes"], "VQA source"); assert.equal(source.schema, "roboexam.t1-benchmark-vqa-source.v2"); assert.equal(source.resultVersion, registry.resultVersion);
  for (const [name, value] of Object.entries(cohort.sourceHashes)) assert.equal(source.sourceHashes[name], value, "source hash mismatch");
  for (const value of Object.values(source.sourceHashes)) hash(value);
  fields(source.evidence, ["initial", "process"], "VQA evidence");
  const episodeRows = unique(source.episodes, row => row.episodeId, "VQA episode"), receipts = unique(source.evidence.initial, row => row.episodeId, "initial receipt"), processReceipts = unique(source.evidence.process, row => row.questionId, "process receipt");
  exactSet(episodeRows.keys(), formal.episodes.map(row => row.id), "140 exact VQA episodes"); exactSet(receipts.keys(), episodeRows.keys(), "140 initial receipts");
  const initial = unique(cohort.initial, initialKey, "initial grade"), slots = unique(cohort.slots, slotKey, "slot"), realAnswers = unique(cohort.processQuestions, row => row.question_id, "real first answer");
  exactSet(processReceipts.keys(), realAnswers.keys(), "82 exact process receipts");
  for (const receipt of processReceipts.values()) { fields(receipt, ["questionId", "publicQuestionSha256", "firstResponseSha256", "responseEvidenceSha256", "requestSha256"], "process receipt"); for (const [name, value] of Object.entries(receipt)) if (name !== "questionId") hash(value); const answer = realAnswers.get(receipt.questionId); assert.equal(receipt.requestSha256, answer.request_sha256); assert.equal(receipt.firstResponseSha256, answer.answer_record_sha256); assert.equal(receipt.responseEvidenceSha256, answer.response_evidence_sha256); }
  let initialCount = 0, slotCount = 0; const answered = new Set();
  const episodes = formal.episodes.map(publicEpisode => {
    const row = episodeRows.get(publicEpisode.id), model = registry.models.find(item => item.id === publicEpisode.modelId), key = sceneKey(row.taskId, row.layoutId), selected = cohort.selection.cases.find(item => item.case_id === key)[model.candidate];
    fields(row, ["episodeId", "resultVersion", "modelId", "taskId", "layoutId", "attempt", "initial", "checkpoints"], "VQA episode"); assert.equal(row.resultVersion, registry.resultVersion); for (const name of ["modelId", "taskId", "layoutId", "attempt"]) assert.equal(row[name], publicEpisode[name], "exact VQA identity");
    const receipt = receipts.get(row.episodeId); fields(receipt, ["episodeId", "manifestSha256", "questionsSha256", "predictionsSha256", "answers"], "initial receipt"); for (const name of ["manifestSha256", "questionsSha256", "predictionsSha256"]) hash(receipt[name]);
    const answerReceipts = unique(receipt.answers, answer => answer.questionId, "initial answer receipt"), ownInitial = unique(row.initial, item => item.questionId, "display initial");
    exactSet(ownInitial.keys(), Object.keys(scopeRegistry.initialQuestions[row.taskId]), "complete initial question instances"); exactSet(answerReceipts.keys(), ownInitial.keys(), "initial answer receipt binding");
    const displayedInitial = [...ownInitial.values()].map(item => {
      fields(item, ["questionId", "metricId", "question", "response", "score", "status", "formatCompliant"], "initial display", ["scoreOrigin", "observedScore"]);
      const grade = initial.get(`${model.candidate}/${key}/${item.questionId}`), answerReceipt = answerReceipts.get(item.questionId); assert.ok(grade); assert.equal(item.metricId, metricId(grade.group)); assert.equal(item.score, grade.score); assert.equal(item.status, grade.status); assert.equal(item.formatCompliant, grade.format_compliant);
      fields(answerReceipt, ["questionId", "instanceId", "publicInputSha256", "answerSha256"], "initial answer receipt"); assert.equal(answerReceipt.instanceId, `${key}/${item.questionId}`); assert.equal(answerReceipt.publicInputSha256, grade.public_input_sha256); if (answerReceipt.answerSha256 !== null) hash(answerReceipt.answerSha256);
      safeDisplayText(item.question, "initial question"); assert.ok(item.question.length > 0); if (item.response !== null) safeDisplayText(item.response, "first answer");
      if (item.status === "infrastructure_missing") { assert.equal(item.scoreOrigin, "policy_zero"); assert.equal(item.observedScore, null); assert.equal(item.response, null); assert.equal(item.score, 0); assert.equal(grade.score_origin, "policy_zero"); }
      else { assert.equal(item.scoreOrigin, undefined); assert.equal(item.observedScore, undefined); if (item.status === "scored") { assert.equal(typeof item.response, "string"); score(item.score); hash(answerReceipt.answerSha256); } else { assert.equal(item.status, "not_graded"); assert.equal(item.score, null); } }
      initialCount++; return { ...item, score: item.score === null ? null : item.score * 100 };
    });
    const ownSlots = unique(row.checkpoints, item => item.slotId, "display slot"), expectedSlots = plans.find(plan => sceneKey(plan.taskId, plan.layoutId) === key).slotIds; exactSet(ownSlots.keys(), expectedSlots, "fixed scene slots");
    const displayedSlots = [...ownSlots.values()].map(item => {
      fields(item, ["slotId", "stageId", "status", "questionId", "question", "response", "triggerStep", "returnStep", "scores"], "display checkpoint", ["scoreOrigin", "observedScores"]); fields(item.scores, ["c2", "c3"], "display C2/C3"); const slot = slots.get(`${model.candidate}/${item.slotId}`); assert.equal(item.stageId, slot.stage_id); assert.equal(item.status, slot.status); assert.equal(item.questionId, slot.question_id); assert.equal(item.scores.c2, slot.C2_score); assert.equal(item.scores.c3, slot.C3_score); assert.equal(slot.attempt, selected.attempt_relative);
      if (item.status === "scored") { assert.equal(item.scoreOrigin, undefined); assert.equal(item.observedScores, undefined); assert.ok(processReceipts.has(item.questionId)); safeDisplayText(item.question, "checkpoint question"); assert.ok(item.question.length > 0); safeDisplayText(item.response, "checkpoint first answer"); integer(item.triggerStep, "trigger step"); integer(item.returnStep, "return step"); assert.ok(item.triggerStep <= item.returnStep && item.returnStep <= publicEpisode.execution.steps, "checkpoint beyond exact episode"); answered.add(item.questionId); }
      else if (item.status === "not_reached") { assert.equal(item.scoreOrigin, undefined); assert.equal(item.observedScores, undefined); for (const name of ["questionId", "question", "response", "triggerStep", "returnStep"]) assert.equal(item[name], null, "unreached slot has no fabricated Q&A"); }
      else { assert.equal(item.status, "reached_reference_blocked"); assert.equal(item.scoreOrigin, "policy_zero"); assert.deepEqual(item.observedScores, { c2: null, c3: null }); assert.equal(slot.score_origin, "policy_zero"); assert.equal(item.question, null); assert.equal(item.response, null); assert.ok(!processReceipts.has(item.questionId), "policy zero must not claim a response"); for (const name of ["triggerStep", "returnStep"]) if (item[name] !== null) integer(item[name], "blocked native step"); }
      slotCount++; return { ...item, scores: { c2: item.scores.c2 * 100, c3: item.scores.c3 * 100 } };
    });
    return { ...row, initial: displayedInitial, checkpoints: displayedSlots };
  });
  assert.equal(initialCount, 780); assert.equal(slotCount, 414); exactSet(answered, processReceipts.keys(), "all real answers displayed");
  const result = { schemaVersion: "roboexam.t1-benchmark-vqa.v1", resultVersion: registry.resultVersion, sourceHashes: { ...formal.provenance.sourceHashes, vqaDetails: detailsDigest }, episodes }; hash(detailsDigest); publicSafe(result); return result;
}

export async function readFinalPinned(file, expected) { hash(expected, "frozen source pin"); const bytes = await readFile(file); assert.equal(sha256(bytes), expected, `source SHA-256 drift: ${path.basename(file)}`); return bytes; }
export async function loadFinalSources(sourceRoot = process.env.T1_BENCHMARK_SOURCE_ROOT || new URL("../.local/t1-benchmark/source/", import.meta.url)) {
  const root = await realpath(sourceRoot), values = {};
  for (const [name, digest] of Object.entries(registry.sourcePins)) { const file = await realpath(path.join(root, `${name}.json`)); assert.ok(file.startsWith(root + path.sep), "source escapes allowlisted root"); assert.ok((await lstat(file)).isFile(), "regular source file required"); values[name] = JSON.parse((await readFinalPinned(file, digest)).toString("utf8")); }
  return values;
}
export async function buildFinalResults(metricDefinitions, sourceRoot) { const sources = await loadFinalSources(sourceRoot); return validateFinalCohort(sources.cohort, metricDefinitions, registry.sourcePins.cohort); }
export async function buildFinalVqa(metricDefinitions, sourceRoot) { const sources = await loadFinalSources(sourceRoot), formal = validateFinalCohort(sources.cohort, metricDefinitions, registry.sourcePins.cohort); return validateFinalVqa(sources["vqa-details"], sources.cohort, formal, registry.sourcePins["vqa-details"]); }
