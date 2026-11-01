import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";

import registry from "../../../../scripts/xvla-24id-media.json" with { type: "json" };
import oodRegistry from "../../../../scripts/xvla-ood-media.json" with { type: "json" };

type RouteContext = { params: Promise<{ file: string }> };
const MEDIA_ROOT = "/mnt/gyc_ckp/benchmark2027/runtime/staging/dashboard-xvla-preview-20261029/";
const OOD_MEDIA_ROOT = "/mnt/gyc_ckp/benchmark2027/runtime/staging/dashboard-xvla-ood-20261101/";

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
  return start >= 0 && start < size && end >= start ? { start, end } : undefined;
}

export async function resolveMedia(file: string) {
  if (!/^[a-f0-9]{64}\.mp4$/.test(file)) return null;
  const item = ({ ...registry, ...oodRegistry } as Record<string, { path: string; size: number; sha256: string }>)[file];
  if (!item || file !== `${item.sha256}.mp4`) return null;
  const candidate = await realpath(item.path);
  if (candidate !== item.path || (!candidate.startsWith(MEDIA_ROOT) && !candidate.startsWith(OOD_MEDIA_ROOT))) return null;
  const info = await stat(candidate);
  return info.isFile() && info.size === item.size ? { candidate, size: info.size } : null;
}

async function serve(request: Request, context: RouteContext, headOnly: boolean) {
  let media: Awaited<ReturnType<typeof resolveMedia>>;
  try {
    media = await resolveMedia((await context.params).file);
  } catch {
    media = null;
  }
  if (!media) return new Response(null, { status: 404 });
  const requested = parseRange(request.headers.get("range"), media.size);
  if (requested === undefined) {
    return new Response(null, { status: 416, headers: { "accept-ranges": "bytes", "content-range": `bytes */${media.size}` } });
  }
  const range = requested ?? { start: 0, end: media.size - 1 };
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-length": String(range.end - range.start + 1),
    "content-type": "video/mp4",
  });
  if (requested) headers.set("content-range", `bytes ${range.start}-${range.end}/${media.size}`);
  const body = headOnly ? null : Readable.toWeb(createReadStream(media.candidate, range)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: requested ? 206 : 200, headers });
}

export async function GET(request: Request, context: RouteContext) {
  return serve(request, context, false);
}

export async function HEAD(request: Request, context: RouteContext) {
  return serve(request, context, true);
}
