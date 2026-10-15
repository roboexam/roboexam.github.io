import { execFileSync } from "node:child_process";

// Start prospectively; never invent a count for unaudited historical edits.
export const ITERATION_BASELINE = "b88fba16c13163ac8c56f74109f70fe549df4abf";
export const ITERATION_TARGET = 1000;
export const VENDORED_ITERATION_HISTORY = {
  commit: "45a47e52fdb58cfb6ee0e2a0d9c1c0538428664f",
  count: 101,
  baseline: "vendored:f4d24d88a6bd7f4e5cb85dd3da3218aaf29abf8a",
  recent: [
    { hash: "f4d24d8", date: "2026-10-14", title: "Load Pi0.5 episode evidence on demand to keep public dashboard assets small", number: 101 },
    { hash: "ce6c15b", date: "2026-10-14", title: "Publish seven Pi0.5 indomain cohorts with aligned metrics and rollout videos", number: 100 },
    { hash: "e77b1f1", date: "2026-10-14", title: "Restore dashboard to baseline 908ae5b", number: 99 },
    { hash: "90c7a9a", date: "2026-10-14", title: "Restore original policy metric definitions without result-adapter overrides", number: 98 },
    { hash: "90a2411", date: "2026-10-14", title: "Add seven completed Pi0.5 indomain task results with validated provenance", number: 97 },
    { hash: "065d159", date: "2026-10-13", title: "Fill Pi0.5 Stack Bowls indomain metrics from the October 12 run", number: 96 },
    { hash: "908ae5b", date: "2026-10-12", title: "Publish current admitted dataset and action traces", number: 95 },
    { hash: "27d7b56", date: "2026-10-12", title: "Preserve formal document OOD protocol", number: 94 },
  ],
};
export const ITERATION_PATHS = [
  "app", "public", "worker", "build", "scripts", "ops", "proxy.ts",
  "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json",
];

export function iterationHistory(
  cwd,
  baseline = ITERATION_BASELINE,
  vendored = VENDORED_ITERATION_HISTORY,
) {
  // Keep git's pipes explicit. The local sandbox can reject inherited stdio
  // handles with EPERM, which would incorrectly make every preview look like
  // a missing historical baseline.
  const git = (...args) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  const localDevelopment = () => ({
    count: 0,
    target: ITERATION_TARGET,
    baseline: "local-dev",
    revision: "local-dev",
    recent: [],
  });

  const historyAfter = (commit, baseCount, historyBaseline, inheritedRecent = []) => {
    const revision = git("rev-parse", "HEAD");
    const hashes = git("rev-list", "--no-merges", `${commit}..HEAD`, "--", ...ITERATION_PATHS)
      .split("\n").filter(Boolean);
    const recent = hashes.slice(0, 8).map((hash, index) => {
      const [date, ...title] = git("show", "-s", "--format=%cs%n%s", hash).split("\n");
      return {
        hash: hash.slice(0, 7),
        date,
        title: title.join("\n"),
        number: baseCount + hashes.length - index,
      };
    });
    recent.push(...inheritedRecent.slice(0, Math.max(0, 8 - recent.length)));
    return {
      count: baseCount + hashes.length,
      target: ITERATION_TARGET,
      baseline: historyBaseline,
      revision,
      recent,
    };
  };

  // A mismatched checkout must fail. A checkout that intentionally vendors the
  // dashboard cannot contain the old standalone Git objects, so continue from
  // the audited import count when the RoboExam import commit is an ancestor.
  try {
    git("merge-base", "--is-ancestor", baseline, "HEAD");
  } catch (error) {
    if (error?.code === "EPERM") return localDevelopment();
    if (error?.status !== 128) throw error;
    try {
      git("merge-base", "--is-ancestor", vendored.commit, "HEAD");
    } catch (vendoredError) {
      if (
        vendoredError?.status !== 1
        && vendoredError?.status !== 128
        && vendoredError?.code !== "EPERM"
      ) throw vendoredError;
      return localDevelopment();
    }
    return historyAfter(
      vendored.commit,
      vendored.count,
      vendored.baseline,
      vendored.recent,
    );
  }
  return historyAfter(baseline, 0, baseline);
}
