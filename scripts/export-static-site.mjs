#!/usr/bin/env node
// Snapshot a running dashboard for the GitHub Pages build.
//
//   node --experimental-strip-types scripts/export-static-site.mjs --base http://127.0.0.1:3297 \
//     --data <dashboard>/app/data/generated --out <dir> [--plan]
//
// Writes <out>/static-api/<endpoint>/<key>.json (the answer to every data request the static pages
// make, named by app/static-site.ts) and <out>/media-plan.json (the curated clip sample). --plan stops
// after measuring the sample; without it the clips are downloaded to <out>/raw/. Transcoding and the
// manifest are done by scripts/build-static-media.sh.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { canonicalRequest, staticKey } from "../app/static-site.ts";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]?.startsWith("--") || all[index + 1] === undefined ? true : all[index + 1]]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3297";
const dataDir = path.resolve(args.data ?? "app/data/generated");
const out = path.resolve(args.out ?? "static-export");
const json = async (file) => JSON.parse(await readFile(path.join(dataDir, file), "utf8"));

const written = new Map(); // key → canonical request, to catch collisions
let failures = 0;

async function request(url, attempt = 1) {
  try {
    const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(120_000) });
    return response;
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    return request(url, attempt + 1);
  }
}

/** Fetch a data request and store its answer where dataUrl() looks for it. Returns the body, or null. */
async function snapshot(url, transform = (body) => body, { optional = false } = {}) {
  const response = await request(url);
  if (!response.ok) {
    if (!optional) { failures += 1; console.error(`! ${response.status} ${url}`); }
    return null;
  }
  const body = transform(await response.json());
  const key = staticKey(url);
  const canonical = canonicalRequest(url);
  if (written.has(key) && written.get(key) !== canonical) throw new Error(`key collision: ${canonical} / ${written.get(key)}`);
  written.set(key, canonical);
  const endpoint = canonical.split(/[/?]/)[2];
  await mkdir(path.join(out, "static-api", endpoint), { recursive: true });
  await writeFile(path.join(out, "static-api", endpoint, `${key}.json`), JSON.stringify(body));
  return body;
}

async function inBatches(items, size, run) {
  const results = [];
  for (let index = 0; index < items.length; index += size) results.push(...await Promise.all(items.slice(index, index + size).map(run)));
  return results;
}

// ------------------------------------------------------------------ clip sample
const plan = [];
const planned = new Set();
/** Add a clip to the sample. `file` is where it lands under public/static-media. */
function clip(group, url, file, { transcode = true } = {}) {
  if (!url) return false;
  const canonical = canonicalRequest(url);
  if (planned.has(canonical)) return true;
  planned.add(canonical);
  plan.push({ group, url: canonical, file, transcode });
  return true;
}
const safe = (value) => String(value).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

// ------------------------------------------------------------------ data endpoints
console.log("· T2 current results");
await snapshot("/api/acwm600-results");

console.log("· T1 VQA details");
const t1 = await json("t1-unibench-results.json");
await inBatches(t1.episodes, 16, (episode) => snapshot(`/api/t1-unibench-vqa/${encodeURIComponent(episode.id)}`, undefined, { optional: true }));

console.log("· T3 policy-baseline cohorts");
const policyFiles = ["g05", "hyvla", "xvla", "pi05", "opendm"];
const settingKey = { id: "id", visual: "visual", semantic: "semantic", behavioral: "behavior", recovery: "recovery" };
const policyCohorts = new Map(); // `${model}:${task}:${setting}` → samples
for (const name of policyFiles) {
  const bundle = await json(`policy-baselines-${name}.json`);
  for (const [model, settings] of Object.entries(bundle.models)) {
    const requests = [];
    for (const [setting, key] of Object.entries(settingKey)) {
      for (const task of Object.keys(settings[key] ?? {})) requests.push({ model, task, setting });
    }
    await inBatches(requests, 16, async ({ model, task, setting }) => {
      const body = await snapshot(`/api/policy-baseline-results/${encodeURIComponent(model)}/${encodeURIComponent(task)}?setting=${encodeURIComponent(setting)}`);
      if (body) policyCohorts.set(`${model}:${task}:${setting}`, body.samples);
    });
  }
}

// Datasets: the catalog, plus a few sample episodes per group with their clips and action traces.
const datasetSample = Number(args["dataset-episodes"] ?? 1);
async function datasetEpisodes(prefix, query, group, label, count = datasetSample) {
  const entries = await request(`/api/${prefix}${query}`).then((response) => response.ok ? response.json() : null);
  if (!entries) { failures += 1; console.error(`! ${prefix}${query}`); return; }
  const kept = [];
  for (const row of entries.episodes) {
    if (kept.length >= count) break;
    const episode = await snapshot(`/api/${prefix}?episode=${encodeURIComponent(row.id)}`, (body) => body, { optional: true });
    if (!episode?.media?.length) continue;
    const fast = episode.media.every((view) => view.renditionUrl);
    for (const view of episode.media) clip(group, fast ? view.renditionUrl : view.url, `${group}/${safe(label)}-${safe(row.id)}-${safe(view.id)}.mp4`, { transcode: !fast });
    if (episode.trace && "url" in episode.trace) await snapshot(episode.trace.url, (body) => body, { optional: true });
    kept.push(row);
  }
  // the entries list the static site serves is the sample, not the full group
  await snapshot(`/api/${prefix}${query}`, () => ({ ...entries, episodes: kept }));
}

