import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t1BenchmarkRegistry as registry } from "./t1-benchmark-result-registry.mjs";
import { buildFinalResults } from "./export-t1-final-cohort.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_NAMES = ["initial", "execution", "process", "media"];
const taskIds = registry.tasks.map(task => task.id);
const plans = registry.scenePlans.filter(plan => taskIds.includes(plan.taskId));
const key = (task, layout) => task + "/" + layout;
export const episodeId = (task, layout) => registry.resultVersion + "-deepseek-" + task + "-layout" + layout;
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const mean = values => { assert.ok(values.length > 0, "empty denominator"); return values.reduce((a, b) => a + b, 0) / values.length; };
const percent = value => value * 100;
function object(value, label) { assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), label + " must be an object"); }
function fields(value, names, label) { object(value, label); assert.deepEqual(Object.keys(value).sort(), [...names].sort(), label + " fields"); }
function exactSet(actual, expected, label) { assert.deepEqual([...actual].sort(), [...expected].sort(), label); }
function number(value, label, max = Infinity) { assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max, label + " must be finite and in range"); }
function integer(value, label) { number(value, label); assert.ok(Number.isSafeInteger(value), label + " must be an integer"); }
function score(value, label) { number(value, label, 1); }
function same(actual, expected, label) { number(actual, label); assert.ok(Math.abs(actual - expected) < 1e-10, label + " differs from question-level aggregate"); }
function sha(value, label) { assert.equal(typeof value, "string", label); assert.match(value, SHA256, label); }
function unique(rows, getKey, label) {
  assert.ok(Array.isArray(rows), label + " must be an array");
  const result = new Map();
  for (const row of rows) { object(row, label + " row"); const id = getKey(row); assert.equal(result.has(id), false, "duplicate " + label + ": " + id); result.set(id, row); }
  return result;
}

// Same question -> subgroup -> dimension hierarchy as the frozen initial report.
export function aggregateInitial(rows) {
  const questions = new Map();
  for (const row of rows) {
    if (row.status !== "scored") continue;
    const id = row.dimension + "/" + row.group + "/" + row.questionId;
    if (!questions.has(id)) questions.set(id, []);
    questions.get(id).push(row.score);
  }
  const groups = new Map();
  for (const [id, values] of questions) {
    const [dimension, group] = id.split("/");
    const groupKey = dimension + "/" + group;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(mean(values));
  }
  const result = {};
  const dimensions = new Map();
  for (const [id, values] of groups) {
    const [dimension, group] = id.split("/");
    const value = mean(values);
    result[group === "B_interaction_semantics" ? "b_interaction" : group.toLowerCase()] = value;
    if (!dimensions.has(dimension)) dimensions.set(dimension, []);
    dimensions.get(dimension).push(value);
  }
  for (const [dimension, values] of dimensions) result[dimension === "C" ? "c1" : dimension.toLowerCase()] = mean(values);
  return result;
}

