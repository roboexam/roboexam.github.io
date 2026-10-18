import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { t1AgentResultRegistry as registry } from "../scripts/t1-agent-result-registry.mjs";
import { readPinned, sha256, validatePublicationManifest } from "../scripts/export-t1-agent-results.mjs";

const MODELS = ["deepseek", "mimo", "kimi", "gpt6-astra"];
const LABELS = ["DeepSeek v4.1 Flash", "MiMo v2.6 Pro", "Kimi K3", "GPT-6 Astra"];
const LAYOUTS = [124, 136, 125, 138, 134];
const QUESTIONS = ["count", "interior_color", "bowl_centers", "stack_relation", "complete_plan"].map(name => "stack_bowls.revised." + name);
const SOURCE_NAMES = ["initial-rescore", "selection", "native-progress", "gpt-overview", "initial-sources", "execution-metadata"];
const clone = value => structuredClone(value);

// Synthetic fixture: known half-credit grades, plus the real coverage shape of one incomplete layout.
// It contains no saved candidate answers, private truth, API access or source filesystem paths.
function fixture() {
  const report = {
    schema: "agentbench.four-model-historical-initial-rescore.v1",
    scorer: { commit: registry.scorerCommit },
    validation: { model_api_calls: 0, simulator_starts: 0, original_files_unchanged: true, scorer_files_unchanged: true },
    questions: [], episodes: [], summaries: [],
  };
  const manifest = {
    schemaVersion: "roboexam.t1-publication.v1", resultVersion: registry.resultVersion,
    generatedAt: "2026-10-18T00:00:00+00:00",
    task: { id: "stack_bowls", label: "Stack Bowls", layoutIds: LAYOUTS },
    models: [], episodes: [],
    scorer: { commit: registry.scorerCommit, policy: "semantic-v1", reportSha256: registry.initialReportSha256, notes: ["Saved structured-plan scores."] },
    sourceFiles: {}, sourceHashes: {},
  };
  const metadata = { schemaVersion: "roboexam.t1-execution-metadata.v1", episodes: [] };
  const completeScores = { count: 50, color: 50, a1: 50, a2: 50, b1: 50, c1: 50, a: 50, b: 50, c: 50, composite: 50 };
  for (const name of SOURCE_NAMES) {
    const hash = name === "initial-rescore" ? registry.initialReportSha256 : sha256(name);
    manifest.sourceFiles[name] = { path: "sources/" + name + ".json", sha256: hash, bytes: 1 };
    manifest.sourceHashes[name] = hash;
  }
  MODELS.forEach((modelId, index) => {
    report.summaries.push({
      model: modelId, A: 0.5, B: 0.5, C: 0.5, vqa_composite: 0.5,
      normal_first_answers: modelId === "kimi" ? 22 : 25,
      per_question: QUESTIONS.map((question_id, q) => ({ question_id, mean_score: 0.5, scored_layouts: modelId === "kimi" && q > 1 ? 4 : 5 })),
    });
    manifest.models.push({
      id: modelId, label: LABELS[index], family: "VLM", requestModel: modelId, responseModel: modelId,
      answered: modelId === "kimi" ? 22 : 25, expected: 25, scores: clone(completeScores), maxProgress: 15,
    });
    for (const layoutId of LAYOUTS) {
      const incomplete = modelId === "kimi" && layoutId === 124;
      const id = registry.resultVersion + "-" + modelId + "-layout" + layoutId;
      const seal = sha256(id);
      QUESTIONS.forEach((question_id, q) => report.questions.push({
        model: modelId, layout: layoutId, question_id, score: incomplete && q > 1 ? null : 0.5,
        original_answer_state: incomplete && q > 1 ? (q === 2 ? "infrastructure_missing" : "not_dispatched") : "normal",
      }));
      report.episodes.push({
        model: modelId, layout: layoutId, original_seal_sha256: seal,
        summary: { A: 0.5, B: incomplete ? null : 0.5, C: incomplete ? null : 0.5, vqa_composite: incomplete ? null : 0.5 },
      });
      const scores = incomplete
        ? { count: 50, color: 50, a1: 50, a2: null, b1: null, c1: null, a: 50, b: null, c: null, composite: null }
        : clone(completeScores);
      const episode = {
        id, modelId, layoutId, answered: incomplete ? 2 : 5, expected: 5, scores,
        execution: { steps: incomplete ? 0 : 10, progress: 15, success: null, state: "budget_censored", reason: "saved_stop", elapsedSeconds: null },
        video: { id, url: "/api/t1-media/" + id, sha256: sha256("video:" + id), bytes: 1, frames: incomplete ? 1 : 11, fps: 30, hasMotion: !incomplete },
        provenance: { initialSealSha256: seal, executionSealSha256: seal, sameEpisode: true, attempt: "selected-original-attempt" },
      };
      manifest.episodes.push(episode);
      metadata.episodes.push(clone(episode));
    }
  });
  return { manifest, report, metadata };
}
const validate = f => validatePublicationManifest(f.manifest, f.report, f.metadata);
function changeTogether(f, index, field, value) {
  f.manifest.episodes[index].video[field] = value;
  f.metadata.episodes[index].video[field] = value;
}

