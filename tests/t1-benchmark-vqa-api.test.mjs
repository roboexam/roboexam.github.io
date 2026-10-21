import assert from "node:assert/strict";
import { before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const id = "fixture-v1-deepseek-push_T-layout100000";
const hash = (letter) => letter.repeat(64);
const formal = {
  schemaVersion: "roboexam.t1-benchmark-results.v1", resultVersion: "fixture-v1",
  provenance: { sourceHashes: { initial: hash("a"), process: hash("b") } },
  episodes: [
    { id, modelId: "deepseek", taskId: "push_T", layoutId: 100000, attempt: "attempt_02" },
    { id: "old-v1-kimi-stack_bowls-layout124", resultVersion: "old-v1", modelId: "kimi", taskId: "stack_bowls", layoutId: 124, attempt: "attempt_01" },
  ],
};
const episode = {
  episodeId: id, resultVersion: "fixture-v1", modelId: "deepseek", taskId: "push_T", layoutId: 100000, attempt: "attempt_02",
  initial: [
    { questionId: "push_T.revised.positions", metricId: "a2", question: "Where is the T block?\nReturn JSON.", response: "", score: 0, status: "scored", formatCompliant: false },
    { questionId: "push_T.revised.relation", metricId: "b1", question: "Which direction?", response: null, score: null, status: "not_graded", formatCompliant: null },
  ],
  checkpoints: [
    { slotId: "push_T/100000/NATIVE_SUCCESS", stageId: "NATIVE_SUCCESS", status: "scored", questionId: "q_return", question: "What is complete, and what is the next action?", response: '{"completed":["NATIVE_SUCCESS"],"next_action":null}', triggerStep: 158, returnStep: 192, scores: { c2: 50, c3: 100 } },
    { slotId: "push_T/100000/LATER_STAGE", stageId: "LATER_STAGE", status: "not_reached", questionId: null, question: null, response: null, triggerStep: null, returnStep: null, scores: { c2: 0, c3: 0 } },
  ],
};
const fixture = () => ({ schemaVersion: "roboexam.t1-benchmark-vqa.v1", resultVersion: "fixture-v1", sourceHashes: { ...formal.provenance.sourceHashes, vqaDetails: hash("c") }, episodes: [structuredClone(episode)] });

async function loadFixture(bundle = fixture(), results = formal) {
  // Alias both JSON imports in memory. A missing in-progress production detail
  // file never requires writing fake data into app/data/generated.
  const compiled = await build({
    stdin: { contents: 'export { createT1BenchmarkVqaStore } from "./app/data/t1-benchmark-vqa.server.ts"; export { GET } from "./app/api/t1-benchmark-vqa/[id]/route.ts";', resolveDir: root, sourcefile: "vqa-api-fixture.ts", loader: "ts" },
    bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "safe-vqa-fixtures", setup(builder) {
      builder.onResolve({ filter: /generated\/t1-benchmark-vqa\.json$/ }, () => ({ path: "vqa", namespace: "fixture" }));
      builder.onResolve({ filter: /generated\/t1-benchmark-results\.json$/ }, () => ({ path: "formal", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: JSON.stringify(args.path === "vqa" ? bundle : results), loader: "json" }));
    } }],
  });
  return import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
}

let subject;
before(async () => { subject = await loadFixture(); });
const request = (identifier) => new Request("https://dashboard.example/api/t1-benchmark-vqa/" + encodeURIComponent(identifier));
const context = (identifier) => ({ params: Promise.resolve({ id: identifier }) });

test("GET returns a direct exact episode record and preserves empty answers, nullable grades and checkpoint timing", async () => {
  const response = await subject.GET(request(id), context(id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), episode);
  const store = subject.createT1BenchmarkVqaStore(fixture(), formal);
  assert.equal(store.getEpisode(id).initial[0].response, "");
  assert.equal(store.getEpisode(id).initial[1].score, null);
  assert.equal(store.getEpisode(id).checkpoints[0].returnStep, 192);
  assert.equal(store.getEpisode(id).checkpoints[1].status, "not_reached");
});