const aggregateDescription = "Within each task: layouts equally per question, questions equally per registered subgroup, subgroups equally per dimension; tasks equally.";
const subgroupAggregation = "Layouts equally per question, registered questions equally within the subgroup, then tasks where that subgroup applies equally. An unregistered subgroup remains null.";
const processAggregation = "Slot scores in [0,1]: all planned slots equally within each scene, five scenes equally within each task, fourteen tasks equally; multiply the final mean by 100. Normal unreached slots remain zero.";
export const metrics = [
  ["overall", "Overall", "Weighted execution and VQA score.", "0.70 × Subtask + 0.30 × VQA", "Fourteen tasks equally; all component scores use the same seventy scenes."],
  ["vqa", "VQA", "Combined perception, task understanding and planning assessment.", "(A + B + C) / 3", "A and B retain the initial question/subgroup hierarchy. C = (C1 + C2 + C3) / 3. The three dimensions A/B/C and all fourteen tasks are equally weighted."],
  ["subtask", "Subtask", "Native intermediate progress under the frozen execution report policy. A normal failed episode with no intermediate scalar receives zero; missing or infrastructure results are not admitted.", "Mean native progress × 100", "Five scenes equally per task, then fourteen tasks equally."],
  ["success", "Success", "Fraction of scenes with a verified successful benchmark outcome.", "Successful scenes / 70 × 100", "Five scenes equally per task, then fourteen tasks equally."],
  ["a", "A · Perception", "Initial perception, using the actual registered A1/A2/A3 subgroups present in each task.", "Mean applicable A subgroups", aggregateDescription],
  ["b", "B · Understanding", "Initial understanding, using registered B1/B3/interaction-semantic subgroups present in each task.", "Mean applicable B subgroups", aggregateDescription],
  ["c", "C · Planning", "Initial full planning and checkpoint reasoning, with equal weight for all three capabilities.", "(C1 + C2 + C3) / 3", "Each component is first aggregated on the fixed publication scope; the three components are equally weighted."],
  ["a1", "A1 · Recognition", "Object identity, counts, attributes and initial state.", "Mean registered A1 question scores", subgroupAggregation],
  ["a2", "A2 · Localization", "Frozen per-question three-dimensional object-center localization scores, using the registered two-centimetre matching criterion and extra-object penalty.", "Mean registered A2 question scores", subgroupAggregation],
  ["a3", "A3 · Relations", "Relative positions, arrangements and initial alignment.", "Mean registered A3 question scores", subgroupAggregation],
  ["b1", "B1 · Goal Binding", "Task goals, selected objects and target binding.", "Mean registered B1 question scores", subgroupAggregation],
  ["b3", "B3 · Constraints", "Support, handover, orientation and finalization constraints.", "Mean registered B3 question scores", subgroupAggregation],
  ["b_interaction", "B · Interaction Semantics", "Task-specific interaction parts and regions.", "Mean registered interaction-semantic question scores", subgroupAggregation],
  ["c1", "C1 · Full Plan", "Initial complete high-level plan, scored by the shared v3 deterministic grader and verified semantic-equivalence table.", "Action-set F1 × (0.5 + 0.5 × effective pairwise order accuracy)", aggregateDescription],
  ["c2", "C2 · Completed Milestones", "Exact equality of the entire completed-milestone set at a reached checkpoint. A violation of the shared single-JSON schema or closed vocabulary makes both C2 and C3 zero. An unreached planned checkpoint receives zero.", "Slot = 1[predicted completed set = reference completed set]", processAggregation],
  ["c3", "C3 · Next Action", "S, O and P are 0/1 exact-match indicators for skill, object and the entire parameter object. All three indicators must be evaluated against the same single complete legal reference, then the best reference is selected. Shared JSON/schema/vocabulary violations make both C2 and C3 zero; normal unreached checkpoints receive zero.", "Slot = max over references (S + S×O + S×O×P) / 3", processAggregation],
].map(([id, label, definition, formula, aggregation]) => ({ id, label, definition, formula, aggregation, unit: "percent" }));

function publicSafe(value, label = "bundle") {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /(?:\/(?:mnt|bh|Users|root|home)\/|file:\/\/|https?:\/\/|\bsk-[A-Za-z0-9]{12,})/i, label + " contains a private path, endpoint or credential");
    if (value.startsWith("/")) assert.match(value, /^\/api\/t1-benchmark-media\/[A-Za-z0-9_-]+$/, label + " unsafe URL");
  } else if (Array.isArray(value)) value.forEach((item, index) => publicSafe(item, label + "[" + index + "]"));
  else if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) {
    assert.doesNotMatch(name.replaceAll("_", ""), /^(?:apikey|authorization|secret|baseurl|endpoint|groundtruth|rawresponse|answertext|context|reference|predicted)$/i, label + " contains a private field");
    publicSafe(item, label + "." + name);
  }
}

