import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import registry from "../../../../scripts/home-demo-media.json" with { type: "json" };
import { parseMediaRange } from "../../../data/media-range.ts";

type RouteContext = { params: Promise<{ file: string }> };
type RegistryItem = { relative: string; size: number; sha256: string };

// Built by scripts/build-home-demos.py and scripts/build-hero-wall.py. Each bundle
// is a versioned, content-addressed folder under this root.
const DEFAULT_ROOT = "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-home-demos";
const CONTENT_TYPES = { mp4: "video/mp4", jpg: "image/jpeg" } as const;

export async function resolveHomeDemoMedia(file: string, mediaRoot = process.env.DASHBOARD_HOME_DEMO_ROOT ?? DEFAULT_ROOT) {
  const match = /^([a-f0-9]{64})\.(mp4|jpg)$/.exec(file);
  if (!match) return null;
  const item = (registry as Record<string, RegistryItem>)[file];
  const bundle = /^([a-z0-9][a-z0-9-]*)\/([a-f0-9]{64}\.(?:mp4|jpg))$/.exec(item?.relative ?? "");
  if (!item || item.sha256 !== match[1] || !bundle || bundle[2] !== file) return null;
  const root = await realpath(mediaRoot);
  const candidate = await realpath(path.join(root, item.relative));
  if (path.dirname(candidate) !== path.join(root, bundle[1])) return null;
  const info = await stat(candidate);
  if (!info.isFile() || info.size !== item.size) return null;
  return { candidate, size: info.size, type: CONTENT_TYPES[match[2] as keyof typeof CONTENT_TYPES] };
}

async function serve(request: Request, context: RouteContext, headOnly: boolean) {
  let media: Awaited<ReturnType<typeof resolveHomeDemoMedia>>;
  try {
    media = await resolveHomeDemoMedia((await context.params).file);
  } catch {
    media = null;
  }
  if (!media) return new Response(null, { status: 404 });
  const requested = parseMediaRange(request.headers.get("range"), media.size);
  if (requested === undefined) {
    return new Response(null, { status: 416, headers: { "accept-ranges": "bytes", "content-range": `bytes */${media.size}` } });
  }
  const range = requested ?? { start: 0, end: media.size - 1 };
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-length": String(range.end - range.start + 1),
    "content-type": media.type,
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
