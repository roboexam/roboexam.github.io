#!/usr/bin/env node

import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const env = { ...process.env };
const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    stdio: "inherit",
  });
};

if (process.env.GITHUB_PAGES !== "true") {
  run("vinext", ["build"]);
  process.exit(0);
}

const publicCommit = process.env.PUBLIC_SITE_COMMIT ?? "087d029bf269dc14333f68eaac109ca3f5ffa13c";
const snapshotTag = process.env.STATIC_SNAPSHOT_TAG ?? "static-snapshot-0f093a7";
const hiddenPath = process.env.HIDDEN_PUBLIC_PATH ?? "__public_latest_087d029";
const publicDir = await mkdtemp(path.join(os.tmpdir(), "roboexam-public-pages-"));

try {
  // Build the workshop checkout first. This remains the root of the Pages artifact.
  run("vinext", ["build"]);

  run("git", ["fetch", "--no-tags", "origin", publicCommit]);
  run("git", ["worktree", "add", "--detach", publicDir, publicCommit]);

  // The Pages workflow has already unpacked the pinned snapshot into this checkout.
  // Reuse those files for the public worktree instead of downloading a second copy.
  await cp(path.join(root, "public", "static-api"), path.join(publicDir, "public", "static-api"), { recursive: true });
  await cp(path.join(root, "public", "static-media"), path.join(publicDir, "public", "static-media"), { recursive: true });

  run("npm", ["ci", "--prefix", publicDir]);
  run("npm", ["run", "build"], {
    cwd: publicDir,
    env: { ...env, GITHUB_PAGES: "true", UNIBENCH_DEPLOY_BUILD: "1" },
  });

  for (const relative of [
    "analysis",
    "curated-data",
    "curated-traces",
    "episode-data",
    "explorer-data",
    "review-data",
  ]) {
    await rm(path.join(publicDir, "dist", "client", relative), { recursive: true, force: true });
  }

  run(process.execPath, [
    path.join(root, "scripts", "package-hidden-public-site.mjs"),
    "--source", path.join(publicDir, "dist", "client"),
    "--dest", path.join(root, "dist", "client", hiddenPath),
    "--path", hiddenPath,
    "--source-commit", publicCommit,
    "--snapshot-tag", snapshotTag,
  ]);
} finally {
  try {
    run("git", ["worktree", "remove", "--force", publicDir]);
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
}
