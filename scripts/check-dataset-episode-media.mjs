import assert from "node:assert/strict";
import { createMediaVerifier } from "./media-integrity.mjs";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { datasetEpisodeRegistry as registry } from "./dataset-episode-registry.mjs";

async function walk(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error(`unsupported dataset media entry: ${absolute}`);
  }
  return files.sort();
}

const mediaVerifier = await createMediaVerifier("dataset-episode-media");

const manifestPath = path.join(registry.mediaBundleDir, "manifest.json");
const mediaRoot = path.join(registry.mediaBundleDir, "media");
const manifestBytes = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema_version, 1);
assert.equal(manifest.bundle_version, registry.mediaBundleVersion);
assert.equal(manifest.file_count, 4500);
const declared = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
assert.deepEqual(await walk(mediaRoot), declared.map((entry) => entry.path));

let totalBytes = 0;
for (const entry of declared) {
  assert.equal(path.isAbsolute(entry.path), false);
  assert.equal(entry.path.split("/").includes(".."), false);
  const absolute = path.resolve(mediaRoot, entry.path);
  assert.ok(absolute.startsWith(`${mediaRoot}${path.sep}`));
  const info = await stat(absolute);
  assert.equal(info.size, entry.bytes, `size mismatch: ${entry.path}`);
  assert.equal(await mediaVerifier.verify(absolute, entry.sha256, entry.bytes), entry.sha256, `SHA256 mismatch: ${entry.path}`);
  totalBytes += info.size;
}
assert.equal(totalBytes, manifest.total_bytes);
await mediaVerifier.finish({ manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") });
console.log(`Dataset episode media verified: ${manifest.file_count} files, ${totalBytes} bytes.`);
