import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { RawCatalog, RawEntry, RawEpisode, RawTaskEntries } from "./raw-review.ts";
import { parseMediaRange } from "./media-range.ts";

const digest = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
const within = (root: string, file: string) => file === root || file.startsWith(root + path.sep);
const cameras = ["cam_head", "cam_left_wrist", "cam_right_wrist"] as const;
const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const text = (value: unknown): string | null => typeof value === "string" ? value.slice(0, 16000) : null;
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const fingerprint = (info: Awaited<ReturnType<typeof stat>>) =>
  [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
type LocatedEntry = RawEntry & { relative: string; taskId: string };
const mediaIdentity = (info: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint }) =>
  [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
type MediaRef = { relative: string; physical: string; fingerprint: string; bytes: number; contentSha256: string };
type Snapshot = { catalog: RawCatalog; entries: Map<string, LocatedEntry> };

/** Host-only reader. Request parameters are opaque IDs, never paths. No data writes. */
export function createRawReviewReader({
  root, approvedRoots = [root], refreshMs = 30000,
}: { root: string; approvedRoots?: string[]; refreshMs?: number }) {
  root = path.resolve(root);
  const approved = approvedRoots.map(value => path.resolve(value));
  let snapshot: Snapshot | undefined;
  let expires = 0;
  let pending: Promise<Snapshot> | undefined;
  const mediaRefs = new Map<string, MediaRef>();
  // Process-local receipts cannot survive a verifier revision. Every new/replaced
  // video is byte-hashed; unchanged videos require exact nanosecond identity.
  const receipts = new Map<string, string>();
  async function verifyVideo(relative: string, physical: string, expected: Json) {
    const handle = await open(physical, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.size <= BigInt(0) || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid_media");
      const identity = mediaIdentity(before);
      const bytes = Number(before.size);
      const expectedHash = text(expected.sha256);
      const expectedBytes = finite(expected.byte_size) ?? finite(expected.bytes);
      if (expectedBytes !== null && expectedBytes !== bytes) throw new Error("media_size_mismatch");
      const key = digest(physical + ":" + identity + ":" + (expectedHash ?? "unbound"));
      // Some shared filesystems have coarse timestamp resolution. Never reuse
      // a receipt for a file changed within the last two seconds.
      const settled = Math.max(Number(before.mtimeNs / BigInt(1000000)), Number(before.ctimeNs / BigInt(1000000))) < Date.now() - 2000;
      let hash = process.env.UNIBENCH_MEDIA_VERIFY_MODE === "full" || !settled ? undefined : receipts.get(key);
      if (!hash) {
        const hasher = createHash("sha256"); let read = 0;
        for await (const chunk of handle.createReadStream({ autoClose: false })) { hasher.update(chunk); read += chunk.length; }
        hash = hasher.digest("hex");
        if (read !== bytes) throw new Error("media_changed");
      }
      if (expectedHash && (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== hash)) throw new Error("media_hash_mismatch");
      if (mediaIdentity(await handle.stat({ bigint: true })) !== identity || await resolve(relative) !== physical ||
        mediaIdentity(await stat(physical, { bigint: true })) !== identity) throw new Error("media_changed");
      if (receipts.size > 20000) receipts.clear();
      receipts.set(key, hash);
      return { bytes, hash, identity };
    } finally { await handle.close(); }
  }

  async function resolve(relative: string) {
    const logical = path.resolve(root, relative);
    if (!within(root, logical)) throw new Error("outside_raw_root");
    const physical = await realpath(logical);
    if (!approved.some(base => within(base, physical))) throw new Error("unapproved_symlink");
    return physical;
  }
  async function scan(): Promise<Snapshot> {
    // Fail closed if the mount disappears; do not silently show a historical snapshot.
    await resolve("");
    const entries = new Map<string, LocatedEntry>();
    const warnings: string[] = [];
    let nodes = 0;
    const tasks: RawCatalog["tasks"] = [];
    const top = (await readdir(root, { withFileTypes: true })).sort((a, b) => natural(a.name, b.name));
    for (const task of top) {
      if (task.name.startsWith(".") || task.name.startsWith("_") || (!task.isDirectory() && !task.isSymbolicLink())) continue;
      const taskId = digest("task:" + task.name);
      const folders = new Map<string, { id: string; path: string; count: number }>();
      async function walk(relative: string, depth: number, ancestors: Set<string>) {
        if (++nodes > 50000 || depth > 12) throw new Error("raw_scan_limit_exceeded");
        let physical: string;
        try { physical = await resolve(relative); }
        catch { warnings.push(`${relative}：目录不可读或链接目标不在允许范围`); return; }
        if (ancestors.has(physical)) { warnings.push(`${relative}：跳过循环链接`); return; }
        let files;
        try { files = await readdir(physical, { withFileTypes: true }); }
        catch { warnings.push(`${relative}：目录不可读`); return; }
        files.sort((a, b) => natural(a.name, b.name));
        const leaf = files.some(file => /\.(mp4|hdf5|h5|parquet)$/i.test(file.name) || file.name === "episode_manifest.json") || /^episode[_-]/i.test(path.basename(relative));
        if (leaf) {
          const folderPath = path.relative(task.name, path.dirname(relative)) || ".";
          const folderId = digest(taskId + ":" + folderPath);
          const folder = folders.get(folderPath) ?? { id: folderId, path: folderPath, count: 0 };
          folder.count++; folders.set(folderPath, folder);
          const id = digest("episode:" + relative);
          entries.set(id, { id, taskId, relative, folderId, folder: folderPath, name: path.basename(relative) });
          return;
        }
        const folderPath = path.relative(task.name, relative) || ".";
        folders.set(folderPath, { id: digest(taskId + ":" + folderPath), path: folderPath, count: 0 });
        const next = new Set(ancestors).add(physical);
        for (const child of files) {
          if (child.name.startsWith(".") || child.name.startsWith("_")) continue;
          if (child.isDirectory() || child.isSymbolicLink()) {
            const candidate = path.join(relative, child.name);
            // File symlinks belong to a leaf; never recurse through unrelated files.
            try { if (!(await stat(await resolve(candidate))).isDirectory()) continue; }
            catch { warnings.push(`${candidate}：链接不可读`); continue; }
            await walk(candidate, depth + 1, next);
          }
        }
      }
      await walk(task.name, 0, new Set());
      const taskEntries = [...entries.values()].filter(row => row.taskId === taskId);
      const directFolders = [...folders.values()].filter(row => row.path !== ".");
      // Keep top-level empty categories; omit empty intermediate grouping nodes.
      const displayFolders = directFolders.filter(row => row.count > 0 || !directFolders.some(other => other.path.startsWith(row.path + path.sep)));
      if (folders.get(".")?.count) displayFolders.unshift(folders.get(".")!);
      tasks.push({ id: taskId, name: task.name, count: taskEntries.length, folders: displayFolders });
    }
    const version = digest(JSON.stringify({ tasks, entries: [...entries.keys()], warnings }));
    return { entries, catalog: { schemaVersion: "roboexam.raw-review.v1", version,
      scannedAt: new Date().toISOString(), refreshSeconds: refreshMs / 1000, tasks, count: entries.size, warnings } };
  }
  async function current() {
    if (snapshot && Date.now() < expires) return snapshot;
    if (!pending) pending = scan().then(value => {
      snapshot = value; expires = Date.now() + refreshMs; return value;
    }).finally(() => { pending = undefined; });
    return pending;
  }
  async function catalog() { return (await current()).catalog; }
  async function task(id: string): Promise<RawTaskEntries | null> {
    const state = await current();
    if (!state.catalog.tasks.some(item => item.id === id)) return null;
    return { taskId: id, version: state.catalog.version,
      entries: [...state.entries.values()].filter(row => row.taskId === id).map(({ id, name, folderId, folder }) => ({ id, name, folderId, folder })) };
  }
  async function episode(id: string): Promise<RawEpisode | null> {
    const entry = (await current()).entries.get(id);
    if (!entry) return null;
    const warnings: string[] = [];
    const directory = await resolve(entry.relative);
    const names = (await readdir(directory)).sort(natural);
    async function json(name: string): Promise<{ data: Json; hash: string } | null> {
      if (!names.includes(name)) return null;
      try {
        const file = await resolve(path.join(entry!.relative, name));
        const info = await stat(file);
        if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error("metadata_size");
        const bytes = await (await import("node:fs/promises")).readFile(file);
        const value: unknown = JSON.parse(bytes.toString("utf8"));
        if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("metadata_schema");
        return { data: object(value), hash: digest(bytes) };
      } catch { warnings.push(`${name} 无法解析或超出元数据大小限制`); return null; }
    }
    const manifest = await json("episode_manifest.json");
    const source = await json("SOURCE.json");
    const data = manifest?.data ?? source?.data ?? {};
    const provenance = object(data.source_provenance);
    const files: RawEpisode["files"] = [];
    const media: RawEpisode["media"] = [];
    const identities: string[] = [];
    const cameraNames = new Map(cameras.map(camera => [camera, names.filter(name => name === camera + ".mp4" || name.endsWith("_" + camera + ".mp4"))]));
    for (const name of names) {
      if (!/\.(mp4|hdf5|h5|parquet)$/i.test(name)) continue;
      try {
        const relative = path.join(entry.relative, name);
        const physical = await resolve(relative);
        const info = await stat(physical);
        if (!info.isFile()) continue;
        files.push({ name, bytes: info.size });
        identities.push(name + ":" + fingerprint(info));
        if (!name.endsWith(".mp4")) continue;
        const camera = cameras.find(camera => name === camera + ".mp4" || name.endsWith("_" + camera + ".mp4"));
        if (!camera) { warnings.push(`${name}：无法识别相机名称`); continue; }
        if (cameraNames.get(camera)!.length !== 1) { warnings.push(`${name}：${camera} 存在多份视频，未自动选择重复项`); continue; }
        const video = object(object(object(data.artifacts).videos)[camera]);
        const semantics = object(video.semantics);
        const official = object(object(data.videos)[camera]);
        const verified = await verifyVideo(relative, physical, Object.keys(video).length ? video : official);
        const key = digest(relative + ":" + physical + ":" + verified.identity + ":" + verified.hash);
        if (mediaRefs.size > 20000) mediaRefs.clear();
        mediaRefs.set(key, { relative, physical, fingerprint: verified.identity, bytes: verified.bytes, contentSha256: verified.hash });
        const duration = finite(semantics.duration_seconds) ?? Number(object(official.probe).duration ?? 0);
        media.push({ camera, contentSha256: verified.hash, url: `/api/raw-review-media?id=${key}`, duration: Number.isFinite(duration) && duration > 0 ? duration : 0 });
      } catch { warnings.push(`${name}：文件不可读、链接目标不在允许范围或视频摘要/大小不符`); }
    }
    if (media.length < 3) warnings.push(`可识别视频 ${media.length}/3 路；保留样本展示，不推定合格`);
    const recordedTask = text(data.task_name) ?? text(data.task_id) ?? text(data.task);
    const taskName = entry.relative.split(path.sep)[0];
    if (recordedTask && recordedTask !== taskName) warnings.push(`元数据任务 ${recordedTask} 与场景文件夹不一致`);
    const seed = finite(data.scene_seed) ?? finite(data.seed);
    const fidelity = object(object(data.execution).qualified_replay).fidelity_passed;
    return { id: entry.id, taskId: entry.taskId, name: entry.name, folderId: entry.folderId, folder: entry.folder,
      originalEpisodeId: text(data.episode_id), seed,
      manifestSha256: manifest?.hash ?? source?.hash ?? digest(identities.join("|")),
      reviewVersion: digest(JSON.stringify([manifest?.hash ?? source?.hash ?? identities, media.map(item => [item.camera, item.contentSha256])])),
      identityKind: manifest ? "manifest" : source ? "source" : "file_inventory",
      instruction: text(data.instruction) ?? text(provenance.instruction) ?? "未记录 instruction",
      sourceCommit: text(object(data.pipeline_source).commit) ?? text(object(data.source).commit),
      media, files, warnings, strongFidelity: typeof fidelity === "boolean" ? fidelity : null };
  }
  async function serveMedia(request: Request, head = false) {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[a-f0-9]{64}$/.test(id)) return new Response(null, { status: 404 });
    const ref = mediaRefs.get(id);
    if (!ref) return new Response(null, { status: 404 });
    let handle;
    try {
      if (await resolve(ref.relative) !== ref.physical) return new Response(null, { status: 410 });
      handle = await open(ref.physical, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat({ bigint: true });
      if (!info.isFile() || mediaIdentity(info) !== ref.fingerprint || info.size === BigInt(0)) {
        await handle.close(); return new Response(null, { status: 410 });
      }
      if (Math.max(Number(info.mtimeNs / BigInt(1000000)), Number(info.ctimeNs / BigInt(1000000))) >= Date.now() - 2000) {
        try { await verifyVideo(ref.relative, ref.physical, { sha256: ref.contentSha256, byte_size: ref.bytes }); }
        catch { await handle.close(); return new Response(null, { status: 410 }); }
      }
    } catch { if (handle) await handle.close(); return new Response(null, { status: 404 }); }
    const range = parseMediaRange(request.headers.get("range"), ref.bytes);
    if (range === undefined) {
      await handle.close();
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${ref.bytes}`, "accept-ranges": "bytes" } });
    }
    const { start, end } = range ?? { start: 0, end: ref.bytes - 1 };
    const headers = new Headers({ "content-type": "video/mp4", "content-length": String(end - start + 1),
      "accept-ranges": "bytes", "cache-control": "private, no-store", etag: `"${id}"` });
    if (range) headers.set("content-range", `bytes ${start}-${end}/${ref.bytes}`);
    if (head) { await handle.close(); return new Response(null, { status: range ? 206 : 200, headers }); }
    return new Response(Readable.toWeb(handle.createReadStream({ start, end, autoClose: true })) as ReadableStream<Uint8Array>,
      { status: range ? 206 : 200, headers });
  }
  return { catalog, task, episode, serveMedia };
}

export const rawReview = createRawReviewReader({
  root: process.env.DASHBOARD_RAW_ROOT ?? "/mnt/public_ckp/UniEmbodied-Bench/raw",
  approvedRoots: [process.env.DASHBOARD_RAW_ROOT ?? "/mnt/public_ckp/UniEmbodied-Bench/raw",
    "/mnt/public_ckp/UniEmbodied-Bench", "/mnt/gyc_ckp/benchmark2027/runtime/staging/robodojo_data_generation"],
});