// Pure projection of sealed source snapshots: never performs grading or model calls.
export function validatePublicationSources({ initial, execution, process, media }, sourceHashes = registry.sourcePins) {
  fields(initial, ["schema", "scorerPolicy", "originalSummarySha256", "originalGradesSha256", "summary", "grades"], "initial source");
  assert.equal(initial.schema, "roboexam.t1-benchmark-initial-source.v1");
  assert.equal(initial.scorerPolicy, "agentbench.lenient-matching.v2");
  sha(initial.originalSummarySha256, "original initial summary digest"); sha(initial.originalGradesSha256, "original initial grades digest");
  assert.equal(initial.summary.schema, "agentbench.run-summary.v2");
  fields(execution, ["schema", "episodes"], "execution source");
  assert.equal(execution.schema, "roboexam.t1-benchmark-execution-source.v1");
  const scenes = unique(execution.episodes, row => key(row.taskId, row.layoutId), "execution scene");
  exactSet(scenes.keys(), plans.map(plan => key(plan.taskId, plan.layoutId)), "exact seventy-scene scope");
  const formalTasks = unique(initial.summary.tasks, row => row.task, "formal initial task");
  exactSet(formalTasks.keys(), taskIds, "exact fourteen-task initial scope");
  for (const [sceneKey, row] of scenes) {
    fields(row, ["id", "taskId", "layoutId", "attempt", "relativeAttempt", "episodeId", "status", "steps", "progressScore", "elapsedSeconds", "resultSha256"], "execution row");
    assert.equal(row.id, episodeId(row.taskId, row.layoutId));
    assert.match(row.attempt, /^attempt_\d+$/); assert.equal(row.relativeAttempt, "episodes/" + sceneKey + "/" + row.attempt);
    assert.ok(typeof row.episodeId === "string" && row.episodeId.length > 0);
    assert.ok(["success", "failure"].includes(row.status), "missing/infrastructure execution cannot become zero");
    integer(row.steps, "native control steps");
    if (row.progressScore !== null) score(row.progressScore, "native progress");
    if (row.elapsedSeconds !== null) number(row.elapsedSeconds, "elapsed seconds");
    sha(row.resultSha256, "final result digest");
  }
  const questions = unique(initial.grades, row => key(row.taskId, row.layoutId) + "/" + row.questionId, "initial question");
  const excluded = new Set(registry.initialExcludedInstances);
  const expectedQuestions = plans.flatMap(plan => Object.keys(registry.initialQuestions[plan.taskId]).map(q => key(plan.taskId, plan.layoutId) + "/" + q));
  exactSet(questions.keys(), expectedQuestions, "complete initial question denominator");
  for (const [questionKey, row] of questions) {
    fields(row, ["taskId", "layoutId", "attempt", "questionId", "dimension", "group", "status", "score", "formatCompliant"], "initial question row");
    const scene = scenes.get(key(row.taskId, row.layoutId));
    assert.equal(row.attempt, scene.attempt, "initial/final exact attempt binding");
    assert.deepEqual({ dimension: row.dimension, group: row.group }, registry.initialQuestions[row.taskId][row.questionId], "registered question group");
    if (excluded.has(questionKey)) { assert.equal(row.status, "not_graded"); assert.equal(row.score, null, "ineligible score remains null"); }
    else { assert.equal(row.status, "scored", "missing initial answer blocks publication"); score(row.score, "initial question score"); }
    assert.ok(row.formatCompliant === null || typeof row.formatCompliant === "boolean");
  }
  fields(process, ["schema", "originalSummarySha256", "originalSlotsSha256", "protocol", "summary", "slots"], "process source");
  assert.equal(process.schema, "roboexam.t1-benchmark-process-source.v1");
  assert.equal(process.protocol, "agentbench.native16.c2c3.v1");
  sha(process.originalSummarySha256, "original process summary digest"); sha(process.originalSlotsSha256, "original process slots digest");
  assert.equal(process.summary.schema, "agentbench.native16.live-scores.v1");
  assert.equal(process.summary.answer_provenance, "verified_capture"); assert.equal(process.summary.answer_provenance_verified, true); assert.equal(process.summary.diagnostic_only, false);
  for (const name of ["capture_implementation_sha256", "scorer_implementation_sha256", "implementation_sha256", "catalogue_sha256", "campaign_plan_sha256"]) sha(process.summary[name], name);
  const slots = unique(process.slots, row => row.slot_id, "process slot");
  exactSet(slots.keys(), registry.scenePlans.flatMap(plan => plan.slotIds), "full original 237-slot denominator");
  let verified = 0;
  const scoredQuestions = new Set();
  const statusCounts = {};
  for (const row of slots.values()) {
    fields(row, ["slot_id", "task_name", "layout_id", "stage_id", "status", "attempt", "episode_id", "C2_score", "C3_score", "source_verified", "question_id", "official_question_result"], "process slot row");
    assert.equal(row.slot_id, key(row.task_name, row.layout_id) + "/" + row.stage_id, "slot identity binding");
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    if (row.status === "scored") {
      assert.equal(row.source_verified, true); assert.equal(row.official_question_result, true);
      score(row.C2_score, "C2 verified score"); score(row.C3_score, "C3 verified score");
      assert.ok(typeof row.question_id === "string" && row.question_id.length > 0); scoredQuestions.add(row.question_id); verified++;
    } else if (row.status === "not_reached") { assert.equal(row.C2_score, 0); assert.equal(row.C3_score, 0); }
    else assert.ok(["missing_episode", "reached_reference_blocked", "source_infra_error", "ready", "pending"].includes(row.status), "unknown process status");
    const scene = scenes.get(key(row.task_name, row.layout_id));
    if (scene) {
      assert.ok(["scored", "not_reached"].includes(row.status), "unresolved publication slot cannot become zero");
      assert.equal(row.attempt, scene.relativeAttempt, "process/final exact attempt binding");
      assert.equal(row.episode_id, scene.episodeId, "process/final episode identity");
    }
  }
  assert.equal(slots.size, process.summary.coverage.planned_slots);
  assert.equal(verified, process.summary.coverage.scored_slots);
  assert.deepEqual(statusCounts, process.summary.coverage.status_counts, "original process coverage");
  assert.equal(scoredQuestions.size, process.summary.verified_scored_questions);
  integer(process.summary.qa_dispatch_count, "QA dispatch count");
  assert.ok(process.summary.qa_dispatch_count >= scoredQuestions.size);
  fields(media, ["schema", "episodes"], "media source"); assert.equal(media.schema, "roboexam.t1-benchmark-media-source.v1");
  const videos = unique(media.episodes, row => key(row.taskId, row.layoutId), "media scene");
  exactSet(videos.keys(), scenes.keys(), "media exact seventy-scene scope");
  const episodes = plans.map(plan => {
    const sceneKey = key(plan.taskId, plan.layoutId), scene = scenes.get(sceneKey), mediaRow = videos.get(sceneKey);
    fields(mediaRow, ["id", "taskId", "layoutId", "attempt", "video"], "media row");
    assert.equal(mediaRow.id, scene.id); assert.equal(mediaRow.attempt, scene.attempt, "media/final exact attempt binding");
    if (mediaRow.video !== null) {
      const video = mediaRow.video;
      fields(video, ["id", "url", "sha256", "bytes", "frames", "fps"], "public video");
      assert.equal(video.id, scene.id); assert.equal(video.url, "/api/t1-benchmark-media/" + scene.id);
      sha(video.sha256, "video digest"); integer(video.bytes, "video bytes"); assert.ok(video.bytes > 0);
      if (video.frames !== null) { integer(video.frames, "video frames"); assert.ok(video.frames > 0); }
      if (video.fps !== null) { number(video.fps, "video fps"); assert.ok(video.fps > 0); }
    }
    const initialScores = aggregateInitial(initial.grades.filter(row => key(row.taskId, row.layoutId) === sceneKey));
    const sceneSlots = plan.slotIds.map(id => slots.get(id));
    const raw = { ...initialScores, c2: mean(sceneSlots.map(row => row.C2_score)), c3: mean(sceneSlots.map(row => row.C3_score)), subtask: scene.progressScore ?? 0, success: scene.status === "success" ? 1 : 0 };
    for (const required of ["a", "b", "c1"]) score(raw[required], "complete episode " + required);
    raw.c = mean([raw.c1, raw.c2, raw.c3]); raw.vqa = mean([raw.a, raw.b, raw.c]); raw.overall = .7 * raw.subtask + .3 * raw.vqa;
    return { id: scene.id, modelId: registry.model.id, taskId: plan.taskId, layoutId: plan.layoutId, attempt: scene.attempt,
      execution: { steps: scene.steps, subtask: percent(raw.subtask), success: scene.status === "success", elapsedSeconds: scene.elapsedSeconds },
      scores: Object.fromEntries(metrics.map(({ id }) => [id, Object.hasOwn(raw, id) ? percent(raw[id]) : null])), video: mediaRow.video };
  });
  const taskScores = taskIds.map(task => {
    const rows = initial.grades.filter(row => row.taskId === task);
    const raw = aggregateInitial(rows), declared = formalTasks.get(task);
    assert.equal(declared.layouts, 5);
    for (const [name, field] of [["a", "A"], ["b", "B"], ["c1", "C"]]) same(declared[field], raw[name], task + " " + field);
    same(declared.vqa_composite, mean([raw.a, raw.b, raw.c1]), task + " initial composite");
    const ownEpisodes = episodes.filter(row => row.taskId === task);
    for (const name of ["c2", "c3", "subtask", "success"]) raw[name] = mean(ownEpisodes.map(row => row.scores[name] / 100));
    same(declared.mean_progress, raw.subtask, task + " native progress"); same(declared.success_rate, raw.success, task + " success rate");
    raw.c = mean([raw.c1, raw.c2, raw.c3]); raw.vqa = mean([raw.a, raw.b, raw.c]); raw.overall = .7 * raw.subtask + .3 * raw.vqa;
    return raw;
  });
  const modelScores = {};
  for (const metric of metrics) {
    const applicable = taskScores.filter(row => Object.hasOwn(row, metric.id));
    modelScores[metric.id] = applicable.length ? percent(mean(applicable.map(row => row[metric.id]))) : null;
  }
  for (const [field, name] of [["A", "a"], ["B", "b"], ["C", "c1"], ["mean_progress", "subtask"], ["success_rate", "success"]]) same(initial.summary.overall[field], modelScores[name] / 100, "formal overall " + field);
  same(initial.summary.overall.vqa_composite, mean([modelScores.a, modelScores.b, modelScores.c1]) / 100, "formal initial composite");
  assert.equal(initial.summary.overall.layouts, 70);
  fields(sourceHashes, SOURCE_NAMES, "source digests"); for (const name of SOURCE_NAMES) sha(sourceHashes[name], name + " snapshot digest");
  const result = {
    schemaVersion: registry.schemaVersion, resultVersion: registry.resultVersion, generatedAt: registry.generatedAt,
    scope: { taskCount: taskIds.length, sceneCount: plans.length, processSlotCount: plans.reduce((n, plan) => n + plan.slotIds.length, 0), layoutIds: [...new Set(plans.map(plan => plan.layoutId))].sort((a, b) => a - b), taskIds },
    models: [{ ...registry.model, scores: modelScores }], tasks: registry.tasks, episodes, metrics,
    provenance: { publicationScopeId: registry.publicationScopeId, sourceHashes: { ...sourceHashes, originalInitialSummary: initial.originalSummarySha256, originalInitialGrades: initial.originalGradesSha256, originalProcessSummary: process.originalSummarySha256, originalProcessSlots: process.originalSlotsSha256 }, initialScorerPolicy: initial.scorerPolicy, processProtocol: process.protocol, processCaptureSha256: process.summary.capture_implementation_sha256, processScorerSha256: process.summary.scorer_implementation_sha256 },
  };
  assert.equal(result.scope.taskCount, 14); assert.equal(result.scope.sceneCount, 70); assert.equal(result.scope.processSlotCount, 207);
  publicSafe(result);
  return result;
}

