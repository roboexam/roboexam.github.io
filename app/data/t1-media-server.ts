import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { parseMediaRange } from "./media-range.ts";

export type T1MediaRecord = { id: string; bytes: number; sha256: string };

/** Serve only a catalogued immutable video; caller-supplied filesystem paths are never accepted. */
export async function serveT1Media(
  request: Request,
  id: string,
  catalog: readonly T1MediaRecord[],
  root: string,
  headOnly = false,
): Promise<Response> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}$/.test(id) || id === "." || id === "..") {
    return new Response(null, { status: 404 });
  }
  const records = catalog.filter((record) => record.id === id);
  if (records.length !== 1) return new Response(null, { status: 404 });
  const record = records[0];
  if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    return new Response(null, { status: 404 });
  }
  let filename: string;
  try {
    const directory = await realpath(root);
    filename = await realpath(path.join(directory, `${id}.mp4`));
    if (!filename.startsWith(directory + path.sep)) return new Response(null, { status: 404 });
    const info = await stat(filename);
    if (!info.isFile() || info.size !== record.bytes) return new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 404 });
  }
  const etag = `"${record.sha256}"`;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": "inline",
    "content-type": "video/mp4",
    "etag": etag,
    "x-content-type-options": "nosniff",
  });
  if (!request.headers.has("range") && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  const ifRange = request.headers.get("if-range");
  const requestedRange = parseMediaRange(ifRange && ifRange !== etag ? null : request.headers.get("range"), record.bytes);
  if (requestedRange === undefined) {
    headers.set("content-range", `bytes */${record.bytes}`);
    return new Response(null, { status: 416, headers });
  }
  const range = requestedRange ?? { start: 0, end: record.bytes - 1 };
  headers.set("content-length", String(range.end - range.start + 1));
  if (requestedRange) headers.set("content-range", `bytes ${range.start}-${range.end}/${record.bytes}`);
  const body = headOnly ? null : Readable.toWeb(createReadStream(filename, range)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: requestedRange ? 206 : 200, headers });
}
