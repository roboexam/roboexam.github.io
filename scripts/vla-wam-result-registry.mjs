const pi05Root =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/pi05/stack_bowls/pi05-stack-bowls-vla13-events100-20260817-v1/final_vla13_eval";
const fastWamRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/fastwam/stack_bowls/fastwam-stack-bowls-vla13-events100-formal-20260818-v1/final_vla13_eval";

export const vlaWamResultRegistry = [
  {
    modelId: "pi05",
    displayName: "Pi0.5",
    family: "VLA",
    policy: "Pi_05",
    task: "stack_bowls",
    resultVersion: "vla13-events100-20260817-v1",
    summaryFile: process.env.VLA_PI05_SUMMARY_FILE ?? `${pi05Root}/summary.json`,
    expectedSummarySha256: "33a60f1376c89b8dec522d14ac70e319fefb6870efa44829339f721d8ce28103",
    expectedInputManifestSha256: "f3094cd480d9d266370c03301be76c989528b12c45a83d0bda0779180eeb1dc1",
  },
  {
    modelId: "fastwam",
    displayName: "FastWAM",
    family: "WAM",
    policy: "FastWAM",
    task: "stack_bowls",
    resultVersion: "vla13-events100-20260818-v1",
    summaryFile: process.env.VLA_FASTWAM_SUMMARY_FILE ?? `${fastWamRoot}/summary.json`,
    expectedSummarySha256: "8660c6e3733a41988f4d5c7a3390c5582440baddae93717a44f3f077a6b6ff91",
    expectedInputManifestSha256: "c78353d56fbe76988600e36495a7a4f1b83ad5977209c21600222f2d8903fb3e",
  },
];

export const vlaWamPublishConfig = {
  bundleVersion: "vla-wam-phase1-v4-20260819-v1",
  outputFile:
    process.env.VLA_WAM_OUTPUT_FILE ??
    new URL("../app/data/generated/vla-wam-results.json", import.meta.url).pathname,
};
