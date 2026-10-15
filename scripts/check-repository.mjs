import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const MEDIA_BASELINE_COMMIT = "b23fa25";
const MAX_NEW_FILE_BYTES = 8 * 1024 * 1024; // the curated media index grows with every admission (914 episodes = 550 KB)
const MAX_DASHBOARD_CLIENT_BYTES = 94_244;
const MAX_GLOBAL_CSS_BYTES = 34_353;
const MAX_OVERVIEW_CSS_BYTES = 16 * 1024;
const MAX_METRIC_DETAIL_CSS_BYTES = 12 * 1024;
const MAX_ACWM_EVIDENCE_BYTES = 12 * 1024;
const MAX_VLA_WAM_EVIDENCE_BYTES = 8 * 1024;
const MAX_VLM_EVIDENCE_BYTES = 8 * 1024;
const MAX_VLA_WAM_SAMPLE_EVIDENCE_BYTES = 24 * 1024;
const MAX_EXPLAINABILITY_VIEW_BYTES = 16 * 1024;
const MAX_EXPLAINABILITY_CSS_BYTES = 16 * 1024;
const MAX_ACWM_BUNDLE_BYTES = 256 * 1024;
const MAX_VLA_WAM_BUNDLE_BYTES = 64 * 1024;
const MAX_VLM_BUNDLE_BYTES = 64 * 1024;
const MAX_VLA_WAM_SAMPLE_BUNDLE_BYTES = 128 * 1024;
const MAX_EXPLAINABILITY_BUNDLE_BYTES = 96 * 1024;
const MAX_DATASET_EXPLORER_BYTES = 16 * 1024;
const MAX_DATASET_EXPLORER_CSS_BYTES = 20 * 1024;
const MAX_DATASET_EPISODE_BUNDLE_BYTES = 128 * 1024;
const GENERATED_PREFIXES = [
  ".next/",
  ".vinext/",
  ".wrangler/",
  "dist/",
  "node_modules/",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lines(value) {
  return value ? value.split("\n").filter(Boolean) : [];
}

const tracked = lines(git(["ls-files"]));
const forbiddenTracked = tracked.filter((path) =>
  GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix)),
);
assert.deepEqual(forbiddenTracked, [], `generated files are tracked: ${forbiddenTracked.join(", ")}`);

const sensitiveTracked = tracked.filter(
  (path) => /(^|\/)\.env($|\.)/.test(path) || /\.(pem|key)$/i.test(path),
);
assert.deepEqual(sensitiveTracked, [], `sensitive files are tracked: ${sensitiveTracked.join(", ")}`);

const residueNames = tracked.filter((path) =>
  /(^|\/)(?:[^/]+[._-])?(?:old|backup|copy)(?:[._-]|\/|$)/i.test(path),
);
assert.deepEqual(residueNames, [], `residue-style paths are tracked: ${residueNames.join(", ")}`);

const baselineMedia = new Set(
  lines(git(["ls-tree", "-r", "--name-only", MEDIA_BASELINE_COMMIT, "--", "public/media"])),
);
const currentMedia = tracked.filter((path) => path.startsWith("public/media/"));
const addedMedia = currentMedia.filter((path) => !baselineMedia.has(path));
assert.deepEqual(addedMedia, [], `new media must not be committed to Git: ${addedMedia.join(", ")}`);

for (const path of currentMedia) {
  const baselineBlob = git(["rev-parse", `${MEDIA_BASELINE_COMMIT}:${path}`]);
  const currentBlob = git(["hash-object", "--", path]);
  assert.equal(currentBlob, baselineBlob, `tracked media changed in place: ${path}`);
}

const baselineFiles = new Set(
  lines(git(["ls-tree", "-r", "--name-only", MEDIA_BASELINE_COMMIT])),
);
const oversizedNewFiles = tracked
  .filter((path) => !baselineFiles.has(path))
  .filter((path) => existsSync(path))
  .filter((path) => statSync(path).size > MAX_NEW_FILE_BYTES);
assert.deepEqual(
  oversizedNewFiles,
  [],
  `new tracked files exceed ${MAX_NEW_FILE_BYTES} bytes: ${oversizedNewFiles.join(", ")}`,
);