test("complete source matrix preserves partial coverage and observed progress independently of unknown success", () => {
  const bundle = validate(fixture());
  assert.equal(bundle.schemaVersion, "roboexam.t1-results.v1");
  assert.equal(bundle.models.length, 4);
  assert.equal(bundle.episodes.length, 20);
  assert.equal(bundle.models.reduce((sum, model) => sum + model.answered, 0), 97);
  const partial = bundle.episodes.find(row => row.modelId === "kimi" && row.layoutId === 124);
  assert.equal(partial.scores.composite, null);
  assert.equal(partial.scores.a2, null);
  assert.equal(partial.execution.success, null);
  assert.equal(partial.execution.progress, 15);
  assert.equal(partial.video.hasMotion, false);
  assert.equal("sourceFiles" in bundle, false);
});

test("duplicate model/layout and cross-model video joins are rejected", () => {
  const duplicate = fixture();
  duplicate.manifest.episodes[1] = clone(duplicate.manifest.episodes[0]);
  assert.throws(() => validate(duplicate), /duplicate/);
  const crossModel = fixture();
  crossModel.manifest.episodes[0].video = clone(crossModel.manifest.episodes[5].video);
  assert.throws(() => validate(crossModel), /video source agreement/);
});

test("missing scores cannot become zero and measured zero remains available", () => {
  const missing = fixture();
  missing.manifest.episodes.find(row => row.modelId === "kimi" && row.layoutId === 124).scores.a2 = 0;
  assert.throws(() => validate(missing), /must remain null/);
  const zero = fixture();
  // A saved, graded zero is legitimate; do not confuse it with missing data.
  zero.manifest.episodes[0].scores.b1 = 0;
  zero.manifest.episodes[0].scores.b = 0;
  zero.report.questions[3].score = 0;
  zero.report.episodes[0].summary.B = 0;
  zero.report.episodes[0].summary.vqa_composite = 1 / 3;
  zero.manifest.episodes[0].scores.composite = 100 / 3;
  zero.report.summaries[0].per_question[3].mean_score = 0.4;
  zero.report.summaries[0].B = 0.4;
  zero.report.summaries[0].vqa_composite = 1.4 / 3;
  zero.manifest.models[0].scores.b1 = 40;
  zero.manifest.models[0].scores.b = 40;
  zero.manifest.models[0].scores.composite = 140 / 3;
  assert.equal(validate(zero).episodes[0].scores.b1, 0);
});

test("aggregate disagreement and a nonfinite source score fail closed", () => {
  const aggregate = fixture();
  aggregate.manifest.models[0].scores.composite = 49;
  assert.throws(() => validate(aggregate), /differs from source/);
  const sourceMean = fixture();
  sourceMean.report.summaries[0].per_question[0].mean_score = 0.2;
  assert.throws(() => validate(sourceMean), /source per-question mean/);
  const nonfinite = fixture();
  nonfinite.manifest.models[0].scores.a1 = Infinity;
  assert.throws(() => validate(nonfinite), /0–100/);
});

