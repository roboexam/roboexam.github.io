import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { constants } from "node:fs";
import { open, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import type {
  RealDatasetCatalog,
  RealDatasetEntries,
  RealDatasetEpisode,
  RealDatasetSummary,
  RealEpisodeEntry,
} from "./real-datasets";
import { parseMediaRange } from "./media-range.ts";
import {
  extractRealActionTrace,
  type RealTraceExtractor,
  type RealTraceInput,
  type RealTraceResult,
} from "./real-action-trace.server.ts";

type RootSpec = {
  id: string; kind: "robot" | "ego"; root: string;
  label?: string; sourceGroup?: string; indexFile?: string;
};
type Json = Record<string, unknown>;
type EpisodeRow = Record<string, unknown>;
type DatasetRef = RealDatasetSummary & {
  root: string; metadataDir: string; infoPath: string; metadataSha256: string;
  rows?: EpisodeRow[]; rowSha256?: string; format: "lerobot-v3" | "lerobot-v2";
  camerasInternal: string[]; videoPath: string; dataPath: string; chunksSize: number;
};
type MediaRef = { physical: string; root: string; bytes: number; identity: string; sha256: string };
type TraceRef = { physical: string; root: string; bytes: number; identity: string; input: RealTraceInput };
type MetadataReader = (dataset: DatasetRef) => Promise<{ rows: EpisodeRow[]; metadataSha256?: string }>;

const execFile = promisify(execFileCallback);
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === "string" ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const int = (value: unknown) => number(value) !== null && Number.isSafeInteger(value) ? Number(value) : null;
const within = (root: string, file: string) => file === root || file.startsWith(root + path.sep);
const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const safeName = (value: string) => value.length > 0 && value.length <= 512 && !value.split(/[\\/]/).some(part => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_.:@+\-\u4e00-\u9fff ]+$/.test(part));
const cameraLabel = (key: string) => {
  const name = key.split(".").at(-1) ?? key;
  return ({ cam_high: "Front / high", cam_left_wrist: "Left wrist", cam_right_wrist: "Right wrist" } as Record<string, string>)[name] ?? name;
};

function pythonCandidates() {
  return [...new Set([
    process.env.DASHBOARD_REAL_DATA_PYTHON,
    process.env.UNIBENCH_TRACE_PYTHON,
    "/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_raw_action_traces/v1/python/bin/python",
    "python3",
  ].filter((value): value is string => !!value))];
}

