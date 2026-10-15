import assert from "node:assert/strict";
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

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const manifestPath = path.join(registry.mediaBundleDir, "manifest.json");
const mediaRoot = path.join(registry.mediaBundleDir, "media");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
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
  assert.equal(await sha256(absolute), entry.sha256, `SHA256 mismatch: ${entry.path}`);
  totalBytes += info.size;
}
assert.equal(totalBytes, manifest.total_bytes);
console.log(`Dataset episode media verified: ${manifest.file_count} files, ${totalBytes} bytes.`);
