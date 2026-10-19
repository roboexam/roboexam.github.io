import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);
const OUTPUT_ROOT =
  process.env.UNIBENCH_VIDEO_RENDITION_ROOT ??
  "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-video-renditions/v1";
const CATALOG_PATH = "app/data/generated/video-renditions.json";
const PROFILE = {
  id: "web-360p-v1",
  label: "360p",
  maxHeight: 360,
  maxFps: 25,
  codec: "h264",
  crf: 29,
  preset: "veryfast",
  fastStart: true,
};
const ROOTS = {
  curated:
    process.env.UNIBENCH_CURATED_ROOT ??
    "/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data",
  ood:
    process.env.UNIBENCH_OOD_STAGING_ROOT ??
    "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation",
  staging:
    process.env.UNIBENCH_REVIEW_MEDIA_ROOT ??
    "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation",
  "review-cache":
    "/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_review_media/v1",
};
const INDEXES = [
  { file: "app/data/generated/curated-media.json", defaultRoot: "curated" },
  { file: "app/data/generated/ood-media.json", defaultRoot: "ood" },
  { file: "app/data/generated/review-media.json", defaultRoot: "staging" },
];
let physicalOutputRoot;

function argument(name, fallback) {
  const position = process.argv.indexOf(name);
  return position === -1 ? fallback : process.argv[position + 1];
}

const jobs = Number(argument("--jobs", String(Math.min(8, Math.max(1, Math.floor(os.availableParallelism() / 8))))));
const limit = Number(argument("--limit", "0"));
assert.ok(Number.isSafeInteger(jobs) && jobs > 0 && jobs <= 32, "--jobs must be between 1 and 32");
assert.ok(Number.isSafeInteger(limit) && limit >= 0, "--limit must be a non-negative integer");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const ratio = (value) => {
  const [numerator, denominator = "1"] = String(value).split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : 0;
};
const rounded = (value) => Number(Number(value).toFixed(6));
const safeRelativePath = (value) => {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0 && !path.isAbsolute(value));
  assert.ok(value.split(/[\\/]/).every((part) => part && part !== "." && part !== ".."));
  return value;
};

async function sha256(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

async function probe(file) {
  const { stdout } = await execFile(
    "/usr/bin/ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate:format=duration",
      "-of",
      "json",
      file,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const document = JSON.parse(stdout);
  const stream = document.streams?.[0];
  assert.ok(stream, `video stream missing: ${file}`);
  const duration = Number(document.format?.duration);
  const fps = ratio(stream.avg_frame_rate);
  assert.ok(Number.isSafeInteger(stream.width) && stream.width > 0);
  assert.ok(Number.isSafeInteger(stream.height) && stream.height > 0);
  assert.ok(Number.isFinite(duration) && duration > 0);
  assert.ok(Number.isFinite(fps) && fps > 0);
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    fps: rounded(fps),
    duration: rounded(duration),
  };
}

async function atomicWrite(file, value) {
  const bytes = `${JSON.stringify(value)}\n`;
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, bytes);
  await rename(temporary, file);
}

async function loadSources() {
  const physicalRoots = Object.fromEntries(
    await Promise.all(
      Object.entries(ROOTS).map(async ([id, root]) => [id, await realpath(root)]),
    ),
  );
  const sources = new Map();
  for (const { file, defaultRoot } of INDEXES) {
    const index = await readJson(file);
    for (const [sourceSha256, reference] of Object.entries(index)) {
      assert.match(sourceSha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(reference.bytes) && reference.bytes > 0);
      const rootId = reference.rootId ?? defaultRoot;
      const root = physicalRoots[rootId];
      assert.ok(root, `unknown media root: ${rootId}`);
      const relativePath = safeRelativePath(reference.relativePath);
      const physicalPath = await realpath(path.join(root, relativePath));
      assert.ok(physicalPath.startsWith(`${root}${path.sep}`), `media escaped root: ${relativePath}`);
      const info = await stat(physicalPath);
      assert.ok(info.isFile() && info.size === reference.bytes, `source size mismatch: ${physicalPath}`);
      const previous = sources.get(sourceSha256);
      if (previous) {
        assert.equal(previous.bytes, reference.bytes, `inconsistent source bytes: ${sourceSha256}`);
      } else {
        sources.set(sourceSha256, {
          sha256: sourceSha256,
          bytes: reference.bytes,
          physicalPath,
        });
      }
    }
  }
  return sources;
}