export async function readPinned(file, expectedSha256) {
  sha(expectedSha256, "source SHA-256 pin");
  const bytes = await readFile(file);
  assert.equal(sha256(bytes), expectedSha256, "source SHA-256 drift: " + path.basename(file));
  return bytes;
}

export async function buildLegacyPublishedBundle(sourceRoot = process.env.T1_BENCHMARK_SOURCE_ROOT || new URL("../.local/t1-benchmark/source/", import.meta.url)) {
  const root = await realpath(sourceRoot), sources = {};
  fields(registry.sourcePins, SOURCE_NAMES, "pinned source allowlist");
  for (const name of SOURCE_NAMES) {
    const file = await realpath(path.join(root, name + ".json"));
    assert.ok(file.startsWith(root + path.sep), "source path escapes allowlisted root");
    assert.ok((await lstat(file)).isFile(), "source must be a regular file");
    sources[name] = JSON.parse((await readPinned(file, registry.sourcePins[name])).toString("utf8"));
  }
  return validatePublicationSources(sources);
}

export async function buildPublishedBundle(sourceRoot) {
  return buildFinalResults(metrics, sourceRoot);
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--check"), "only --check is supported");
  const serialized = JSON.stringify(await buildPublishedBundle(), null, 2) + "\n";
  const output = new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url);
  if (args.includes("--check")) assert.equal(await readFile(output, "utf8"), serialized, "published benchmark bundle is stale");
  else await writeFile(output, serialized);
  console.log(args.includes("--check") ? "Benchmark bundle matches the sealed two-model v3 cohort." : "Published the fourteen-task benchmark bundle.");
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
