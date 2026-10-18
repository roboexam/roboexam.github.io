import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { serveT1Media } from "../app/data/t1-media-server.ts";

let temporary, root, catalog;
const bytes = Buffer.from("0123456789");
before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "t1-media-test-"));
  root = path.join(temporary, "media");
  await mkdir(root);
  await writeFile(path.join(root, "sample.mp4"), bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  catalog = [{ id: "sample", bytes: bytes.length, sha256 }];
});
after(async () => { await rm(temporary, { recursive: true, force: true }); });
const request = (headers = {}) => new Request("http://localhost/api/t1-media/sample", { headers });

test("catalogued video GET and HEAD preserve bytes, size and identity", async () => {
  const result = await serveT1Media(request(), "sample", catalog, root);
  assert.equal(result.status, 200);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  assert.equal(result.headers.get("content-length"), "10");
  assert.equal(result.headers.get("etag"), `"${catalog[0].sha256}"`);
  const head = await serveT1Media(request(), "sample", catalog, root, true);
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get("content-length"), "10");
});
test("range requests support seeking, suffixes and unsatisfiable ranges", async () => {
  for (const [range, wanted, contentRange] of [["bytes=2-5", "2345", "bytes 2-5/10"], ["bytes=-3", "789", "bytes 7-9/10"], ["bytes=8-", "89", "bytes 8-9/10"]]) {
    const result = await serveT1Media(request({ range }), "sample", catalog, root);
    assert.equal(result.status, 206);
    assert.equal(await result.text(), wanted);
    assert.equal(result.headers.get("content-range"), contentRange);
  }
  for (const range of ["bytes=10-", "bytes=2-1", "bytes=0-1,5-6", "bytes=-0"]) {
    const result = await serveT1Media(request({ range }), "sample", catalog, root);
    assert.equal(result.status, 416);
    assert.equal(result.headers.get("content-range"), "bytes */10");
  }
});
test("immutable ETag revalidation and If-Range honor evidence identity", async () => {
  const result = await serveT1Media(request({ "if-none-match": `"${catalog[0].sha256}"` }), "sample", catalog, root);
  assert.equal(result.status, 304);
  const changed = await serveT1Media(request({ range: "bytes=2-3", "if-range": '"old"' }), "sample", catalog, root);
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), "0123456789");
});
test("unknown IDs, duplicate entries, path traversal, wrong size and escaped symlinks fail closed", async () => {
  for (const id of ["unknown", "../sample", "%2e%2e", "sample/extra", ".", ".."]) {
    assert.equal((await serveT1Media(request(), id, catalog, root)).status, 404);
  }
  assert.equal((await serveT1Media(request(), "sample", [...catalog, ...catalog], root)).status, 404);
  assert.equal((await serveT1Media(request(), "sample", [{ ...catalog[0], bytes: 99 }], root)).status, 404);
  await writeFile(path.join(temporary, "outside.mp4"), bytes);
  await symlink(path.join(temporary, "outside.mp4"), path.join(root, "escaped.mp4"));
  assert.equal((await serveT1Media(request(), "escaped", [{ ...catalog[0], id: "escaped" }], root)).status, 404);
});