console.log("· Datasets: Real & Ego");
const real = await snapshot("/api/real-datasets");
for (const dataset of real?.datasets ?? []) {
  if (dataset.availability === "available") await datasetEpisodes("real-datasets", `?dataset=${encodeURIComponent(dataset.id)}`, "datasets-real", dataset.id);
}

console.log("· Datasets: Simulation");
const simulation = await snapshot("/api/simulation-datasets");
for (const task of simulation?.simulationTasks ?? []) {
  // every group answers (with its count), but only the Training group carries sample episodes
  for (const split of task.splits) {
    const dataset = simulation.datasets.find((row) => row.id === split.datasetId);
    if (dataset?.availability !== "available") continue;
    await datasetEpisodes("simulation-datasets", `?dataset=${encodeURIComponent(dataset.id)}&task=${encodeURIComponent(task.id)}`,
      "datasets-simulation", `${task.id}-${split.id}`, split.id === "training" ? datasetSample : 0);
  }
}

// ------------------------------------------------------------------ evaluation clips
// Home page: every hero and demo clip (already web-sized).
for (const file of new Set(JSON.stringify([await json("home-demos.json"), await json("hero-wall.json")]).match(/"file":"[^"]+"/g)?.map((entry) => entry.slice(8, -1)))) {
  clip("home", `/api/home-demo-media/${file}`, `home-demos/${file}`, { transcode: false });
}

// T1: every model's five ID rollouts of the task the viewer opens on.
const t1Task = t1.episodes.find((episode) => episode.modelId === t1.models[0].id && episode.split === "ID")?.taskId;
for (const episode of t1.episodes) {
  if (episode.split === "ID" && episode.taskId === t1Task && episode.video) clip("t1", episode.video.url, `t1/${safe(episode.id)}.mp4`);
}

// T2 historical evidence: the first two samples per world model, prediction and ground truth.
const acwm = await json("acwm-results.json");
for (const [model, result] of Object.entries(acwm.models)) {
  for (const sample of result.samples.filter((item) => item.media).slice(0, 2)) {
    clip("t2", sample.media.prediction.url, `t2/${safe(model)}-${path.basename(sample.media.prediction.url)}`);
    clip("t2", sample.media.groundTruth.url, `t2/${safe(model)}-${path.basename(sample.media.groundTruth.url)}`);
  }
}

// T3: the first stack_bowls ID sample per policy (head camera), and the first WAM walkthrough sample.
for (const [cohort, samples] of policyCohorts) {
  const [model, task, setting] = cohort.split(":");
  if (task !== "stack_bowls" || setting !== "id") continue;
  const video = samples[0]?.videos.find((item) => item.camera === "cam_head");
  clip("t3", video?.url, `t3/${safe(model)}-${task}-${setting}-${safe(samples[0]?.sourceEpisode)}-head.mp4`);
}
const wam = await json("vla-wam-samples.json");
for (const [model, result] of Object.entries(wam.models)) {
  const sample = result.samples[0];
  clip("t3", sample?.media?.url, `t3/${safe(model)}-${path.basename(sample?.media?.url ?? "")}`);
}

// ------------------------------------------------------------------ sizes and download
await inBatches(plan, 8, async (item) => {
  const response = await request(item.url).catch(() => null);
  item.bytes = Number(response?.headers.get("content-length") ?? 0) || null;
  item.status = response?.status ?? 0;
  await response?.body?.cancel();
});
const groups = {};
for (const item of plan) {
  const group = groups[item.group] ??= { clips: 0, bytes: 0, missing: 0 };
  group.clips += 1; group.bytes += item.bytes ?? 0; if (item.status !== 200) group.missing += 1;
}
console.table(Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, { ...group, MB: +(group.bytes / 1e6).toFixed(1) }])));
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "media-plan.json"), JSON.stringify(plan, null, 2));
console.log(`${written.size} data snapshots · ${plan.length} clips · ${failures} failed requests`);

if (!args.plan) {
  await inBatches(plan.filter((item) => item.status === 200), 4, async (item) => {
    const target = path.join(out, "raw", item.file);
    await mkdir(path.dirname(target), { recursive: true });
    const response = await request(item.url);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  });
  console.log("clips downloaded to", path.join(out, "raw"));
}
if (failures) process.exitCode = 1;