test("unsafe media IDs, paths, source pins and publication URLs are rejected", () => {
  const unsafeId = fixture();
  changeTogether(unsafeId, 0, "id", "../other");
  assert.throws(() => validate(unsafeId));
  const unsafeUrl = fixture();
  changeTogether(unsafeUrl, 0, "url", "http://example.invalid/video.mp4");
  assert.throws(() => validate(unsafeUrl), /stable URL/);
  const unsafeSource = fixture();
  unsafeSource.manifest.sourceFiles.selection.path = "/bh/private.json";
  assert.throws(() => validate(unsafeSource), /allowlisted source path/);
  const drift = fixture();
  drift.manifest.sourceHashes["initial-rescore"] = sha256("wrong");
  assert.throws(() => validate(drift), /source hash binding/);
  const bodyLeak = fixture();
  bodyLeak.manifest.scorer.notes.push("Source /bh/private/context.json");
  assert.throws(() => validate(bodyLeak), /private path/);
});

test("identity and capture semantics are not inferred from a filename or task outcome", () => {
  const wrongSeal = fixture();
  wrongSeal.manifest.episodes[0].provenance.initialSealSha256 = sha256("wrong");
  wrongSeal.metadata.episodes[0].provenance.initialSealSha256 = sha256("wrong");
  assert.throws(() => validate(wrongSeal), /first-answer seal/);
  const staticMotion = fixture();
  const i = staticMotion.manifest.episodes.findIndex(row => row.modelId === "kimi" && row.layoutId === 124);
  changeTogether(staticMotion, i, "hasMotion", true);
  assert.throws(() => validate(staticMotion), /not a moving execution/);
  const unknown = fixture();
  unknown.manifest.episodes[0].execution.success = false;
  assert.throws(() => validate(unknown), /execution metadata source agreement/);
});

test("generated current release retains the exact report scores and all twenty media identities", async () => {
  const bundle = JSON.parse(await readFile(new URL("../app/data/generated/t1-agent-results.json", import.meta.url), "utf8"));
  assert.equal(bundle.schemaVersion, "roboexam.t1-results.v1");
  assert.equal(bundle.resultVersion, registry.resultVersion);
  assert.equal(bundle.scorer.reportSha256, registry.initialReportSha256);
  const expected = { deepseek: 30, mimo: 29.444444444444443, kimi: 19.444444444444443, "gpt6-astra": 48.333333333333336 };
  for (const model of bundle.models) assert.ok(Math.abs(model.scores.composite - expected[model.id]) < 1e-9);
  assert.deepEqual(bundle.models.map(model => model.answered), [25, 25, 22, 25]);
  assert.equal(bundle.episodes.length, 20);
  assert.equal(new Set(bundle.episodes.map(row => row.video.id)).size, 20);
  assert.equal(bundle.episodes.filter(row => row.video.hasMotion).length, 16);
  assert.equal(bundle.episodes.find(row => row.modelId === "kimi" && row.layoutId === 124).scores.composite, null);
  assert.equal(bundle.episodes.find(row => row.modelId === "gpt6-astra" && row.layoutId === 136).provenance.attempt, "independent-attempt");
  assert.equal(bundle.models.find(row => row.id === "mimo").responseModel.includes("M3"), false);
  assert.doesNotMatch(JSON.stringify(bundle), /\/(?:bh|mnt|Users)\//);
});

test("pinned source and media bytes detect real content and size drift", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "t1-pin-test-"));
  try {
    const file = path.join(directory, "evidence.bin");
    const bytes = Buffer.from("sealed");
    await writeFile(file, bytes);
    assert.deepEqual(await readPinned(file, sha256(bytes), bytes.length), bytes);
    await assert.rejects(readPinned(file, sha256(bytes), bytes.length + 1), /byte count/);
    await writeFile(file, "tamper");
    await assert.rejects(readPinned(file, sha256(bytes), bytes.length), /SHA-256 drift/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
