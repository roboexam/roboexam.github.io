import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t1AgentResultRegistry as registry } from "./t1-agent-result-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const MODELS = ["deepseek", "mimo", "kimi", "gpt6-astra"];
const LAYOUTS = [124, 136, 125, 138, 134];
const LABELS = ["DeepSeek v4.1 Flash", "MiMo v2.6 Pro", "Kimi K3", "GPT-6 Astra"];
const SCORE_KEYS = ["count", "color", "a1", "a2", "b1", "c1", "a", "b", "c", "composite"];
const QUESTIONS = {
  count: "stack_bowls.revised.count",
  color: "stack_bowls.revised.interior_color",
  a2: "stack_bowls.revised.bowl_centers",
  b1: "stack_bowls.revised.stack_relation",
  c1: "stack_bowls.revised.complete_plan",
};
const SOURCE_NAMES = ["initial-rescore", "selection", "native-progress", "gpt-overview", "initial-sources", "execution-metadata"];

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const key = (model, layout) => model + ":" + layout;
const mean = values => {
  const present = values.filter(value => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
};
const percent = value => value === null ? null : value * 100;

function sameNumber(actual, expected, label) {
  if (expected === null) assert.equal(actual, null, label + " must remain null");
  else assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, label + " differs from source");
}
function boundedScore(value, label) {
  assert.ok(value === null || (Number.isFinite(value) && value >= 0 && value <= 100), label + " must be null or a 0–100 score");
}
function nonnegative(value, label, integer = false) {
  assert.ok(Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value)), label + " must be non-negative");
}
function unique(records, field, label) {
  const result = new Map();
  for (const record of records) {
    assert.equal(typeof record[field], "string", label + " identity");
    assert.equal(result.has(record[field]), false, "duplicate " + label + ": " + record[field]);
    result.set(record[field], record);
  }
  return result;
}
function exactSet(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}
function scoresFromSource(summary, perQuestion) {
  const values = Object.fromEntries(Object.entries(QUESTIONS).map(([name, question]) => [name, percent(perQuestion.get(question))]));
  return {
    count: values.count, color: values.color, a1: mean([values.count, values.color]),
    a2: values.a2, b1: values.b1, c1: values.c1,
    a: percent(summary.A), b: percent(summary.B), c: percent(summary.C),
    composite: percent(summary.vqa_composite),
  };
}
function validateScores(actual, expected, label) {
  exactSet(Object.keys(actual), SCORE_KEYS, label + " score fields");
  for (const name of SCORE_KEYS) {
    boundedScore(actual[name], label + "." + name);
    sameNumber(actual[name], expected[name], label + "." + name);
  }
}
function publicSafe(value, label = "bundle") {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /(?:\/(?:mnt|bh|Users|root|home)\/|file:\/\/|https?:\/\/|\bsk-[A-Za-z0-9]{12,})/i, label + " contains a private path, endpoint or credential");
    if (value.startsWith("/")) assert.match(value, /^\/api\/t1-media\/[a-z0-9][a-z0-9-]+$/, label + " unsafe absolute URL");
  } else if (Array.isArray(value)) value.forEach((item, index) => publicSafe(item, label + "[" + index + "]"));
  else if (value && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      assert.doesNotMatch(name.replaceAll("_", ""), /^(?:apikey|authorization|secret|baseurl|endpoint|groundtruth|rawresponse|context|predicted)$/i, label + " contains a private field");
      publicSafe(item, label + "." + name);
    }
  }
}

