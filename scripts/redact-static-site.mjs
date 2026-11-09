#!/usr/bin/env node
// Apply build/static-redactions.mjs to exported data snapshots (JSON files that Vite copies untouched).
//
//   node scripts/redact-static-site.mjs <dir> [--anonymous]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redact, redactionsFor } from "../build/static-redactions.mjs";

const root = path.resolve(process.argv[2] ?? "public/static-api");
const rules = redactionsFor(process.argv.includes("--anonymous") ? "anonymous" : "public");
let changed = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".json")) {
      const body = await readFile(full, "utf8");
      const next = redact(body, rules);
      if (next !== body) { JSON.parse(next); await writeFile(full, next); changed += 1; }
    }
  }
}
await walk(root);
console.log(`redacted ${changed} files under ${root}`);
