import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import index from "../../../data/generated/curated-media.json";
import { parseMediaRange } from "../../../data/media-range";

const ROOT = process.env.UNIBENCH_CURATED_ROOT ?? "/mnt/gyc_ckp/benchmark2027/data/episode/curated_simulation_data";
const allowlist: Record<string, { relativePath: string; bytes: number }> = index;
type Context = { params: Promise<{ segments: string[] }> };
async function serve(request: Request, context: Context, head: boolean) {
  const { segments } = await context.params;
  if (segments.length !== 1) return new Response(null, { status: 404 });
  const file = segments[0];
  if (!/^[a-f0-9]{64}\.mp4$/.test(file)) return new Response(null, { status: 404 });
  const ref = allowlist[file.slice(0, -4)];
  if (!ref) return new Response(null, { status: 404 });
  let candidate: string;
  try {
    const root = await realpath(ROOT);
    candidate = await realpath(path.join(root, ref.relativePath));
    if (!candidate.startsWith(root + path.sep)) return new Response(null, { status: 404 });
    const info = await stat(candidate);
    if (!info.isFile() || info.size !== ref.bytes) return new Response(null, { status: 410 });
  } catch { return new Response(null, { status: 404 }); }
  const range = parseMediaRange(request.headers.get("range"), ref.bytes);
  if (range === undefined) return new Response(null, { status: 416, headers: { "content-range": `bytes */${ref.bytes}`, "accept-ranges": "bytes" } });
  const { start, end } = range ?? { start: 0, end: ref.bytes - 1 };
  const headers = new Headers({ "content-type": "video/mp4", "content-length": String(end - start + 1),
    "accept-ranges": "bytes", "cache-control": "private, max-age=31536000, immutable", "etag": `"${file.slice(0, -4)}"` });
  if (range) headers.set("content-range", `bytes ${start}-${end}/${ref.bytes}`);
  return new Response(head ? null : Readable.toWeb(createReadStream(candidate, { start, end })) as ReadableStream<Uint8Array>,
    { status: range ? 206 : 200, headers });
}
export const GET = (request: Request, context: Context) => serve(request, context, false);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