async function loadExisting() {
  try {
    const catalog = await readJson(CATALOG_PATH);
    assert.equal(catalog.schemaVersion, "unibench.dashboard-video-renditions.v1");
    assert.deepEqual(catalog.profile, PROFILE);
    return catalog.items ?? {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function validExisting(source, item) {
  if (
    !item ||
    item.sourceBytes !== source.bytes ||
    item.relativePath !== `${PROFILE.id}/${source.sha256}.mp4` ||
    !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes <= 0
  ) {
    return false;
  }
  try {
    const file = await realpath(path.join(physicalOutputRoot, safeRelativePath(item.relativePath)));
    if (!file.startsWith(`${physicalOutputRoot}${path.sep}`)) return false;
    const info = await stat(file);
    return info.isFile() && info.size === item.bytes;
  } catch {
    return false;
  }
}

async function transcode(source) {
  const sourceProbe = await probe(source.physicalPath);
  const targetHeight = Math.min(PROFILE.maxHeight, sourceProbe.height);
  const targetWidth = Math.max(
    2,
    Math.round((sourceProbe.width * targetHeight) / sourceProbe.height / 2) * 2,
  );
  const targetFps = Math.min(PROFILE.maxFps, sourceProbe.fps);
  const relativePath = `${PROFILE.id}/${source.sha256}.mp4`;
  const destination = path.join(OUTPUT_ROOT, relativePath);
  const temporary = `${destination}.${process.pid}.tmp.mp4`;
  await mkdir(path.dirname(destination), { recursive: true });
  await execFile(
    "/usr/bin/ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      source.physicalPath,
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      `scale=${targetWidth}:${targetHeight}:flags=lanczos,fps=${targetFps}`,
      "-c:v",
      "libx264",
      "-preset",
      PROFILE.preset,
      "-crf",
      String(PROFILE.crf),
      "-maxrate",
      "700k",
      "-bufsize",
      "1400k",
      "-g",
      String(Math.max(1, Math.round(targetFps * 2))),
      "-keyint_min",
      String(Math.max(1, Math.round(targetFps))),
      "-sc_threshold",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-threads",
      "2",
      temporary,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const renditionProbe = await probe(temporary);
  assert.equal(renditionProbe.codec, PROFILE.codec);
  assert.equal(renditionProbe.width, targetWidth);
  assert.equal(renditionProbe.height, targetHeight);
  assert.ok(renditionProbe.fps <= PROFILE.maxFps + 0.01);
  assert.ok(
    Math.abs(renditionProbe.duration - sourceProbe.duration) <= Math.max(0.25, 2 / sourceProbe.fps),
    `duration drift for ${source.sha256}: ${sourceProbe.duration} -> ${renditionProbe.duration}`,
  );
  const info = await stat(temporary);
  const renditionSha256 = await sha256(temporary);
  await rename(temporary, destination);
  return {
    sourceBytes: source.bytes,
    sourceWidth: sourceProbe.width,
    sourceHeight: sourceProbe.height,
    sourceFps: sourceProbe.fps,
    sourceDuration: sourceProbe.duration,
    sha256: renditionSha256,
    bytes: info.size,
    width: renditionProbe.width,
    height: renditionProbe.height,
    fps: renditionProbe.fps,
    duration: renditionProbe.duration,
    relativePath,
  };
}

const sources = await loadSources();
if (process.env.UNIBENCH_VIDEO_RENDITION_ROOT === undefined) {
  await execFile("/usr/bin/python3", [
    "/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py",
    "validate",
    "generated_dataset",
    OUTPUT_ROOT,
  ]);
}
await mkdir(path.join(OUTPUT_ROOT, PROFILE.id), { recursive: true });
physicalOutputRoot = await realpath(OUTPUT_ROOT);

const existing = await loadExisting();
const items = {};
const pending = [];
for (const source of [...sources.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))) {
  if (await validExisting(source, existing[source.sha256])) {
    items[source.sha256] = existing[source.sha256];
  } else {
    pending.push(source);
  }
}
const queue = limit > 0 ? pending.slice(0, limit) : pending;
console.log(
  `Video renditions: ${sources.size} sources, ${Object.keys(items).length} reusable, ` +
    `${queue.length}${limit > 0 && pending.length > limit ? `/${pending.length}` : ""} queued, ${jobs} workers.`,
);

let cursor = 0;
let completed = 0;
let checkpoint = Promise.resolve();
function catalog() {
  const orderedItems = Object.fromEntries(
    Object.entries(items).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    schemaVersion: "unibench.dashboard-video-renditions.v1",
    profile: PROFILE,
    sourceCount: Object.keys(orderedItems).length,
    sourceBytes: Object.values(orderedItems).reduce((sum, item) => sum + item.sourceBytes, 0),
    renditionBytes: Object.values(orderedItems).reduce((sum, item) => sum + item.bytes, 0),
    items: orderedItems,
  };
}
function saveCheckpoint() {
  checkpoint = checkpoint.then(() => atomicWrite(CATALOG_PATH, catalog()));
  return checkpoint;
}
async function worker() {
  while (cursor < queue.length) {
    const index = cursor++;
    const source = queue[index];
    items[source.sha256] = await transcode(source);
    completed += 1;
    if (completed % 25 === 0 || completed === queue.length) {
      await saveCheckpoint();
    }
    if (completed % 100 === 0 || completed === queue.length) {
      const saved = Object.values(items).reduce((sum, item) => sum + item.bytes, 0);
      console.log(`Completed ${completed}/${queue.length}; ${Math.round(saved / 1024 / 1024)} MiB published.`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, queue.length)) }, () => worker()));
await saveCheckpoint();
await checkpoint;

const result = catalog();
console.log(
  `Published ${result.sourceCount} ${PROFILE.label} renditions: ` +
    `${Math.round(result.sourceBytes / 1024 / 1024)} MiB source -> ` +
    `${Math.round(result.renditionBytes / 1024 / 1024)} MiB playback.`,
);
