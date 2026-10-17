import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMediaVerifier } from "../scripts/media-integrity.mjs";

const sha = text => createHash("sha256").update(text).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dashboard-media-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "sample.mp4"), cacheDir = path.join(root, "cache");
  await writeFile(file, "good");
  const verifier = mode => createMediaVerifier("test-media", { cacheDir, mode: mode ?? "incremental" });
  const cold = await verifier();
  await cold.verify(file, sha("good"), 4); await cold.finish({ catalog: "fixture-v1" });
  return { root, file, cacheDir, verifier };
}

test("cold checks hash bytes; unchanged hot checks reuse only the bound receipt", async t => {
  const f = await fixture(t), v = await f.verifier();
  await v.verify(f.file, sha("good"), 4);
  const report = await v.finish({ catalog: "fixture-v1" });
  assert.equal(report.rehashedFiles, 0); assert.equal(report.rehashedBytes, 0);
  assert.equal(report.reusedFiles, 1); assert.equal(report.reusedBytes, 4);
});
test("full mode rehashes even with an exact receipt", async t => {
  const f = await fixture(t), v = await f.verifier("full");
  await v.verify(f.file, sha("good"), 4);
  const report = await v.finish();
  assert.equal(report.rehashedFiles, 1); assert.equal(report.reusedFiles, 0);
});
test("same-size in-place corruption with restored mtime is rejected by ctime then hash", async t => {
  const f = await fixture(t), info = await stat(f.file);
  await writeFile(f.file, "evil"); await utimes(f.file, info.atime, info.mtime);
  const v = await f.verifier();
  await assert.rejects(v.verify(f.file, sha("good"), 4), /SHA256 mismatch/);
});
test("atomic replacement cannot borrow the previous inode receipt", async t => {
  const f = await fixture(t), replacement = path.join(f.root, "replacement.mp4");
  await writeFile(replacement, "evil"); await rename(replacement, f.file);
  const v = await f.verifier();
  await assert.rejects(v.verify(f.file, sha("good"), 4), /SHA256 mismatch/);
});
test("new expected digest, missing file and wrong size never reuse receipts", async t => {
  const f = await fixture(t), v = await f.verifier();
  await assert.rejects(v.verify(f.file, sha("evil"), 4), /SHA256 mismatch/);
  await assert.rejects(v.verify(f.file, sha("good"), 3), /size mismatch/);
  await rm(f.file);
  await assert.rejects(v.verify(f.file, sha("good"), 4), /ENOENT/);
});
test("corrupt and stale-policy caches fall back to complete byte verification", async t => {
  const f = await fixture(t), index = path.join(f.cacheDir, "test-media.json");
  await writeFile(index, "bad JSON");
  const v = await f.verifier();
  await v.verify(f.file, sha("good"), 4);
  let report = await v.finish();
  assert.equal(report.rehashedFiles, 1); assert.equal(report.warnings.length, 1);
  const data = JSON.parse(await readFile(index, "utf8"));
  data.policySha256 = "0".repeat(64); await writeFile(index, JSON.stringify(data));
  const next = await f.verifier();
  await next.verify(f.file, sha("good"), 4); report = await next.finish();
  assert.equal(report.rehashedFiles, 1); assert.equal(report.reusedFiles, 0);
});
test("catalog changes hash newly introduced files while unchanged identities remain reusable", async t => {
  const f = await fixture(t), second = path.join(f.root, "new.mp4");
  await writeFile(second, "new!");
  const v = await f.verifier();
  await v.verify(f.file, sha("good"), 4); await v.verify(second, sha("new!"), 4);
  const report = await v.finish({ catalog: "fixture-v2" });
  assert.equal(report.rehashedFiles, 1); assert.equal(report.reusedFiles, 1);
});
test("invalid modes and writable cache directories cannot bypass hashing", async t => {
  const f = await fixture(t);
  await assert.rejects(f.verifier("skip"), /unsupported media verification mode/);
  await chmod(f.cacheDir, 0o777);
  await assert.rejects(f.verifier(), /must not be group\/world writable/);
});