assert.ok(
  statSync("app/dashboard-client.tsx").size <= MAX_DASHBOARD_CLIENT_BYTES,
  "dashboard-client.tsx exceeded its frozen size budget; extract responsibilities",
);
assert.ok(
  statSync("app/globals.css").size <= MAX_GLOBAL_CSS_BYTES,
  "globals.css exceeded its frozen size budget; extract feature styles",
);
assert.ok(
  statSync("app/overview.css").size <= MAX_OVERVIEW_CSS_BYTES,
  "overview.css exceeded its feature-size budget; split unrelated view styles",
);
assert.ok(
  statSync("app/metric-detail.css").size <= MAX_METRIC_DETAIL_CSS_BYTES,
  "metric detail CSS exceeded its feature-size budget",
);
assert.ok(
  statSync("app/components/acwm-metric-evidence.tsx").size <= MAX_ACWM_EVIDENCE_BYTES,
  "ACWM evidence component exceeded its responsibility budget; split by metric granularity",
);
assert.ok(
  statSync("app/components/vla-wam-metric-evidence.tsx").size <= MAX_VLA_WAM_EVIDENCE_BYTES,
  "VLA/WAM aggregate evidence component exceeded its responsibility budget",
);
assert.ok(
  statSync("app/components/vlm-metric-evidence.tsx").size <= MAX_VLM_EVIDENCE_BYTES,
  "VLM aggregate evidence component exceeded its responsibility budget",
);
assert.ok(
  statSync("app/components/vla-wam-sample-evidence.tsx").size <= MAX_VLA_WAM_SAMPLE_EVIDENCE_BYTES,
  "VLA/WAM sample evidence component exceeded its responsibility budget",
);
assert.ok(
  statSync("app/components/explainability-view.tsx").size <= MAX_EXPLAINABILITY_VIEW_BYTES,
  "explainability view exceeded its feature-size budget; split chart, event and method responsibilities",
);
assert.ok(
  statSync("app/explainability.css").size <= MAX_EXPLAINABILITY_CSS_BYTES,
  "explainability.css exceeded its feature-size budget; split unrelated view styles",
);
assert.ok(
  statSync("app/data/generated/acwm-results.json").size <= MAX_ACWM_BUNDLE_BYTES,
  "ACWM browser bundle exceeded its size budget; publish chunked data instead",
);
assert.ok(
  statSync("app/data/generated/vla-wam-results.json").size <= MAX_VLA_WAM_BUNDLE_BYTES,
  "VLA/WAM browser bundle exceeded its size budget; keep aggregate-only data in the client",
);
assert.ok(
  statSync("app/data/generated/vlm-results.json").size <= MAX_VLM_BUNDLE_BYTES,
  "VLM browser bundle exceeded its size budget; keep aggregate-only data in the client",
);
assert.ok(
  statSync("app/data/generated/vla-wam-samples.json").size <= MAX_VLA_WAM_SAMPLE_BUNDLE_BYTES,
  "VLA/WAM sample browser bundle exceeded its size budget",
);
assert.ok(
  statSync("app/data/generated/explainability-results.json").size <= MAX_EXPLAINABILITY_BUNDLE_BYTES,
  "explainability browser bundle exceeded its size budget; publish summary series instead",
);
assert.ok(
  statSync("app/components/dataset-explorer.tsx").size <= MAX_DATASET_EXPLORER_BYTES,
  "dataset explorer exceeded its feature-size budget; split controls from the player",
);
assert.ok(
  statSync("app/dataset-explorer.css").size <= MAX_DATASET_EXPLORER_CSS_BYTES,
  "dataset explorer CSS exceeded its feature-size budget",
);
assert.ok(
  statSync("app/data/generated/dataset-episodes.json").size <= MAX_DATASET_EPISODE_BUNDLE_BYTES,
  "dataset episode browser bundle exceeded its smoke-size budget",
);
assert.ok(statSync("AGENTS.md").size <= 12 * 1024, "AGENTS.md must stay concise");

console.log("Repository hygiene checks passed.");
