import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

type RouteContext = { params: Promise<{ segments: string[] }> };

function rangeNotSatisfiable(size: number) {
  return new Response(null, {
    status: 416,
    headers: { "accept-ranges": "bytes", "content-range": `bytes */${size}` },
  });
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return undefined;
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start >= size || end < start) return undefined;
  return { start, end };
}

async function resolveMedia(segments: string[]) {
  if (
    segments.length < 4 ||
    segments.some((segment) => !/^[a-zA-Z0-9_.-]+$/.test(segment) || segment === "." || segment === "..") ||
    !segments.at(-1)?.endsWith(".mp4")
  ) return null;

  const mediaRoot = await realpath(process.env.DASHBOARD_EPISODE_MEDIA_ROOT ?? path.join(process.cwd(), "public", "episode-media"));
  const candidate = await realpath(path.join(mediaRoot, ...segments));
  const rootPrefix = mediaRoot.endsWith(path.sep) ? mediaRoot : mediaRoot + path.sep;
  if (!candidate.startsWith(rootPrefix)) return null;
  const info = await stat(candidate);
  return info.isFile() ? { candidate, size: info.size } : null;
}

async function serve(request: Request, context: RouteContext, headOnly: boolean) {

  let media: Awaited<ReturnType<typeof resolveMedia>>;
  try {
    media = await resolveMedia((await context.params).segments);
  } catch {
    media = null;
  }
  if (!media) return new Response(null, { status: 404 });

  const requestedRange = parseRange(request.headers.get("range"), media.size);
  if (requestedRange === undefined) return rangeNotSatisfiable(media.size);
  const range = requestedRange ?? { start: 0, end: media.size - 1 };
  const contentLength = range.end - range.start + 1;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-length": String(contentLength),
    "content-type": "video/mp4",
  });
  if (requestedRange) headers.set("content-range", `bytes ${range.start}-${range.end}/${media.size}`);
  const body = headOnly
    ? null
    : Readable.toWeb(createReadStream(media.candidate, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status: requestedRange ? 206 : 200, headers });
}

export async function GET(request: Request, context: RouteContext) {
  return serve(request, context, false);
}

export async function HEAD(request: Request, context: RouteContext) {
  return serve(request, context, true);
}
