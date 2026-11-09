#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
function option(name, fallback = undefined) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const source = path.resolve(option("--source", "dist/client"));
const destination = path.resolve(option("--dest", "dist/client/__public_latest"));
const publicPath = option("--path", "__public_latest").replace(/^\/+|\/+$/g, "");
const sourceCommit = option("--source-commit", "unknown");
const snapshotTag = option("--snapshot-tag", "unknown");

if (!/^[A-Za-z0-9._-]+$/.test(publicPath)) {
  throw new Error(`Invalid hidden public path: ${publicPath}`);
}

const prefix = `/${publicPath}`;
const excludedTopLevel = new Set([
  "analysis",
  "curated-data",
  "curated-traces",
  "episode-data",
  "explorer-data",
  "review-data",
]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".rsc",
  ".txt",
  ".xml",
]);

function rewriteRootPaths(text) {
  // The public build is compiled as a root site. It is copied below the workshop
  // build, so root-relative asset/data links must point into this archive.
  let result = text.replace(/(["'`])\/(?![\/"'`\\>\)])/g, `$1${prefix}/`);
  result = result.replace(/url\(\s*\/(?![\/\)])/g, `url(${prefix}/`);
  result = result.replaceAll('href="/"', `href="${prefix}/"`);
  result = result.replaceAll("href='/'", `href='${prefix}/'`);
  return result;
}

async function copyEntry(relativePath) {
  const sourcePath = path.join(source, relativePath);
  const destinationPath = path.join(destination, relativePath);
  const info = await stat(sourcePath);
  if (info.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    for (const child of await readdir(sourcePath)) {
      await copyEntry(path.join(relativePath, child));
    }
    return;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  if (textExtensions.has(path.extname(relativePath).toLowerCase())) {
    const sourceText = await readFile(sourcePath, "utf8");
    let output = rewriteRootPaths(sourceText);
    if (relativePath === "index.html") {
      output = output.replace("<head>", '<head><meta name="robots" content="noindex,nofollow">');
    }
    await writeFile(destinationPath, output);
  } else {
    await cp(sourcePath, destinationPath);
  }
}

await mkdir(destination, { recursive: true });
for (const entry of await readdir(source)) {
  if (excludedTopLevel.has(entry)) continue;
  await copyEntry(entry);
}

await writeFile(
  path.join(destination, "archive-manifest.json"),
  `${JSON.stringify({
    kind: "roboexam-public-site-archive",
    sourceCommit,
    snapshotTag,
    path: publicPath,
  }, null, 2)}\n`,
);

console.log(`Packaged public commit ${sourceCommit} at ${prefix}/`);
