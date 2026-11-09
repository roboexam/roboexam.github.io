#!/usr/bin/env node
// Scan a built static site for anything that must not be published.
//
//   node scripts/audit-static-site.mjs dist/client                # no private paths, hosts or secrets
//   node scripts/audit-static-site.mjs dist/client --deny <file>  # plus literal strings, one per line
//
// The --deny list stays outside the repository: it names people and secrets this repository must not.
// Exits 1 and lists every hit (file, pattern, context) when something is found.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist/client");
const denyFile = process.argv.includes("--deny") ? process.argv[process.argv.indexOf("--deny") + 1] : null;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const denied = denyFile
  ? (await readFile(denyFile, "utf8")).split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
  : [];

const patterns = [
  ["server path", /\/(?:mnt|bh|root|Users)\/[A-Za-z0-9_.-]+/g],
  ["storage root", /gyc_ckp|benchmark2027\/(?:runtime|data|experiments|worktrees)/g],
  ["private host", /tail4ada12|\.ts\.net\b|\bremap\b|\blocalhost:\d{2,5}|127\.0\.0\.1:\d{2,5}/g],
  ["private address", /(?<![\w.])(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?![\w.])/g],
  ["credential", /AUTH_USERS|AUTH_SESSION_SECRET|unibench_session|password["']?\s*[:=]\s*["'`][^"'`\s]{3,}/gi],
  ["internal cluster", /\bAIHC\b/g],
  ...(denied.length ? [["deny list", new RegExp(denied.map(escape).join("|"), "gi")]] : []),
];
const text = /\.(?:html|rsc|js|mjs|css|json|txt|svg|vtt|map|xml|webmanifest)$|^_headers$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

const hits = [];
let scanned = 0;
for await (const file of files(root)) {
  const relative = path.relative(root, file);
  for (const [label, pattern] of patterns) {
    if (pattern.test(relative)) hits.push({ file: relative, label, context: `(file name) ${relative}` });
    pattern.lastIndex = 0;
  }
  if (!text.test(path.basename(file))) continue;
  scanned += 1;
  const body = await readFile(file, "utf8");
  for (const [label, pattern] of patterns) {
    for (const match of body.matchAll(pattern)) {
      const start = Math.max(0, match.index - 60);
      hits.push({ file: relative, label, context: body.slice(start, match.index + match[0].length + 60).replace(/\s+/g, " ") });
    }
  }
}

const summary = new Map();
for (const hit of hits) summary.set(`${hit.label}: ${hit.file}`, (summary.get(`${hit.label}: ${hit.file}`) ?? 0) + 1);
for (const [key, count] of summary) console.log(`${count.toString().padStart(5)}  ${key}`);
for (const hit of hits.slice(0, 80)) console.log(`  [${hit.label}] ${hit.file}: …${hit.context}…`);
console.log(`${scanned} text files scanned in ${root} ${hits.length} hits`);
if (hits.length) process.exitCode = 1;
