#!/usr/bin/env node
// Build the Overview images from published media and the manuscript's own figures.
//
//   node scripts/capture-overview-media.mjs --site http://127.0.0.1:4176 --paper /path/to/overleaf_repo
//
// --site must serve a static build that contains /static-media/datasets-simulation/ (the pinned
// snapshot). Needs macOS (qlmanage rasterizes the figure PDFs) and Google Chrome (frames are read
// from the published clips and re-encoded as WebP in a headless page).
//
// Writes public/overview/{tasks,conditions,figures}/ and app/data/generated/overview-media.json,
// which records every image's source and SHA-256. Nothing is drawn or retouched by hand.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const option = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
const site = option("--site");
const paper = option("--paper") && path.resolve(option("--paper"));
if (!site || !paper) throw new Error("usage: --site <static build URL> --paper <manuscript repo>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "overview");
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

// The wide front-camera clip of each task (all three clips are training episodes; the others
// are head-camera views). Index into the task's clips sorted by file name.
const WIDE_CLIP = {
  arrange_largest_number: 2, build_tower: 1, classify_objects_by_language: 1, clear_keyboard_then_close_laptop: 1,
  cover_blocks: 2, find_category_outlier: 0, fold_clothes: 0, hang_mugs: 0, hold_button_until_cue: 1,
  hold_water_mug: 2, imitate_sorting_sequence: 2, insert_key: 1, match_and_pick_from_conveyor: 2,
  mirror_pair_layout: 1, pack_mixed_objects_into_box_v1: 1, place_between_references: 1, play_stacking_toy: 2,
  pour_liquid_into_cup: 0, press_by_number: 1, push_T: 0, set_button_colors: 2, solve_equation: 1,
  stack_bowls: 2, store_tools_in_toolbox: 0,
};
const FRAME_AT = 0.04; // fraction of the clip: the opening layout, before the arms move in
// The work area of the wide view, as fractions of the frame (keeps 4:3, trims arms and base).
const TASK_CROP = { x: 0.125, y: 0.16, w: 0.75, h: 0.75 };

// Figure 3 (case conditions): its editable deck embeds the simulation row (Store tools) as
// image1–20 and the real-robot row (towel folding) as image21–40, four frames per condition
// in ID, V, S, B, REC order. The first frame of each condition shows its starting layout.
const CONDITIONS = ["ID", "V", "S", "B", "REC"];
const CONDITION_DECK = "figures/editable/RoboExam-Case-Conditions-Compact.pptx";
const conditionImage = (domain, index) => {
  const n = (domain === "real" ? 20 : 0) + index * 4 + 1;
  return `ppt/media/image${n === 1 ? "" : n}.jpeg`; // the deck names its first image "image.jpeg"
};

const FIGURES = { tracks: "figures/roboexam_overview.pdf", hybrid: "figures/roboexam_pipeline.pdf" };

const tmp = await mkdtemp(path.join(os.tmpdir(), "overview-media-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9334", `--user-data-dir=${path.join(tmp, "profile")}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try { page = (await (await fetch("http://127.0.0.1:9334/json/list")).json()).find((t) => t.type === "page"); } catch { /* Chrome is still starting */ }
    if (!page) await sleep(200);
  }
  if (!page) throw new Error("Chrome did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.forEach((fn) => fn(msg));
  });
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails).slice(0, 400));
    return result.result.result.value;
  };
  await send("Page.enable");
  const loaded = new Promise((r) => events.push((m) => m.method === "Page.loadEventFired" && r()));
  await send("Page.navigate", { url: site });
  await loaded;
  // Encodes an image or a video frame (same origin, so the canvas stays readable) as WebP.
  const encode = (src, { time = null, width = null, quality = 0.84, crop = null } = {}) => evaluate(`(async () => {
    const src = ${JSON.stringify(src)};
    let el;
    if (${time === null}) {
      el = new Image(); el.src = src; await el.decode();
    } else {
      el = document.createElement('video'); el.muted = true; el.preload = 'auto'; el.src = src;
      await new Promise((ok, fail) => { el.onloadeddata = ok; el.onerror = () => fail(new Error('load ' + src)); });
      el.currentTime = el.duration * ${time ?? 0};
      await new Promise((ok) => { el.onseeked = ok; });
    }
    const fw = el.videoWidth || el.naturalWidth, fh = el.videoHeight || el.naturalHeight;
    const crop = ${JSON.stringify(crop)} ?? { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(fw * crop.x), sy = Math.round(fh * crop.y), w0 = Math.round(fw * crop.w), h0 = Math.round(fh * crop.h);
    const w = ${width ?? "w0"} < w0 ? ${width ?? "w0"} : w0, h = Math.round(h0 * w / w0);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(el, sx, sy, w0, h0, 0, 0, w, h);
    return { width: w, height: h, data: canvas.toDataURL('image/webp', ${quality}).split(',')[1] };
  })()`);
  // Local files are read through the page as data URLs.
  const dataUrl = async (file, type) => `data:${type};base64,${(await readFile(file)).toString("base64")}`;

  const manifest = { generatedBy: "scripts/capture-overview-media.mjs", tasks: {}, conditions: {}, figures: {} };

  // ---------------------------------------------------------------- task frames
  const clipDir = path.join(root, "dist", "client", "static-media", "datasets-simulation");
  const clips = {};
  for (const file of (await readdir(clipDir)).sort()) (clips[file.split("-training-")[0]] ??= []).push(file);
  await mkdir(path.join(out, "tasks"), { recursive: true });
  for (const [task, index] of Object.entries(WIDE_CLIP)) {
    const file = clips[task]?.[index];
    if (!file) throw new Error(`no clip ${index} for ${task}`);
    const frame = await encode(`/static-media/datasets-simulation/${file}`, { time: FRAME_AT, crop: TASK_CROP });
    const bytes = Buffer.from(frame.data, "base64");
    await writeFile(path.join(out, "tasks", `${task}.webp`), bytes);
    manifest.tasks[task] = { image: `/overview/tasks/${task}.webp`, width: frame.width, height: frame.height, sha256: sha(bytes),
      clip: `/static-media/datasets-simulation/${file}`, frameAt: FRAME_AT, crop: TASK_CROP };
  }

  // ---------------------------------------------------------------- condition frames
  execFileSync("unzip", ["-q", "-o", path.join(paper, CONDITION_DECK), "ppt/media/*", "-d", tmp]);
  await mkdir(path.join(out, "conditions"), { recursive: true });
  const deckSha = sha(await readFile(path.join(paper, CONDITION_DECK)));
  for (const domain of ["sim", "real"]) {
    for (const [index, condition] of CONDITIONS.entries()) {
      const member = conditionImage(domain, index);
      const source = path.join(tmp, member);
      const frame = await encode(await dataUrl(source, "image/jpeg"), { width: 640 });
      const bytes = Buffer.from(frame.data, "base64");
      const name = `${domain}-${condition.toLowerCase()}.webp`;
      await writeFile(path.join(out, "conditions", name), bytes);
      manifest.conditions[`${domain}:${condition}`] = { image: `/overview/conditions/${name}`, width: frame.width, height: frame.height, sha256: sha(bytes),
        source: `${CONDITION_DECK}#${member}`, sourceSha256: sha(await readFile(source)), deckSha256: deckSha };
    }
  }

  // ---------------------------------------------------------------- manuscript figures
  await mkdir(path.join(out, "figures"), { recursive: true });
  for (const [key, rel] of Object.entries(FIGURES)) {
    const pdf = path.join(paper, rel);
    execFileSync("qlmanage", ["-t", "-s", "2880", "-o", tmp, pdf], { stdio: "ignore" });
    const png = path.join(tmp, `${path.basename(rel)}.png`);
    const frame = await encode(await dataUrl(png, "image/png"), { quality: 0.9 });
    const bytes = Buffer.from(frame.data, "base64");
    await writeFile(path.join(out, "figures", `${key}.webp`), bytes);
    manifest.figures[key] = { image: `/overview/figures/${key}.webp`, width: frame.width, height: frame.height, sha256: sha(bytes),
      source: rel, sourceSha256: sha(await readFile(pdf)) };
  }

  await writeFile(path.join(root, "app", "data", "generated", "overview-media.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`wrote ${Object.keys(manifest.tasks).length} task frames, ${Object.keys(manifest.conditions).length} condition frames, ${Object.keys(manifest.figures).length} figures`);
  ws.close();
} finally {
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await exited;
  await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