test("unknown, legacy without details and filesystem-shaped IDs return empty 404", async () => {
  for (const identifier of ["unknown", formal.episodes[1].id, "../context", "/mnt/private.json", "%2e%2e", "", id + "/extra"]) {
    const response = await subject.GET(request(identifier), context(identifier));
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
});

test("a separately versioned formal episode keeps its own version through the exact metadata join", () => {
  const legacy = formal.episodes[1], bundle = fixture();
  bundle.episodes.push({ episodeId: legacy.id, resultVersion: legacy.resultVersion, modelId: legacy.modelId, taskId: legacy.taskId, layoutId: legacy.layoutId, attempt: legacy.attempt, initial: [], checkpoints: [] });
  const store = subject.createT1BenchmarkVqaStore(bundle, formal);
  assert.equal(store.getEpisode(legacy.id).resultVersion, "old-v1");
});

test("extra detail provenance hashes are allowed while all formal source pins must match", () => {
  assert.ok(subject.createT1BenchmarkVqaStore(fixture(), formal));
  for (const mutate of [
    (bundle) => { bundle.sourceHashes.initial = hash("d"); },
    (bundle) => { delete bundle.sourceHashes.process; },
    (bundle) => { bundle.sourceHashes.vqaDetails = "bad"; },
    (bundle) => { bundle.resultVersion = "stale-v0"; },
  ]) {
    const bundle = fixture(); mutate(bundle);
    assert.throws(() => subject.createT1BenchmarkVqaStore(bundle, formal), /Invalid T1 VQA publication/);
  }
});

test("duplicates, unknown episodes and every inconsistent formal identity are rejected", () => {
  const changes = [
    (bundle) => { bundle.episodes.push(structuredClone(bundle.episodes[0])); },
    (bundle) => { bundle.episodes[0].episodeId = "unregistered"; },
    ...["modelId", "taskId", "attempt", "resultVersion"].map((field) => (bundle) => { bundle.episodes[0][field] = "wrong"; }),
    (bundle) => { bundle.episodes[0].layoutId = 100001; },
    (bundle) => { bundle.episodes[0].initial.push(structuredClone(bundle.episodes[0].initial[0])); },
    (bundle) => { bundle.episodes[0].checkpoints.push(structuredClone(bundle.episodes[0].checkpoints[0])); },
  ];
  for (const change of changes) {
    const bundle = fixture(); change(bundle);
    assert.throws(() => subject.createT1BenchmarkVqaStore(bundle, formal));
  }
  const duplicateFormal = structuredClone(formal); duplicateFormal.episodes.push(duplicateFormal.episodes[0]);
  assert.throws(() => subject.createT1BenchmarkVqaStore(fixture(), duplicateFormal));
});

test("finite 0–100 scores, status semantics and first-return timing are enforced without replacing nulls", () => {
  const changes = [
    (bundle) => { bundle.episodes[0].initial[0].score = NaN; },
    (bundle) => { bundle.episodes[0].initial[0].score = 101; },
    (bundle) => { bundle.episodes[0].initial[0].score = null; },
    (bundle) => { bundle.episodes[0].initial[1].score = 0; },
    (bundle) => { bundle.episodes[0].initial[1].response = "invented"; },
    (bundle) => { bundle.episodes[0].checkpoints[1].response = "invented"; },
    (bundle) => { bundle.episodes[0].checkpoints[1].scores.c2 = 1; },
    (bundle) => { bundle.episodes[0].checkpoints[0].scores.c3 = -1; },
    (bundle) => { bundle.episodes[0].checkpoints[0].triggerStep = 193; },
    (bundle) => { bundle.episodes[0].checkpoints[0].returnStep = 192.5; },
    (bundle) => { bundle.episodes[0].checkpoints[0].slotId = "other_task/100000/NATIVE_SUCCESS"; },
  ];
  for (const change of changes) {
    const bundle = fixture(); change(bundle);
    assert.throws(() => subject.createT1BenchmarkVqaStore(bundle, formal));
  }
});

test("multiple native events sharing one return retain consistent question/answer and may have distinct trigger steps", () => {
  const bundle = fixture(), shared = structuredClone(bundle.episodes[0].checkpoints[0]);
  shared.stageId = "SHARED_RETURN"; shared.slotId = "push_T/100000/SHARED_RETURN"; shared.triggerStep = 161;
  bundle.episodes[0].checkpoints.push(shared);
  assert.ok(subject.createT1BenchmarkVqaStore(bundle, formal));
  shared.response = "different first response";
  assert.throws(() => subject.createT1BenchmarkVqaStore(bundle, formal));
});

test("unknown/private fields and secrets or filesystem paths cannot enter the API publication", async () => {
  for (const change of [
    (bundle) => { bundle.episodes[0].context = []; },
    (bundle) => { bundle.episodes[0].initial[0].gold = "hidden"; },
    (bundle) => { bundle.episodes[0].checkpoints[0].rawResponse = {}; },
    (bundle) => { bundle.episodes[0].initial[0].response = "/bh/private/run/context.json"; },
    (bundle) => { bundle.episodes[0].initial[0].response = "sk-fixturesecretmustnotappear"; },
  ]) {
    const bundle = fixture(); change(bundle);
    assert.throws(() => subject.createT1BenchmarkVqaStore(bundle, formal));
  }
  const bad = fixture(); bad.episodes[0].initial[0].response = "sk-fixturesecretmustnotappear";
  const invalid = await loadFixture(bad);
  const response = await invalid.GET(request(id), context(id));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
});

test("validated store cannot be changed by mutating input or a returned record", () => {
  const bundle = fixture(), store = subject.createT1BenchmarkVqaStore(bundle, formal);
  bundle.episodes[0].initial[0].response = "later mutation";
  assert.equal(store.getEpisode(id).initial[0].response, "");
  assert.throws(() => { store.getEpisode(id).initial[0].response = "later mutation"; }, TypeError);
});

test("type-only client module contains no payload import and server/API never read files or use network", async () => {
  const types = await readFile(path.join(root, "app/data/t1-benchmark-vqa.ts"), "utf8");
  assert.doesNotMatch(types, /^\s*import\b|generated\//m);
  const server = await readFile(path.join(root, "app/data/t1-benchmark-vqa.server.ts"), "utf8");
  const route = await readFile(path.join(root, "app/api/t1-benchmark-vqa/[id]/route.ts"), "utf8");
  assert.doesNotMatch(server + route, /node:fs|node:http|\bfetch\s*\(|readFile|process\.env/);
});
