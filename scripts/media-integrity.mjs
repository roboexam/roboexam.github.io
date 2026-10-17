import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const SCHEMA = "unibench.media-integrity-receipts.v1";
const POLICY = createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex");
const DEFAULT_CACHE = "/mnt/gyc_ckp/benchmark2027/runtime/caches/dashboard_media_integrity/v1";
const FIELDS = ["dev", "ino", "size", "mtimeNs", "ctimeNs"];
const digest = value => createHash("sha256").update(value).digest("hex");
const identity = info => Object.fromEntries(FIELDS.map(key => [key, String(info[key])]));
const equal = (a, b) => FIELDS.every(key => a?.[key] === b?.[key]);

// Receipts are trusted local derived cache, never source evidence or data admission.
// Full mode always re-reads bytes. Incremental mode still opens and fstats every file.
export async function createMediaVerifier(namespace, options = {}) {
  assert.match(namespace, /^[a-z][a-z0-9-]+$/);
  const mode = options.mode ?? process.env.UNIBENCH_MEDIA_VERIFY_MODE ?? "incremental";
  assert.ok(["incremental", "full"].includes(mode), "unsupported media verification mode");
  const cacheDir = path.resolve(options.cacheDir ?? process.env.UNIBENCH_MEDIA_INTEGRITY_CACHE_DIR ?? DEFAULT_CACHE);
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const directory = await lstat(cacheDir);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink(), "receipt cache must be a real directory");
  assert.ok((directory.mode & 0o022) === 0, "receipt cache must not be group/world writable");
  assert.equal(directory.uid, process.getuid(), "receipt cache owner differs from verifier");
  const cacheFile = path.join(cacheDir, namespace + ".json");
  const started = performance.now();
  const report = { namespace, mode, policySha256: POLICY, files: 0, rehashedFiles: 0, reusedFiles: 0,
    rehashedBytes: 0, reusedBytes: 0, warnings: [] };
  let previous = {};
  try {
    const info = await lstat(cacheFile);
    assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o022) === 0);
    assert.equal(info.uid, process.getuid());
    const value = JSON.parse(await readFile(cacheFile, "utf8"));
    assert.equal(value.schemaVersion, SCHEMA);
    assert.equal(value.policySha256, POLICY);
    assert.ok(value.entries && typeof value.entries === "object" && !Array.isArray(value.entries));
    previous = value.entries;
  } catch (error) {
    if (error.code !== "ENOENT") report.warnings.push("Unusable receipt cache: full byte verification required.");
  }
  const entries = Object.create(null);
  let finished = false;
  return {
    async verify(file, expectedSha256, expectedBytes) {
      assert.equal(finished, false, "verification already finished");
      assert.match(expectedSha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes >= 0);
      const physical = await realpath(file);
      const key = digest(JSON.stringify([physical, expectedSha256, expectedBytes]));
      const handle = await open(physical, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await handle.stat({ bigint: true });
        assert.ok(before.isFile(), "media is not a regular file: " + physical);
        assert.equal(before.size, BigInt(expectedBytes), "media size mismatch: " + physical);
        const fingerprint = identity(before);
        const receipt = entries[key] ?? previous[key];
        const reusable = mode === "incremental" && receipt?.physicalPath === physical &&
          receipt.sha256 === expectedSha256 && receipt.bytes === expectedBytes &&
          equal(receipt.identity, fingerprint);
        let verifiedAt = receipt?.verifiedAt;
        if (!reusable) {
          const hash = createHash("sha256");
          let bytesRead = 0;
          for await (const bytes of handle.createReadStream({ autoClose: false })) {
            hash.update(bytes); bytesRead += bytes.length;
          }
          assert.equal(bytesRead, expectedBytes, "media changed while hashing: " + physical);
          assert.equal(hash.digest("hex"), expectedSha256, "media SHA256 mismatch: " + physical);
          report.rehashedFiles++; report.rehashedBytes += expectedBytes;
          verifiedAt = new Date().toISOString();
        } else {
          assert.equal(typeof verifiedAt, "string");
          report.reusedFiles++; report.reusedBytes += expectedBytes;
        }
        assert.ok(equal(identity(await handle.stat({ bigint: true })), fingerprint),
          "media identity changed during verification: " + physical);
        // Re-resolve after checking so a replaced path cannot borrow an old handle's receipt.
        assert.equal(await realpath(file), physical, "media path changed during verification");
        const afterPath = await lstat(physical, { bigint: true });
        assert.ok(equal(identity(afterPath), fingerprint), "media path identity changed during verification");
        entries[key] = { physicalPath: physical, sha256: expectedSha256, bytes: expectedBytes,
          identity: fingerprint, verifiedAt };
        report.files++;
        return expectedSha256;
      } finally {
        await handle.close();
      }
    },
    async finish(bindings = {}) {
      assert.equal(finished, false, "verification already finished");
      finished = true;
      report.seconds = (performance.now() - started) / 1000;
      report.bindings = bindings;
      const document = { schemaVersion: SCHEMA, policySha256: POLICY, namespace,
        checkedAt: new Date().toISOString(), report, entries };
      const temporary = cacheFile + ".tmp-" + process.pid + "-" + randomUUID();
      await writeFile(temporary, JSON.stringify(document) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temporary, cacheFile);
      console.log("Media integrity: " + JSON.stringify(report));
      return report;
    },
  };
}
