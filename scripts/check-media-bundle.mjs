import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const defaultBundle =
  "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-media/v1-20260819-a5b6a78";
const bundleRoot = path.resolve(process.env.DASHBOARD_MEDIA_BUNDLE_DIR ?? defaultBundle);
const mediaRoot = path.resolve(process.env.DASHBOARD_MEDIA_ROOT ?? path.join(bundleRoot, "media"));
const manifestPath = path.resolve(
  process.env.DASHBOARD_MEDIA_MANIFEST ?? path.join(bundleRoot, "manifest.json"),
);

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error(`unsupported media entry: ${absolute}`);
  }
  return files.sort();
}

async function sha256(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.schema_version, 1);
assert.ok(Array.isArray(manifest.files));

const declared = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
const observedPaths = await walk(mediaRoot);
assert.deepEqual(observedPaths, declared.map((entry) => entry.path));

let totalBytes = 0;
for (const entry of declared) {
  assert.equal(typeof entry.path, "string");
  assert.equal(path.isAbsolute(entry.path), false, `absolute manifest path: ${entry.path}`);
  assert.equal(
    entry.path.split("/").includes(".."),
    false,
    `parent traversal in manifest path: ${entry.path}`,
  );
  const absolute = path.resolve(mediaRoot, entry.path);
  assert.ok(absolute.startsWith(`${mediaRoot}${path.sep}`));
  const info = await stat(absolute);
  assert.equal(info.size, entry.bytes, `size mismatch: ${entry.path}`);
  assert.equal(await sha256(absolute), entry.sha256, `hash mismatch: ${entry.path}`);
  totalBytes += info.size;
}

assert.equal(declared.length, manifest.file_count);
assert.equal(totalBytes, manifest.total_bytes);
console.log(`Media bundle verified: ${declared.length} files, ${totalBytes} bytes.`);