async function pyarrowRows(dataset: DatasetRef) {
  const source = String.raw`import json, os, sys
import pyarrow.parquet as pq
root=sys.argv[1]; fmt=sys.argv[2]
if fmt == "lerobot-v3":
  info=json.load(open(os.path.join(root,"meta","info.json")))
  files=[]
  for base, _, names in os.walk(os.path.join(root,"meta","episodes")):
    for name in names:
      p=os.path.join(base,name)
      if os.path.isfile(p) and name.endswith(".parquet"): files.append(p)
  files.sort()
  if not files: raise RuntimeError("episodes_missing")
  keys=[k for k in info.get("features",{}) if k.startswith("camera_observations.color_images.") or k.startswith("observation.images.")]
  keys=[k for k in keys if k.split(".")[-1] not in ("timestamp","is_intervene")]
  cols=["episode_index","length","tasks","platform_episode_id","data/chunk_index","data/file_index","dataset_from_index","dataset_to_index"]
  for key in keys:
    for suffix in ("chunk_index","file_index","from_timestamp","to_timestamp"):
      cols.append("videos/"+key+"/"+suffix)
  pf=pq.ParquetDataset(files)
  actual=set(pf.schema.names); cols=[c for c in cols if c in actual]
  rows=[]
  for row in pf.read(columns=cols).to_pylist(): rows.append(row)
else:
  rows=[]
  with open(os.path.join(root,"meta","episodes.jsonl"),encoding="utf-8") as fh:
    for line in fh:
      if line.strip(): rows.append(json.loads(line))
print(json.dumps({"rows":rows},ensure_ascii=False,separators=(",",":")))`;
  let lastError: unknown;
  for (const python of pythonCandidates()) {
    try {
      const result = await execFile(python, ["-c", source, dataset.metadataDir.replace(/[/\\]meta$/, ""), dataset.format], { maxBuffer: 256 * 1024 * 1024 });
      const parsed = JSON.parse(result.stdout) as { rows?: unknown };
      if (!Array.isArray(parsed.rows)) throw new Error("metadata_rows");
      return parsed.rows.filter((row): row is EpisodeRow => row !== null && typeof row === "object" && !Array.isArray(row));
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("metadata_unavailable");
}

function rowValue(row: EpisodeRow, key: string) { return row[key]; }
function rowVideo(dataset: DatasetRef, row: EpisodeRow, camera: string) {
  const index = int(row.episode_index); if (index === null || !safeName(camera)) return null;
  if (dataset.format === "lerobot-v3") {
    const prefix = `videos/${camera}/`;
    const chunk = int(rowValue(row, prefix + "chunk_index"));
    const file = int(rowValue(row, prefix + "file_index"));
    const start = number(rowValue(row, prefix + "from_timestamp"));
    const end = number(rowValue(row, prefix + "to_timestamp"));
    if (chunk === null || file === null || chunk < 0 || file < 0 || start === null || end === null || end <= start || start < 0) return null;
    const relative = path.join("videos", camera, `chunk-${String(chunk).padStart(3, "0")}`, `file-${String(file).padStart(3, "0")}.mp4`);
    return { relative, start, end };
  }
  const relative = path.join("videos", "chunk-000", camera, `episode_${String(index).padStart(6, "0")}.mp4`);
  return { relative, start: 0, end: null as number | null };
}

function summaryFrom(info: Json, spec: RootSpec, id: string, name: string, format: DatasetRef["format"], infoPath: string, metadataDir: string, metadataSha256: string): DatasetRef {
  const features = object(info.features);
  const cameraKeys = Object.keys(features).filter(key => format === "lerobot-v3"
    ? (key.startsWith("camera_observations.color_images.") || key.startsWith("observation.images.")) &&
      !key.endsWith(".timestamp") && !key.endsWith(".is_intervene")
    : key.startsWith("observation.images."));
  const cameras = [...new Set(cameraKeys)].map(key => ({ key, label: cameraLabel(key) }));
  const fps = number(info.fps) ?? 0;
  const episodeCount = int(info.total_episodes) ?? 0;
  const frameCount = int(info.total_frames) ?? 0;
  const videoPath = text(info.video_path) ?? "";
  const dataPath = text(info.data_path) ?? "";
  const chunksSize = int(info.chunks_size) ?? 1000;
  const summary: DatasetRef = { id, name, kind: spec.kind, format, robotType: text(info.robot_type) ?? (spec.kind === "ego" ? "pico_ego" : "unknown"),
    taskCount: int(info.total_tasks) ?? 0, episodeCount: Math.max(0, episodeCount), frameCount: Math.max(0, frameCount), fps: fps > 0 ? fps : 0,
    cameras, availability: "available", warnings: [], root: spec.root, metadataDir, infoPath, metadataSha256,
    sourceGroup: spec.sourceGroup, camerasInternal: cameras.map(camera => camera.key), videoPath, dataPath,
    chunksSize: chunksSize > 0 ? chunksSize : 1000 };
  return summary;
}
function publicSummary(ref: DatasetRef): RealDatasetSummary {
  return { id: ref.id, name: ref.name, kind: ref.kind, format: ref.format, robotType: ref.robotType,
    taskCount: ref.taskCount, episodeCount: ref.episodeCount, frameCount: ref.frameCount, fps: ref.fps,
    cameras: ref.cameras, availability: ref.availability, warnings: ref.warnings,
    sourceGroup: ref.sourceGroup, relativePath: ref.relativePath };
}

export function createRealDatasetReader({
  roots = [
    { id: "lerobot_data_v3", kind: "robot", root: "/mnt/public_ckp/UniEmbodied-Bench/real/lerobot_data_v3" },
    { id: "tk_pico", kind: "ego", root: "/mnt/public_ckp/UniEmbodied-Bench/real/tk_pico" },
  ], refreshMs = 30000, readMetadata, traceExtractor = extractRealActionTrace, routePrefix = "real-datasets",
  schemaVersion = "roboexam.real-datasets.v1",
}: { roots?: RootSpec[]; refreshMs?: number; readMetadata?: MetadataReader; traceExtractor?: RealTraceExtractor;
  routePrefix?: string; schemaVersion?: RealDatasetCatalog["schemaVersion"] } = {}) {
  if (!/^[a-z0-9-]+$/.test(routePrefix)) throw new Error("invalid_route_prefix");
  const datasetRefs = new Map<string, DatasetRef>();
  const episodeRefs = new Map<string, { ref: DatasetRef; entry: RealEpisodeEntry }>();
  const mediaRefs = new Map<string, MediaRef>();
  const traceRefs = new Map<string, TraceRef>();
  const traceCache = new Map<string, RealTraceResult>();
  const pendingTraces = new Map<string, Promise<RealTraceResult>>();
  let catalogSnapshot: RealDatasetCatalog | undefined;
  let expires = 0;
  let pending: Promise<RealDatasetCatalog> | undefined;
  const mountWarnings = new Set<string>();
  const approvedRoots = roots.map(spec => ({ ...spec, root: path.resolve(spec.root) }));

  async function resolve(root: string, relative: string) {
    const base = await realpath(root);
    const physical = await realpath(path.resolve(root, relative));
    if (!within(base, physical)) throw new Error("outside_allowlist");
    return physical;
  }
  async function resolveMetadata(root: string, candidate: string) {
    const base = await realpath(root);
    const physical = await realpath(candidate);
    if (!within(base, physical)) throw new Error("metadata_outside_allowlist");
    return physical;
  }
  async function discover(spec: RootSpec): Promise<DatasetRef[]> {
    const configuredRoot = path.resolve(spec.root);
    const compatibilityRoot = configuredRoot.replace("/mnt/public_ckp/UniEmbodied-Bench/real", "/media/datasets/UniEmbodied-Bench/real");
    let root = configuredRoot;
    try { await stat(root); }
    catch {
      try { await stat(compatibilityRoot); root = compatibilityRoot; mountWarnings.add(`${spec.id}: 使用兼容数据挂载点`); }
      catch { mountWarnings.add(`${spec.id}: 数据挂载不可用`); return []; }
    }
    const found: DatasetRef[] = [];
    async function add(infoPath: string, metadataDir: string, format: DatasetRef["format"], name: string) {
      try {
        const physicalRoot = await realpath(root);
        const physicalMetadataDir = await resolveMetadata(physicalRoot, metadataDir);
        const physicalInfoPath = await resolveMetadata(physicalRoot, infoPath);
        if (!within(physicalMetadataDir, path.dirname(physicalInfoPath))) throw new Error("metadata_info_mismatch");
        const bytes = await readFile(physicalInfoPath);
        const info = JSON.parse(bytes.toString("utf8")) as Json;
        const relative = path.relative(physicalRoot, path.dirname(physicalMetadataDir));
        const id = digest(`${routePrefix}-dataset:${spec.id}:${relative}`);
        const datasetRoot = path.dirname(physicalMetadataDir);
        const displayName = spec.label && !relative ? spec.label : name;
        const ref = summaryFrom(info, { ...spec, root: datasetRoot }, id, displayName, format, physicalInfoPath, physicalMetadataDir, digest(bytes));
        ref.relativePath = relative || ".";
        found.push(ref);
      } catch { /* malformed entries are reported by the catalog as unavailable only when no valid entries exist */ }
    }
    if (spec.indexFile) {
      if (!safeName(spec.indexFile)) return [];
      try {
        const indexPath = await resolveMetadata(await realpath(root), path.join(root, spec.indexFile));
        const index = object(JSON.parse((await readFile(indexPath)).toString("utf8")));
        const groups = Array.isArray(index.groups) ? index.groups : [];
        for (const item of groups) {
          const relative = text(object(item).path);
          if (!relative || !safeName(relative)) continue;
          const metadataDir = path.join(root, relative, "meta");
          await add(path.join(metadataDir, "info.json"), metadataDir, "lerobot-v3", relative.split("/").join(" · "));
        }
        return found;
      } catch { return []; }
    }
    if (spec.kind === "ego") {
      const children = (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a,b) => natural(a.name,b.name));
      for (const child of children) {
        const metadataDir = path.join(root, child.name, "delivery", "meta");
        const infoPath = path.join(metadataDir, "info.json");
        try { await stat(infoPath); await add(infoPath, metadataDir, "lerobot-v2", child.name); } catch { /* skip incomplete delivery */ }
      }
      return found;
    }
    async function walk(dir: string, depth: number) {
      if (depth > 8) return;
      let children; try { children = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const child of children.sort((a,b) => natural(a.name,b.name))) {
        if (child.name.startsWith(".") || child.name.startsWith("_")) continue;
        const candidate = path.join(dir, child.name);
        if (child.isDirectory()) {
          if (child.name === "meta") {
            const infoPath = path.join(candidate, "info.json");
            const relative = path.relative(root, dir);
            const name = relative ? relative.split(path.sep).join(" · ") : (spec.label ?? spec.id);
            try { await stat(infoPath); await add(infoPath, candidate, "lerobot-v3", name); } catch { await walk(candidate, depth + 1); }
          } else await walk(candidate, depth + 1);
        }
      }
    }
    await walk(root, 0); return found;
  }
  async function validateMetadataFiles(ref: DatasetRef) {
    const metadataRoot = await realpath(ref.metadataDir);
    const check = async (file: string) => {
      const physical = await realpath(file);
      if (!within(metadataRoot, physical)) throw new Error("metadata_file_outside_allowlist");
      const info = await stat(physical);
      if (!info.isFile()) throw new Error("metadata_file_not_regular");
    };
    if (ref.format === "lerobot-v2") {
      try { await check(path.join(metadataRoot, "episodes.jsonl")); } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      }
      return;
    }
    const episodesRoot = path.join(metadataRoot, "episodes");
    let physicalEpisodesRoot: string;
    try { physicalEpisodesRoot = await realpath(episodesRoot); }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
      throw error;
    }
    if (!within(metadataRoot, physicalEpisodesRoot)) throw new Error("metadata_file_outside_allowlist");
    async function walkMetadata(dir: string) {
      let children;
      try { children = await readdir(dir, { withFileTypes: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
        throw error;
      }
      for (const child of children) {
        const candidate = path.join(dir, child.name);
        if (child.isDirectory()) await walkMetadata(candidate);
        else if (child.isFile() || child.isSymbolicLink()) await check(candidate);
      }
    }
    await walkMetadata(physicalEpisodesRoot);
  }
  async function scan() {
    mountWarnings.clear();
    const refs = (await Promise.all(approvedRoots.map(spec => discover(spec)))).flat();
    refs.sort((a,b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    datasetRefs.clear(); episodeRefs.clear(); for (const ref of refs) datasetRefs.set(ref.id, ref);
    const datasets: RealDatasetSummary[] = refs.map(publicSummary);
    const version = digest(JSON.stringify(datasets));
    const catalog: RealDatasetCatalog = { schemaVersion, version, scannedAt: new Date().toISOString(), refreshSeconds: refreshMs / 1000, datasets, warnings: [...mountWarnings] };
    catalogSnapshot = catalog; expires = Date.now() + refreshMs; return catalog;
  }
  async function catalog(force = false) {
    if (!force && catalogSnapshot && Date.now() < expires) return catalogSnapshot;
    pending ??= scan().finally(() => { pending = undefined; });
    return pending;
  }
  async function loadRows(ref: DatasetRef) {
    if (ref.rows) return ref.rows;
    await validateMetadataFiles(ref);
    const loaded = readMetadata ? await readMetadata(ref) : { rows: await pyarrowRows(ref) };
    if (!Array.isArray(loaded.rows)) throw new Error("metadata_rows");
    ref.rows = loaded.rows; ref.rowSha256 = digest(JSON.stringify(loaded.rows));
    return ref.rows;
  }
  async function entriesFor(ref: DatasetRef): Promise<RealEpisodeEntry[]> {
    const rows = await loadRows(ref);
    return rows.map((row) => {
      const index = int(row.episode_index); if (index === null || index < 0) throw new Error("episode_index");
      const frames = int(row.length) ?? 0;
      const windows = ref.camerasInternal.map(camera => rowVideo(ref, row, camera)).filter(Boolean) as {start:number;end:number|null}[];
      const duration = windows.length && windows.every(window => window.end !== null)
        ? Math.max(...windows.map(window => (window.end as number) - window.start))
        : (ref.fps > 0 ? frames / ref.fps : 0);
      const tasks = Array.isArray(row.tasks) ? row.tasks : [];
      return { id: digest(`${routePrefix}-episode:${ref.id}:${index}`), index, name: `episode_${String(index).padStart(6, "0")}`, frames: Math.max(0, frames), durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
        instruction: text(tasks[0]) ?? "未记录 instruction", originalEpisodeId: text(row.platform_episode_id) };
    });
  }
  async function dataset(id: string): Promise<RealDatasetEntries | null> {
    await catalog(); const ref = datasetRefs.get(id); if (!ref) return null;
    const episodes = await entriesFor(ref);
    for (const entry of episodes) episodeRefs.set(entry.id, { ref, entry });
    return { dataset: publicSummary(ref), version: ref.rowSha256 ?? ref.metadataSha256, episodes };
  }
  function traceRelative(ref: DatasetRef, row: EpisodeRow, entry: RealEpisodeEntry) {
    if (!ref.dataPath.endsWith(".parquet")) return null;
    if (ref.format === "lerobot-v3") {
      const chunk = int(rowValue(row, "data/chunk_index"));
      const file = int(rowValue(row, "data/file_index"));
      if (chunk === null || file === null || chunk < 0 || file < 0) return null;
      return path.join("data", `chunk-${String(chunk).padStart(3, "0")}`, `file-${String(file).padStart(3, "0")}.parquet`);
    }
    const chunk = Math.floor(entry.index / ref.chunksSize);
    return path.join("data", `chunk-${String(chunk).padStart(3, "0")}`, `episode_${String(entry.index).padStart(6, "0")}.parquet`);
  }
  async function bindTrace(ref: DatasetRef, row: EpisodeRow, entry: RealEpisodeEntry, durationSeconds: number) {
    const relative = traceRelative(ref, row, entry);
    if (!relative) return { unavailable: "action_metadata_missing" } as const;
    try {
      const physical = await resolve(ref.root, relative);
      const info = await stat(physical);
      if (!info.isFile() || info.size <= 0) throw new Error("not_file");
      const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
      const manifestSha256 = ref.rowSha256 ?? ref.metadataSha256;
      const bindingSha256 = digest(JSON.stringify([ref.id, entry.id, relative, identity, manifestSha256]));
      const input: RealTraceInput = {
        format: ref.format, datasetKind: ref.kind, datasetId: ref.id, episodeId: entry.id,
        episodeIndex: entry.index, manifestSha256, bindingSha256, sourceFrames: entry.frames, durationSeconds,
      };
      traceRefs.set(bindingSha256, { physical, root: ref.root, bytes: info.size, identity, input });
      return { url: `/api/${routePrefix}-trace?id=${bindingSha256}`, bindingSha256, manifestSha256 } as const;
    } catch {
      return { unavailable: "trajectory_missing" } as const;
    }
  }
  async function episode(id: string): Promise<RealDatasetEpisode | null> {
    await catalog();
    const known = episodeRefs.get(id);
    const candidates = known ? [known] : (await Promise.all([...datasetRefs.values()].map(async ref => {
      const entry = (await entriesFor(ref)).find(item => item.id === id); return entry ? { ref, entry } : null;
    }))).filter((value): value is { ref: DatasetRef; entry: RealEpisodeEntry } => value !== null);
    for (const { ref, entry } of candidates) {
      const media: RealDatasetEpisode["media"] = []; const warnings: string[] = [];
      const row = (ref.rows ?? []).find(candidate => int(candidate.episode_index) === entry.index); if (!row) return null;
      for (const camera of ref.camerasInternal) {
        const video = rowVideo(ref, row, camera); if (!video) { warnings.push(`${camera}: missing episode video window`); continue; }
        try {
          const physical = await resolve(ref.root, video.relative); const info = await stat(physical);
          if (!info.isFile() || info.size <= 0) throw new Error("not_file");
          const bytes = info.size; const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
          const sha = digest(`${routePrefix}-media:${ref.id}:${entry.index}:${camera}:${video.relative}`);
          mediaRefs.set(sha, { physical, root: ref.root, bytes, identity, sha256: sha });
          const end = video.end ?? (video.start + entry.durationSeconds);
          media.push({ id: sha, camera, label: cameraLabel(camera), url: `/api/${routePrefix}-media?id=${sha}`, startSeconds: video.start, endSeconds: end, durationSeconds: Math.max(0, end - video.start) });
        } catch { warnings.push(`${camera}: file unavailable or outside approved root`); }
      }
      const duration = media.length ? Math.min(...media.map(item => item.durationSeconds)) : entry.durationSeconds;
      const trace = await bindTrace(ref, row, entry, duration);
      return { ...entry, datasetId: ref.id, metadataSha256: ref.metadataSha256, media, trace, warnings };
    }
    return null;
  }
  async function actionTrace(id: string): Promise<RealTraceResult | null> {
    const ref = traceRefs.get(id);
    if (!ref) return null;
    const currentDataset = datasetRefs.get(ref.input.datasetId);
    if (!currentDataset ||
      (currentDataset.rowSha256 ?? currentDataset.metadataSha256) !== ref.input.manifestSha256)
      return { status: "unavailable", reason: "source_changed" };
    let handle;
    try {
      const candidate = await resolve(ref.root, path.relative(ref.root, ref.physical));
      handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
      if (!info.isFile() || info.size !== ref.bytes || identity !== ref.identity)
        return { status: "unavailable", reason: "source_changed" };
      const cached = traceCache.get(id);
      if (cached) return cached;
      const inFlight = pendingTraces.get(id);
      if (inFlight) return await inFlight;
      const promise = (async (): Promise<RealTraceResult> => {
        const result = await traceExtractor(handle!.fd, ref.input);
        const after = await stat(candidate);
        const afterIdentity = [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs].join(":");
        const handleAfter = await handle!.stat();
        const handleIdentity = [handleAfter.dev, handleAfter.ino, handleAfter.size, handleAfter.mtimeMs, handleAfter.ctimeMs].join(":");
        if (await resolve(ref.root, path.relative(ref.root, ref.physical)) !== candidate ||
          !after.isFile() || afterIdentity !== ref.identity || handleIdentity !== ref.identity)
          return { status: "unavailable", reason: "source_changed" };
        if (result.status === "available") {
          if (traceCache.size >= 128) traceCache.delete(traceCache.keys().next().value!);
          traceCache.set(id, result);
        }
        return result;
      })();
      pendingTraces.set(id, promise);
      try { return await promise; } finally { pendingTraces.delete(id); }
    } catch {
      return { status: "unavailable", reason: "trajectory_unavailable" };
    } finally {
      await handle?.close();
    }
  }
  async function serveMedia(request: Request, head = false) {
    const params = new URL(request.url).searchParams; const id = params.get("id") ?? "";
    if (!/^[a-f0-9]{64}$/.test(id) || params.getAll("id").length !== 1 || [...params.keys()].some(key => key !== "id")) return new Response(null, { status: 404 });
    const ref = mediaRefs.get(id); if (!ref) return new Response(null, { status: 404 });
    let handle; try {
      const candidate = await resolve(ref.root, path.relative(ref.root, ref.physical));
      handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW); const info = await handle.stat();
      const identity = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
      if (!info.isFile() || info.size !== ref.bytes || identity !== ref.identity) { await handle.close(); return new Response(null, { status: 410 }); }
    } catch { if (handle) await handle.close(); return new Response(null, { status: 404 }); }
    const range = parseMediaRange(request.headers.get("range"), ref.bytes); if (range === undefined) { await handle.close(); return new Response(null, { status: 416, headers: { "content-range": `bytes */${ref.bytes}`, "accept-ranges": "bytes" } }); }
    const { start, end } = range ?? { start: 0, end: ref.bytes - 1 };
    const headers = new Headers({ "content-type": "video/mp4", "content-length": String(end - start + 1), "accept-ranges": "bytes", "content-disposition": "inline", "cache-control": "private, no-store", etag: `"${ref.sha256}"` });
    if (range) headers.set("content-range", `bytes ${start}-${end}/${ref.bytes}`);
    if (head) { await handle.close(); return new Response(null, { status: range ? 206 : 200, headers }); }
    return new Response(Readable.toWeb(handle.createReadStream({ start, end, autoClose: true })) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  }
  return { catalog, dataset, episode, actionTrace, serveMedia };
}

export const realDatasets = createRealDatasetReader();
