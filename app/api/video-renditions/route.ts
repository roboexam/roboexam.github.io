import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import catalog from "../../data/generated/video-renditions.json";
import { parseMediaRange } from "../../data/media-range";
import { rawReview } from "../../data/raw-review.server";

const ROOT =
  process.env.UNIBENCH_VIDEO_RENDITION_ROOT ??
  "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-video-renditions/v1";
type Rendition = {
  sha256: string;
  bytes: number;
  relativePath: string;
};
const profileId = catalog.profile.id;
const items: Record<string, Rendition> = catalog.items;

async function serve(request: Request, head: boolean) {
  const parameters = new URL(request.url).searchParams;
  const source = parameters.get("source") ?? "";
  const profile = parameters.get("profile") ?? "";
  if (!/^[a-f0-9]{64}$/.test(source) || profile !== profileId) {
    return new Response(null, { status: 404 });
  }
  const reference = items[source];
  if (!reference) return rawReview.serveRendition(request, head);

  let candidate: string;
  try {
    const root = await realpath(ROOT);
    candidate = await realpath(path.join(root, reference.relativePath));
    if (!candidate.startsWith(`${root}${path.sep}`)) {
      return new Response(null, { status: 404 });
    }
    const information = await stat(candidate);
    if (!information.isFile() || information.size !== reference.bytes) {
      return new Response(null, { status: 410 });
    }
  } catch {
    return new Response(null, { status: 404 });
  }

  const etag = `"${reference.sha256}"`;
  const requestedRange = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  const rangeHeader = ifRange && ifRange !== etag ? null : requestedRange;
  const range = parseMediaRange(rangeHeader, reference.bytes);
  if (range === undefined) {
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${reference.bytes}`,
        "accept-ranges": "bytes",
      },
    });
  }
  if (!range && request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, "cache-control": "private, max-age=31536000, immutable" },
    });
  }

  const { start, end } = range ?? { start: 0, end: reference.bytes - 1 };
  const headers = new Headers({
    "content-type": "video/mp4",
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes",
    "content-disposition": "inline",
    "cache-control": "private, max-age=31536000, immutable",
    etag,
    "x-roboexam-source-sha256": source,
    "x-roboexam-rendition-profile": profileId,
  });
  if (range) {
    headers.set("content-range", `bytes ${start}-${end}/${reference.bytes}`);
  }
  return new Response(
    head
      ? null
      : (Readable.toWeb(
          createReadStream(candidate, { start, end }),
        ) as ReadableStream<Uint8Array>),
    { status: range ? 206 : 200, headers },
  );
}

export const GET = (request: Request) => serve(request, false);
export const HEAD = (request: Request) => serve(request, true);
