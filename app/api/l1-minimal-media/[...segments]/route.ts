import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

type RouteContext = { params: Promise<{ segments: string[] }> };

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  end = Math.min(end, size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return undefined;
  return { start, end };
}

async function resolveMedia(segments: string[]) {
  const isEpisodeVideo = segments.length === 3 && segments[2].endsWith(".mp4");
  const isSampleImage = segments.length === 2 && segments[0] === "samples" && segments[1].endsWith(".png");
  if ((!isEpisodeVideo && !isSampleImage) || segments.some((segment) => !/^[a-zA-Z0-9_.-]+$/.test(segment) || segment === "." || segment === "..")) return null;
  const root = await realpath(path.join(process.cwd(), "public", "l1-minimal-media"));
  const candidate = await realpath(path.join(root, ...segments));
  if (!candidate.startsWith(`${root}${path.sep}`)) return null;
  const info = await stat(candidate);
  return info.isFile() ? { candidate, size: info.size, contentType: isEpisodeVideo ? "video/mp4" : "image/png" } : null;
}

async function serve(request: Request, context: RouteContext, headOnly: boolean) {
  let media: Awaited<ReturnType<typeof resolveMedia>> = null;
  try { media = await resolveMedia((await context.params).segments); } catch { media = null; }
  if (!media) return new Response(null, { status: 404 });
  const requested = parseRange(request.headers.get("range"), media.size);
  if (requested === undefined) return new Response(null, { status: 416, headers: { "accept-ranges": "bytes", "content-range": `bytes */${media.size}` } });
  const range = requested ?? { start: 0, end: media.size - 1 };
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-length": String(range.end - range.start + 1),
    "content-type": media.contentType,
  });
  if (requested) headers.set("content-range", `bytes ${range.start}-${range.end}/${media.size}`);
  const body = headOnly ? null : Readable.toWeb(createReadStream(media.candidate, range)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: requested ? 206 : 200, headers });
}

export async function GET(request: Request, context: RouteContext) { return serve(request, context, false); }
export async function HEAD(request: Request, context: RouteContext) { return serve(request, context, true); }
