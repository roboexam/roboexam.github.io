import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t1UnibenchRegistry as registry } from "./t1-unibench-registry.mjs";

// Validates the pinned Track 1 UniBench-24 publication (built by AgentBench
// scripts/publish_unibench_t1.py) and copies it into app/data/generated.
// Pure projection: no grading, model call or simulator call happens here.

const SPLITS = ["ID", "V", "S", "B", "REC"];
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,160}$/;
const SHA = /^[a-f0-9]{64}$/;
const PRIVATE = /(?:\/(?:mnt|bh|Users|root|home|tmp|private)\/|file:\/\/|https?:\/\/|data:image\/|\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|["']?(?:api[_-]?key|authorization)["']?\s*[:=]|<\/?think\b)/i;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const close = (a, b) => Math.abs(a - b) < 1e-6;

function score(value, label) {
  if (value === null || value === undefined) return;
  assert.ok(typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 100, `${label} out of range`);
}

function publicSafe(value, label) {
  if (typeof value === "string") {
    if (value.startsWith("/api/t1-unibench-media/")) { assert.match(value.slice(23), ID, `${label} media id`); return; }
    assert.doesNotMatch(value, PRIVATE, `${label} contains a private path, endpoint or credential`);
  } else if (Array.isArray(value)) value.forEach((item, index) => publicSafe(item, `${label}[${index}]`));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) publicSafe(item, `${label}.${key}`);
}

function mean(values) {
  const present = values.filter((v) => v !== null && v !== undefined);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

/** Validate the public board and its per-episode VQA against each other. */
export function validateUnibench(results, vqa) {
  assert.equal(results.schemaVersion, "roboexam.t1-unibench-results.v1");
  assert.equal(results.resultVersion, registry.resultVersion);
  assert.deepEqual(results.splits.map((s) => s.id), SPLITS);
  const tasks = new Set(results.tasks.map((t) => t.id));
  assert.equal(tasks.size, results.tasks.length);
  const models = new Map();
  for (const model of results.models) {
    assert.match(model.id, ID); assert.ok(!models.has(model.id), "duplicate model"); models.set(model.id, model);
    for (const split of SPLITS) {
      const m = model.splits[split];
      if (m === null) { assert.ok(!model.splitsPresent.includes(split)); continue; }
      assert.ok(model.splitsPresent.includes(split));
      for (const key of ["score", "subtask", "success", "vqa", "a", "b", "c1", "c2", "c3", "scoreGain"]) score(m[key], `${model.id} ${split} ${key}`);
      assert.ok(Number.isSafeInteger(m.tasks) && m.tasks > 0 && Number.isSafeInteger(m.cases) && m.cases >= m.tasks);
      assert.equal(Object.keys(m.perTask).length, m.tasks, `${model.id} ${split} task count`);
      for (const task of Object.keys(m.perTask)) assert.ok(tasks.has(task), `unknown task ${task}`);
      // Tasks are equally weighted inside a split.
      assert.ok(close(m.subtask, mean(Object.values(m.perTask).map((t) => t.subtask))), `${model.id} ${split} subtask aggregate`);
      if (split === "REC") assert.equal(m.vqa, null, "recovery has no VQA");
      else if (m.vqa !== null) assert.ok(close(m.score, 0.7 * m.subtask + 0.3 * m.vqa), `${model.id} ${split} split score`);
    }
    if (model.overall) {
      assert.equal(model.splitsPresent.length, SPLITS.length, "overall needs all five settings");
      const sub = mean(SPLITS.map((s) => model.splits[s].subtask));
      const vqa = mean(SPLITS.filter((s) => s !== "REC").map((s) => model.splits[s].vqa));
      assert.ok(close(model.overall.subtask, sub) && close(model.overall.vqa, vqa), `${model.id} overall components`);
      assert.ok(close(model.overall.overall, 0.7 * sub + 0.3 * vqa), `${model.id} overall formula`);
    }
  }
  const episodes = new Map();
  for (const episode of results.episodes) {
    assert.match(episode.id, ID); assert.ok(!episodes.has(episode.id), "duplicate episode"); episodes.set(episode.id, episode);
    assert.ok(models.has(episode.modelId) && tasks.has(episode.taskId) && SPLITS.includes(episode.split));
    for (const video of [episode.video, episode.replayVideo]) {
      if (video === null) continue;
      assert.match(video.id, ID); assert.equal(video.url, `/api/t1-unibench-media/${video.id}`);
      assert.match(video.sha256, SHA); assert.ok(Number.isSafeInteger(video.bytes) && video.bytes > 0);
    }
    score(episode.execution.subtask, `${episode.id} subtask`);
    assert.equal(typeof episode.execution.success, "boolean");
  }
  assert.equal(vqa.schemaVersion, "roboexam.t1-unibench-vqa.v1");
  assert.equal(vqa.resultVersion, results.resultVersion);
  const seen = new Set();
  for (const row of vqa.episodes) {
    const episode = episodes.get(row.episodeId);
    assert.ok(episode && !seen.has(row.episodeId), `VQA for unknown or duplicate episode ${row.episodeId}`); seen.add(row.episodeId);
    assert.equal(row.modelId, episode.modelId); assert.equal(row.split, episode.split); assert.equal(row.taskId, episode.taskId);
    for (const q of row.initial) {
      assert.ok(typeof q.question === "string" && q.question.length > 0);
      assert.ok(["scored", "policy_zero", "not_graded"].includes(q.status));
      score(q.score, `${row.episodeId} ${q.questionId}`);
    }
  }
  assert.equal(seen.size, episodes.size, "every episode has a VQA record");
  publicSafe(results, "results"); publicSafe(vqa, "vqa");
  return { results, vqa };
}

export async function loadPinned(root = process.env.T1_UNIBENCH_SOURCE_ROOT || registry.publicationRoot) {
  const out = {};
  for (const [name, digest] of Object.entries(registry.sourcePins)) {
    const bytes = await readFile(path.join(root, name));
    assert.equal(sha256(bytes), digest, `source SHA-256 drift: ${name}`);
    out[name] = JSON.parse(bytes.toString("utf8"));
  }
  return validateUnibench(out["t1-unibench-results.json"], out["t1-unibench-vqa.json"]);
}

async function main() {
  const check = process.argv.includes("--check");
  const generated = new URL("../app/data/generated/", import.meta.url);
  const targets = { results: new URL("t1-unibench-results.json", generated), vqa: new URL("t1-unibench-vqa.json", generated) };
  if (check && !process.env.T1_UNIBENCH_SOURCE_ROOT) {
    // The release gate validates the committed bundle itself; the formal source is re-read when reachable.
    const results = JSON.parse(await readFile(targets.results, "utf8"));
    const vqa = JSON.parse(await readFile(targets.vqa, "utf8"));
    validateUnibench(results, vqa);
    for (const [name, digest] of Object.entries(registry.generatedPins)) {
      assert.equal(sha256(await readFile(new URL(name, generated))), digest, `generated bundle drift: ${name}`);
    }
    console.log("Track 1 UniBench bundle matches its pinned publication.");
    return;
  }
  const { results, vqa } = await loadPinned();
  const text = { results: JSON.stringify(results) + "\n", vqa: JSON.stringify(vqa) + "\n" };
  if (check) {
    for (const key of ["results", "vqa"]) assert.equal(await readFile(targets[key], "utf8"), text[key], `stale ${key} bundle`);
    console.log("Track 1 UniBench bundle matches the formal publication.");
  } else {
    for (const key of ["results", "vqa"]) await writeFile(targets[key], text[key]);
    console.log(`Published Track 1 UniBench ${results.resultVersion}: ${results.models.length} models, ${results.episodes.length} episodes.`);
    console.log(JSON.stringify(Object.fromEntries(Object.entries(targets).map(([k, v]) => [path.basename(fileURLToPath(v)), sha256(Buffer.from(text[k]))]))));
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
