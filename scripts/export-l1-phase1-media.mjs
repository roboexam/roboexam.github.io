import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { l1Phase1ProvisionalRegistry } from "./l1-phase1-provisional-registry.mjs";

const checkOnly = process.argv.includes("--check");
const buildRequested = process.argv.includes("--build");
assert.notEqual(checkOnly, buildRequested, "choose exactly one of --check or --build");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonl(bytes) {
  return bytes.toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function safeSourcePath(relativePath) {
  assert.equal(path.isAbsolute(relativePath), false, `media path must be relative: ${relativePath}`);
  assert.match(relativePath, /^[a-zA-Z0-9_./-]+\.png$/);
  const sourceRoot = path.resolve(l1Phase1ProvisionalRegistry.sourceMediaRoot);
  const absolute = path.resolve(sourceRoot, relativePath);
  assert.ok(absolute.startsWith(`${sourceRoot}${path.sep}`), `media path escapes source root: ${relativePath}`);
  return absolute;
}

async function expectedBundle() {
  const publicBytes = await readFile(l1Phase1ProvisionalRegistry.publicManifest);
  assert.equal(sha256(publicBytes), l1Phase1ProvisionalRegistry.publicManifestSha256);
  const rows = parseJsonl(publicBytes);
  const byId = new Map(rows.map((row) => [row.canonical_sample_id, row]));
  assert.equal(byId.size, rows.length, "duplicate public canonical_sample_id");

  const filesByHash = new Map();
  for (const row of rows) {
    const sampleId = row.canonical_sample_id;
    assert.equal(row.media_paths.length, row.frame_indices.length);
    for (const [index, relativePath] of row.media_paths.entries()) {
      const expectedSha256 = row.media_sha256[relativePath];
      assert.match(expectedSha256, /^[a-f0-9]{64}$/);
      const source = safeSourcePath(relativePath);
      const bytes = await readFile(source);
      assert.equal(sha256(bytes), expectedSha256, `source media hash drift: ${relativePath}`);
      const existing = filesByHash.get(expectedSha256);
      if (existing) {
        existing.sampleIds.add(sampleId);
        existing.frameIndices.add(row.frame_indices[index]);
      } else {
        filesByHash.set(expectedSha256, {
          source,
          path: `samples/${expectedSha256}.png`,
          sha256: expectedSha256,
          bytes: bytes.length,
          sampleIds: new Set([sampleId]),
          frameIndices: new Set([row.frame_indices[index]]),
        });
      }
    }
  }

  const files = [...filesByHash.values()].sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schema_version: 1,
    bundle_version: "dashboard-l1-phase1-media-v0.3-20260905",
    source_public_manifest_sha256: l1Phase1ProvisionalRegistry.publicManifestSha256,
    canonical_sample_count: rows.length,
    media_binding_count: rows.reduce((sum, row) => sum + row.media_paths.length, 0),
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files: files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      canonical_sample_ids: [...file.sampleIds].sort(),
      frame_indices: [...file.frameIndices].sort((left, right) => left - right),
    })),
  };
  return { files, manifest };
}

async function verifyBundle(files, manifest) {
  const bundleRoot = l1Phase1ProvisionalRegistry.mediaBundleRoot;
  const storedManifest = JSON.parse(await readFile(path.join(bundleRoot, "manifest.json"), "utf8"));
  assert.deepEqual(storedManifest, manifest, "Phase 1 media manifest drift");
  const storedFiles = (await readdir(path.join(bundleRoot, "media/samples"))).sort();
  assert.deepEqual(storedFiles, files.map((file) => path.basename(file.path)).sort(), "Phase 1 media file set drift");
  for (const file of files) {
    const bytes = await readFile(path.join(bundleRoot, "media", file.path));
    assert.equal(bytes.length, file.bytes, `Phase 1 media byte count drift: ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `Phase 1 media hash drift: ${file.path}`);
  }
}

execFileSync(
  "/usr/bin/python3",
  [
    "/mnt/gyc/benchmark2027/scripts/storage/layout_guard.py",
    "validate",
    "generated_dataset",
    l1Phase1ProvisionalRegistry.mediaBundleRoot,
  ],
  { stdio: "ignore" },
);

const { files, manifest } = await expectedBundle();
if (checkOnly) {
  await verifyBundle(files, manifest);
  console.log(`L1 Phase 1 media verified: ${manifest.file_count} files, ${manifest.total_bytes} bytes.`);
} else {
  const bundleRoot = l1Phase1ProvisionalRegistry.mediaBundleRoot;
  await assert.rejects(stat(bundleRoot), { code: "ENOENT" }, `refusing to overwrite media bundle: ${bundleRoot}`);
  const temporaryRoot = `${bundleRoot}.tmp-${process.pid}`;
  try {
    await mkdir(path.join(temporaryRoot, "media/samples"), { recursive: true });
    for (const file of files) {
      await copyFile(file.source, path.join(temporaryRoot, "media", file.path));
    }
    await writeFile(path.join(temporaryRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryRoot, bundleRoot);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  await verifyBundle(files, manifest);
  console.log(`Built immutable L1 Phase 1 media bundle: ${bundleRoot}`);
}
