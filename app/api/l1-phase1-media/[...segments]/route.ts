import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

type RouteContext = { params: Promise<{ segments: string[] }> };

async function resolveMedia(segments: string[]) {
  const valid = segments.length === 2
    && segments[0] === "samples"
    && /^[a-f0-9]{64}\.png$/.test(segments[1]);
  if (!valid) return null;
  const root = await realpath(path.join(process.cwd(), "public", "l1-phase1-media"));
  const candidate = await realpath(path.join(root, ...segments));
  if (!candidate.startsWith(`${root}${path.sep}`)) return null;
  const info = await stat(candidate);
  return info.isFile() ? { candidate, size: info.size } : null;
}

async function serve(context: RouteContext, headOnly: boolean) {
  let media: Awaited<ReturnType<typeof resolveMedia>> = null;
  try {
    media = await resolveMedia((await context.params).segments);
  } catch {
    media = null;
  }
  if (!media) return new Response(null, { status: 404 });
  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-length": String(media.size),
    "content-type": "image/png",
  });
  const body = headOnly
    ? null
    : Readable.toWeb(createReadStream(media.candidate)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers });
}

export async function GET(_request: Request, context: RouteContext) {
  return serve(context, false);
}

export async function HEAD(_request: Request, context: RouteContext) {
  return serve(context, true);
}
