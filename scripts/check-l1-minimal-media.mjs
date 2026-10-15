import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const bundleRoot = process.env.DASHBOARD_L1_MINIMAL_MEDIA_BUNDLE_DIR ?? "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-l1-minimal-media/v0.1-20260901";
const manifest = JSON.parse(await readFile(path.join(bundleRoot, "manifest.json"), "utf8"));
assert.equal(manifest.schema_version, 2);
assert.equal(manifest.file_count, manifest.files.length);
let totalBytes = 0;
for (const file of manifest.files) {
  assert.match(file.path, /^[a-z0-9_/-]+\/[a-f0-9]{64}\.(mp4|png)$/);
  const absolute = path.join(bundleRoot, "media", file.path);
  const bytes = await readFile(absolute);
  const info = await stat(absolute);
  assert.equal(info.size, file.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  totalBytes += info.size;
}
assert.equal(totalBytes, manifest.total_bytes);
console.log(`L1 minimal media verified: ${manifest.file_count} files, ${totalBytes} bytes.`);
