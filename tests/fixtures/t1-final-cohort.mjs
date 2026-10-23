// Entirely synthetic input. It is never accepted by production source SHA pins.
import { t1BenchmarkRegistry as scope } from "../../scripts/t1-benchmark-result-registry.mjs";
import { t1FinalCohortRegistry as registry } from "../../scripts/t1-final-cohort-registry.mjs";
import { finalEpisodeId } from "../../scripts/export-t1-final-cohort.mjs";
export const HASH = "a".repeat(64);
const tasks = scope.tasks.map(row => row.id), plans = scope.scenePlans.filter(row => tasks.includes(row.taskId));
const avg = rows => rows.reduce((a, b) => a + b, 0) / rows.length;
const fields = { overall: "total_score", vqa: "VQA", subtask: "Subtask", success: "success_rate", a: "A", b: "B", c: "Reasoning", a1: "A1", a2: "A2", a3: "A3", b1: "B1", b3: "B3", b_interaction: "B_interaction_semantics", c1: "C1", c2: "C2", c3: "C3" };
function initialScores(rows) {
  const output = {};
  for (const dimension of ["A", "B", "C"]) {
    const groups = [...new Set(rows.filter(row => row.dimension === dimension).map(row => row.group))];
    for (const group of groups) {
      const questions = [...new Set(rows.filter(row => row.group === group).map(row => row.question_id))];
      const questionScores = questions.map(qid => rows.filter(row => row.question_id === qid && row.status !== "not_graded").map(row => row.score)).filter(values => values.length).map(avg);
      if (questionScores.length) output[group === "B_interaction_semantics" ? "b_interaction" : group.toLowerCase()] = avg(questionScores);
    }
    const applicable = groups.map(group => output[group === "B_interaction_semantics" ? "b_interaction" : group.toLowerCase()]).filter(value => value !== undefined);
    output[dimension === "C" ? "c1" : dimension.toLowerCase()] = avg(applicable);
  }
  return output;
}
const finish = raw => ({ ...raw, c: (raw.c1 + raw.c2 + raw.c3) / 3, vqa: (raw.a + raw.b + (raw.c1 + raw.c2 + raw.c3) / 3) / 3, overall: .7 * raw.subtask + .3 * (raw.a + raw.b + (raw.c1 + raw.c2 + raw.c3) / 3) / 3 });
export function fixture() {
  const source = { schema: "roboexam.t1-benchmark-cohort-source.v2", resultVersion: registry.resultVersion, generatedAt: registry.generatedAt, sourceHashes: { cohortSummary: HASH, initialQuestions: HASH, processSlots: HASH, processQuestions: HASH, nativeCases: HASH, selection: HASH, initialInputs: HASH, processMap: HASH, zeroPolicy: HASH },
    summary: { schema: "agentbench.vqa-cohort-report.v1", baseline_revision: registry.baselineCommit, initial_grader_revision: registry.initialScorerPolicy, equivalences_sha256: registry.equivalencesSha256, missing_score_policy: "zero-unscorable", scope: { tasks: 14, scenes: 70, planned_slots: 207 }, initial_qualification: { status: "verified" }, model_calls: 0, physical_steps: 0, policy_assignments: { revision: "agentbench.vqa-missing-zero.v1", initial_assignments: [], process_assignments: [] }, candidates: {} }, selection: { cases: [] }, initial: [], slots: [], processQuestions: [], nativeCases: [], episodes: [] };
  const details = { schema: "roboexam.t1-benchmark-vqa-source.v2", resultVersion: registry.resultVersion, sourceHashes: structuredClone(source.sourceHashes), evidence: { initial: [], process: [] }, episodes: [] };
  for (const plan of plans) source.selection.cases.push({ case_id: `${plan.taskId}/${plan.layoutId}` });
  for (const model of registry.models) {
    let scored = 0;
    for (const plan of plans) {
      const key = `${plan.taskId}/${plan.layoutId}`, sourceRun = `/synthetic-private/${model.candidate}`, relative = `episodes/${key}/attempt_02`, attemptPath = `${sourceRun}/${relative}`, id = finalEpisodeId(model.id, plan.taskId, plan.layoutId);
      source.selection.cases.find(row => row.case_id === key)[model.candidate] = { source_run: sourceRun, attempt_name: "attempt_02", attempt_relative: relative, attempt_path: attemptPath, result_sha256: HASH, status: "failure" };
      source.nativeCases.push({ candidate: model.candidate, case_id: key, source_run: sourceRun, attempt_path: attemptPath, status: "failure", progress_score_raw: null, mean_progress_value: 0 });
      source.episodes.push({ id, modelId: model.id, taskId: plan.taskId, layoutId: plan.layoutId, attempt: "attempt_02", relativeAttempt: relative, sourceRun, resultSha256: HASH, nativeEpisodeId: "synthetic-native", status: "failure", steps: 100, progressScore: null, elapsedSeconds: 1, video: { id, url: `/api/t1-benchmark-media/${id}`, sha256: HASH, bytes: 10, frames: 101, fps: 25 } });
      const display = { episodeId: id, resultVersion: registry.resultVersion, modelId: model.id, taskId: plan.taskId, layoutId: plan.layoutId, attempt: "attempt_02", initial: [], checkpoints: [] }, receipt = { episodeId: id, manifestSha256: HASH, questionsSha256: HASH, predictionsSha256: HASH, answers: [] };
      for (const [qid, metadata] of Object.entries(scope.initialQuestions[plan.taskId])) {
        const exempt = scope.initialExcludedInstances.includes(`${key}/${qid}`), policy = model.candidate === "gpt" && key === "classify_objects_by_language/100001" && qid.endsWith("basket_color_order");
        const row = { candidate: model.candidate, case_id: key, task_name: plan.taskId, layout_id: plan.layoutId, question_id: qid, ...metadata, source_run: sourceRun, attempt_path: attemptPath, score: exempt ? null : policy ? 0 : 1, status: exempt ? "not_graded" : policy ? "infrastructure_missing" : "scored", format_compliant: exempt || policy ? null : true, public_input_sha256: HASH, regrade_row_sha256: HASH };
        if (policy) { row.score_origin = "policy_zero"; row.observed_score = null; source.summary.policy_assignments.initial_assignments.push(row); }
        source.initial.push(row);
        display.initial.push({ questionId: qid, metricId: metadata.group === "B_interaction_semantics" ? "b_interaction" : metadata.group.toLowerCase(), question: `Synthetic question ${qid}`, response: policy ? null : "{}", score: row.score, status: row.status, formatCompliant: row.format_compliant, ...(policy ? { scoreOrigin: "policy_zero", observedScore: null } : {}) });
        receipt.answers.push({ questionId: qid, instanceId: `${key}/${qid}`, publicInputSha256: HASH, answerSha256: policy ? null : HASH });
      }
      for (const slotId of plan.slotIds) {
        const policy = model.candidate === "gpt" && slotId === "classify_objects_by_language/100001/ONE_CATEGORY_SORTED", answered = !policy && scored < (model.candidate === "gpt" ? 74 : 8), qid = answered || policy ? `q_${model.candidate}_${source.slots.length}` : null;
        const slot = { candidate: model.candidate, slot_id: slotId, task_name: plan.taskId, layout_id: plan.layoutId, stage_id: slotId.split("/")[2], source_run: sourceRun, attempt: relative, status: policy ? "reached_reference_blocked" : answered ? "scored" : "not_reached", question_id: qid, source_id: "synthetic", C2_score: answered ? 1 : 0, C3_score: answered ? 1 / 3 : 0, score_manifest_sha256: HASH };
        if (policy) { slot.score_origin = "policy_zero"; slot.observed_C2_score = null; slot.observed_C3_score = null; source.summary.policy_assignments.process_assignments.push(slot); }
        source.slots.push(slot);
        if (answered) { scored++; source.processQuestions.push({ candidate: model.candidate, question_id: qid, source_id: "synthetic", source_run: sourceRun, attempt: relative, slot_ids: [slotId], C2_score: 1, C3_score: 1 / 3, request_sha256: HASH, answer_record_sha256: HASH, response_evidence_sha256: HASH }); details.evidence.process.push({ questionId: qid, publicQuestionSha256: HASH, firstResponseSha256: HASH, responseEvidenceSha256: HASH, requestSha256: HASH }); }
        display.checkpoints.push({ slotId, stageId: slot.stage_id, status: slot.status, questionId: qid, question: answered ? "Synthetic process question" : null, response: answered ? "{}" : null, triggerStep: answered ? 10 : null, returnStep: answered ? 20 : null, scores: { c2: slot.C2_score, c3: slot.C3_score }, ...(policy ? { scoreOrigin: "policy_zero", observedScores: { c2: null, c3: null } } : {}) });
      }
      details.episodes.push(display); details.evidence.initial.push(receipt);
    }
    const taskScores = tasks.map(task => {
      const raw = initialScores(source.initial.filter(row => row.candidate === model.candidate && row.task_name === task));
      for (const [name, field] of [["c2", "C2_score"], ["c3", "C3_score"]]) raw[name] = avg(plans.filter(row => row.taskId === task).map(plan => avg(source.slots.filter(row => row.candidate === model.candidate && row.task_name === task && row.layout_id === plan.layoutId).map(row => row[field]))));
      Object.assign(raw, { subtask: 0, success: 0 }); const complete = finish(raw); return { task_name: task, ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [field, complete[key] ?? null])) };
    });
    source.summary.candidates[model.candidate] = { tasks: taskScores, overall: { status: "complete", ...Object.fromEntries(Object.values(fields).map(field => { const values = taskScores.map(row => row[field]).filter(value => value !== null); return [field, values.length ? avg(values) : null]; })) } };
  }
  return { source, details };
}
