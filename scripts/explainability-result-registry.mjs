const pi05Root =
  "/mnt/gyc_ckp/benchmark2027/experiments/metrics/success_correlation/stack_bowls/pi05-vla13-events100-pre250-20260819-v1";
const fastWamRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/metrics/success_correlation/stack_bowls/fastwam-vla13-events100-pre250-20260819-v1";

export const explainabilityResultRegistry = [
  {
    modelId: "pi05",
    displayName: "Pi0.5",
    family: "VLA",
    task: "stack_bowls",
    resultVersion: "vla13-events100-pre250-20260819-v1",
    sourceFile:
      process.env.EXPLAINABILITY_PI05_SOURCE_FILE ??
      `${pi05Root}/success_correlation/correlations.json`,
    expectedSourceSha256: "88752050b4813128719b850f15bce93238f0ce7973485968ba1b4aebce73a071",
    expectedSchemaVersion: 2,
    expectedResultCount: 30,
    expectedSuccessCount: 76,
    expectedNonSuccessCount: 24,
    expectedInputSha256: "b3a1daf0ab1c991926a93cd8e8b0b460155bb336f2fb49a8bb67affa0070d918",
    expectedManifestSha256: "f3094cd480d9d266370c03301be76c989528b12c45a83d0bda0779180eeb1dc1",
    preOutcomeSteps: 250,
  },
  {
    modelId: "fastwam",
    displayName: "FastWAM",
    family: "WAM",
    task: "stack_bowls",
    resultVersion: "vla13-events100-pre250-20260819-v1",
    sourceFile:
      process.env.EXPLAINABILITY_FASTWAM_SOURCE_FILE ??
      `${fastWamRoot}/success_correlation/correlations.json`,
    expectedSourceSha256: "8c258696f1835e3d5877f83274baa02c5c150df50f885240be856c0890e17764",
    expectedSchemaVersion: 2,
    expectedResultCount: 30,
    expectedSuccessCount: 12,
    expectedNonSuccessCount: 88,
    expectedInputSha256: "3f3bfdeb76d5978c6e05b4dad9fcb91359616839f02badeae06f71b9ca6980b4",
    expectedManifestSha256: "c78353d56fbe76988600e36495a7a4f1b83ad5977209c21600222f2d8903fb3e",
    preOutcomeSteps: 250,
  },
];

export const explainabilityPublishConfig = {
  bundleVersion: "metric-success-correlation-20260819-v1",
  outputFile:
    process.env.EXPLAINABILITY_OUTPUT_FILE ??
    new URL("../app/data/generated/explainability-results.json", import.meta.url).pathname,
};
