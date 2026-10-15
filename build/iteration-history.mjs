import { execFileSync } from "node:child_process";

// Start prospectively; never invent a count for unaudited historical edits.
export const ITERATION_BASELINE = "b88fba16c13163ac8c56f74109f70fe549df4abf";
export const ITERATION_TARGET = 1000;
export const ITERATION_PATHS = [
  "app", "public", "worker", "build", "scripts", "ops", "proxy.ts",
  "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json",
];

export function iterationHistory(cwd, baseline = ITERATION_BASELINE) {
  // Keep git's pipes explicit. The local sandbox can reject inherited stdio
  // handles with EPERM, which would incorrectly make every preview look like
  // a missing historical baseline.
  const git = (...args) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  // A shallow/mismatched checkout must fail, not silently reset progress to 0.
  try {
    git("merge-base", "--is-ancestor", baseline, "HEAD");
  } catch (error) {
    // Local copies may intentionally omit the historical baseline. Keep dev
    // preview usable while preserving the strict behavior for known commits.
    if (error?.status !== 128 && error?.code !== "EPERM") throw error;
    return { count: 0, target: ITERATION_TARGET, baseline: "local-dev", revision: "local-dev", recent: [] };
  }
  const revision = git("rev-parse", "HEAD");
  const hashes = git("rev-list", "--no-merges", `${baseline}..HEAD`, "--", ...ITERATION_PATHS)
    .split("\n").filter(Boolean);
  const recent = hashes.slice(0, 8).map((hash, index) => {
    const [date, ...title] = git("show", "-s", "--format=%cs%n%s", hash).split("\n");
    return { hash: hash.slice(0, 7), date, title: title.join("\n"), number: hashes.length - index };
  });
  return { count: hashes.length, target: ITERATION_TARGET, baseline, revision, recent };
}