// Pure validation and projection: no source grading, model calls, filesystem writes or media reads.
export function validatePublicationManifest(manifest, initialReport, executionMetadata) {
  assert.equal(manifest.schemaVersion, "roboexam.t1-publication.v1");
  assert.equal(manifest.resultVersion, registry.resultVersion);
  assert.ok(typeof manifest.generatedAt === "string" && Number.isFinite(Date.parse(manifest.generatedAt)), "generatedAt");
  assert.deepEqual(manifest.task, { id: "stack_bowls", label: "Stack Bowls", layoutIds: LAYOUTS });
  assert.equal(initialReport.schema, "agentbench.four-model-historical-initial-rescore.v1");
  assert.equal(initialReport.scorer.commit, registry.scorerCommit);
  assert.equal(initialReport.validation.model_api_calls, 0);
  assert.equal(initialReport.validation.simulator_starts, 0);
  assert.equal(initialReport.validation.original_files_unchanged, true);
  assert.equal(initialReport.validation.scorer_files_unchanged, true);
  assert.equal(initialReport.questions.length, 100);
  assert.equal(initialReport.episodes.length, 20);
  assert.equal(initialReport.summaries.length, 4);

  const questions = new Map();
  for (const row of initialReport.questions) {
    assert.ok(MODELS.includes(row.model) && LAYOUTS.includes(row.layout), "unknown source question model/layout");
    assert.ok(Object.values(QUESTIONS).includes(row.question_id), "unknown source question ID");
    const identity = key(row.model, row.layout) + ":" + row.question_id;
    assert.equal(questions.has(identity), false, "duplicate source question");
    assert.ok(row.score === null || (Number.isFinite(row.score) && row.score >= 0 && row.score <= 1), "source score range");
    if (row.original_answer_state !== "normal") assert.equal(row.score, null, "missing answer cannot have a score");
    questions.set(identity, row);
  }
  const originalEpisodes = new Map();
  for (const row of initialReport.episodes) {
    const identity = key(row.model, row.layout);
    assert.equal(originalEpisodes.has(identity), false, "duplicate source episode");
    originalEpisodes.set(identity, row);
  }
  const originalSummaries = unique(initialReport.summaries, "model", "source model");
  exactSet(originalSummaries.keys(), MODELS, "source model set");
  assert.equal(executionMetadata.schemaVersion, "roboexam.t1-execution-metadata.v1");
  assert.equal(executionMetadata.episodes.length, 20);
  const executionSources = unique(executionMetadata.episodes, "id", "execution source");

  assert.equal(manifest.models.length, 4);
  assert.equal(manifest.episodes.length, 20);
  const modelById = unique(manifest.models, "id", "model");
  exactSet(modelById.keys(), MODELS, "model set");
  const episodesById = unique(manifest.episodes, "id", "episode");
  const slots = new Map();
  const videos = new Set();
  for (const row of manifest.episodes) {
    assert.ok(MODELS.includes(row.modelId) && LAYOUTS.includes(row.layoutId), "unknown publication model/layout");
    const identity = key(row.modelId, row.layoutId);
    assert.equal(slots.has(identity), false, "duplicate model/layout");
    slots.set(identity, row);
    assert.equal(row.id, registry.resultVersion + "-" + row.modelId + "-layout" + row.layoutId, "episode ID/model/layout binding");
    assert.equal(row.expected, 5);
    const original = originalEpisodes.get(identity);
    assert.ok(original, "missing original episode");
    const perQuestion = new Map();
    let answered = 0;
    for (const question of Object.values(QUESTIONS)) {
      const source = questions.get(identity + ":" + question);
      assert.ok(source, "missing source question");
      perQuestion.set(question, source.score);
      answered += source.original_answer_state === "normal" ? 1 : 0;
    }
    assert.equal(row.answered, answered, identity + " answer coverage");
    validateScores(row.scores, scoresFromSource(original.summary, perQuestion), identity);
    const executionSource = executionSources.get(row.id);
    assert.ok(executionSource, "missing exact execution source");
    assert.equal(executionSource.modelId, row.modelId, "execution source model");
    assert.equal(executionSource.layoutId, row.layoutId, "execution source layout");
    assert.deepEqual(row.execution, executionSource.execution, "execution metadata source agreement");
    assert.deepEqual(row.video, executionSource.video, "video source agreement");
    assert.deepEqual(row.provenance, executionSource.provenance, "provenance source agreement");
    exactSet(Object.keys(row.execution), ["steps", "progress", "success", "state", "reason", "elapsedSeconds"], "execution public fields");
    exactSet(Object.keys(row.video), ["id", "url", "sha256", "bytes", "frames", "fps", "hasMotion"], "video public fields");
    exactSet(Object.keys(row.provenance), ["initialSealSha256", "executionSealSha256", "sameEpisode", "attempt"], "provenance public fields");
    const execution = row.execution;
    nonnegative(execution.steps, identity + " steps", true);
    boundedScore(execution.progress, identity + " progress");
    assert.ok(execution.success === null || typeof execution.success === "boolean", "success must remain boolean/null");
    assert.ok(typeof execution.state === "string" && execution.state.length > 0, "execution state");
    assert.equal(typeof execution.reason, "string");
    if (execution.elapsedSeconds !== null) nonnegative(execution.elapsedSeconds, "elapsed seconds");
    const video = row.video;
    assert.match(video.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.equal(video.id, row.id, "video/episode identity");
    assert.equal(video.url, "/api/t1-media/" + video.id, "video stable URL");
    assert.equal(videos.has(video.id), false, "duplicate video");
    videos.add(video.id);
    assert.match(video.sha256, SHA256);
    nonnegative(video.bytes, "video bytes", true);
    assert.ok(video.bytes > 0, "empty video");
    if (video.frames !== null) nonnegative(video.frames, "video frames", true);
    if (video.fps !== null) assert.ok(Number.isFinite(video.fps) && video.fps > 0, "video fps");
    assert.equal(typeof video.hasMotion, "boolean");
    if (execution.steps === 0 || video.frames === 1) assert.equal(video.hasMotion, false, "initial-only video is not a moving execution");
    const provenance = row.provenance;
    assert.match(provenance.initialSealSha256, SHA256);
    assert.match(provenance.executionSealSha256, SHA256);
    assert.equal(provenance.initialSealSha256, original.original_seal_sha256, "initial first-answer seal");
    assert.equal(typeof provenance.sameEpisode, "boolean");
    assert.equal(provenance.sameEpisode, provenance.initialSealSha256 === provenance.executionSealSha256, "sameEpisode/seal agreement");
    assert.ok(typeof provenance.attempt === "string" && provenance.attempt.length > 0, "attempt identity");
  }
  assert.equal(episodesById.size, executionSources.size, "execution source record count");
  let totalAnswered = 0;
  const models = MODELS.map((id, index) => {
    const model = modelById.get(id);
    const source = originalSummaries.get(id);
    assert.equal(model.label, LABELS[index]);
    assert.equal(typeof model.family, "string");
    for (const field of ["requestModel", "responseModel"]) assert.ok(typeof model[field] === "string" && model[field].length > 0, "model identity");
    assert.equal(model.expected, 25);
    assert.equal(model.answered, source.normal_first_answers);
    assert.equal(model.answered, id === "kimi" ? 22 : 25);
    const perQuestion = new Map();
    for (const question of Object.values(QUESTIONS)) {
      const all = LAYOUTS.map(layout => questions.get(key(id, layout) + ":" + question));
      assert.ok(all.every(Boolean), "complete source slot set");
      const present = all.filter(row => row.score !== null);
      const meanScore = mean(all.map(row => row.score));
      const declared = source.per_question.find(row => row.question_id === question);
      assert.ok(declared, "source per-question aggregate");
      assert.equal(declared.scored_layouts, present.length, "per-question coverage");
      sameNumber(declared.mean_score, meanScore, "source per-question mean");
      perQuestion.set(question, declared.mean_score);
    }
    validateScores(model.scores, scoresFromSource(source, perQuestion), id);
    const ownEpisodes = LAYOUTS.map(layout => slots.get(key(id, layout)));
    assert.ok(ownEpisodes.every(Boolean), "complete model/layout matrix");
    assert.equal(ownEpisodes.reduce((sum, row) => sum + row.answered, 0), model.answered, "model answer coverage");
    const observed = ownEpisodes.map(row => row.execution.progress).filter(value => value !== null);
    sameNumber(model.maxProgress, observed.length ? Math.max(...observed) : null, "model max observed progress");
    totalAnswered += model.answered;
    return {
      id, label: model.label, family: model.family, requestModel: model.requestModel,
      responseModel: model.responseModel, answered: model.answered, expected: model.expected,
      scores: model.scores, maxProgress: model.maxProgress,
    };
  });
  assert.equal(totalAnswered, 97);
  exactSet(Object.keys(manifest.scorer), ["commit", "policy", "reportSha256", "notes"], "scorer public fields");
  assert.equal(manifest.scorer.commit, registry.scorerCommit);
  assert.equal(manifest.scorer.policy, "semantic-v1");
  assert.equal(manifest.scorer.reportSha256, registry.initialReportSha256);
  assert.ok(Array.isArray(manifest.scorer.notes) && manifest.scorer.notes.every(note => typeof note === "string" && note.length > 0), "scorer notes");
  exactSet(Object.keys(manifest.sourceFiles), SOURCE_NAMES, "source file set");
  exactSet(Object.keys(manifest.sourceHashes), SOURCE_NAMES, "source hash set");
  for (const name of SOURCE_NAMES) {
    assert.equal(manifest.sourceFiles[name].path, "sources/" + name + ".json", "allowlisted source path");
    assert.match(manifest.sourceFiles[name].sha256, SHA256);
    assert.equal(manifest.sourceHashes[name], manifest.sourceFiles[name].sha256, "source hash binding");
    nonnegative(manifest.sourceFiles[name].bytes, "source file bytes", true);
  }
  assert.equal(manifest.sourceHashes["initial-rescore"], registry.initialReportSha256);
  const episodes = MODELS.flatMap(model => LAYOUTS.map(layout => {
    const row = slots.get(key(model, layout));
    return {
      id: row.id, modelId: row.modelId, layoutId: row.layoutId, answered: row.answered, expected: row.expected,
      scores: row.scores, execution: row.execution, video: row.video, provenance: row.provenance,
    };
  }));
  const bundle = {
    schemaVersion: "roboexam.t1-results.v1", resultVersion: manifest.resultVersion, generatedAt: manifest.generatedAt,
    task: manifest.task, models, episodes, scorer: manifest.scorer, sourceHashes: manifest.sourceHashes,
  };
  publicSafe(bundle);
  return bundle;
}

export async function readPinned(file, expectedSha256, expectedBytes) {
  assert.match(expectedSha256, SHA256, "source SHA-256 pin");
  const bytes = await readFile(file);
  assert.equal(sha256(bytes), expectedSha256, "source SHA-256 drift: " + path.basename(file));
  if (expectedBytes !== undefined) assert.equal(bytes.length, expectedBytes, "source byte count");
  return bytes;
}
async function contained(root, relative) {
  const actual = await realpath(path.join(root, relative));
  assert.ok(actual.startsWith(root + path.sep), "publication file escapes source root");
  assert.ok((await lstat(actual)).isFile(), "publication source must be a regular file");
  return actual;
}

export async function buildPublishedBundle() {
  const root = await realpath(registry.publicationRoot);
  const manifest = JSON.parse((await readPinned(await contained(root, "publication-manifest.json"), registry.publicationManifestSha256)).toString("utf8"));
  // Validate safe allowlisted source paths before opening private source files.
  exactSet(Object.keys(manifest.sourceFiles), SOURCE_NAMES, "source file set");
  const sources = {};
  for (const name of SOURCE_NAMES) {
    const source = manifest.sourceFiles[name];
    assert.equal(source.path, "sources/" + name + ".json", "allowlisted source path");
    const bytes = await readPinned(await contained(root, source.path), source.sha256, source.bytes);
    sources[name] = JSON.parse(bytes.toString("utf8"));
  }
  const bundle = validatePublicationManifest(manifest, sources["initial-rescore"], sources["execution-metadata"]);
  for (const episode of bundle.episodes) {
    const file = await contained(root, "media/" + episode.video.id + ".mp4");
    await readPinned(file, episode.video.sha256, episode.video.bytes);
  }
  bundle.sourceHashes = { ...bundle.sourceHashes, "publication-manifest": registry.publicationManifestSha256 };
  return bundle;
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--check"), "only --check is supported");
  const serialized = JSON.stringify(await buildPublishedBundle(), null, 2) + "\n";
  if (args.includes("--check")) {
    assert.equal(await readFile(registry.outputFile, "utf8"), serialized, "published Track1 bundle is stale; run npm run export:t1");
    console.log("Track1 bundle matches the immutable source packet and twenty videos.");
  } else {
    await writeFile(registry.outputFile, serialized);
    console.log("Published Track1 results bundle.");
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
