const cosmosRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/cosmos_predict2_5_2b/stack_bowls_corrected_v2/metrics_official8_stageb2000_20260810T050325Z";
const ctrlworldRoot =
  "/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810";

export const acwmResultRegistry = [
  {
    modelId: "cosmos_predict_2_5",
    displayName: "Cosmos Predict 2.5",
    task: "stack_bowls",
    resultVersion: "metrics_official8_stageb2000_20260810T050325Z",
    mediaPrefix: "cosmos",
    resultFile:
      process.env.ACWM_COSMOS_RESULT_FILE ?? `${cosmosRoot}/summary/official8_metrics.json`,
    inputManifestFile:
      process.env.ACWM_COSMOS_INPUT_MANIFEST ?? `${cosmosRoot}/inputs/metric_manifest.json`,
  },
  {
    modelId: "ctrlworld",
    displayName: "CtrlWorld",
    task: "stack_bowls",
    resultVersion: "official8-success100-20260810",
    mediaPrefix: "ctrlworld",
    resultFile: process.env.ACWM_CTRLWORLD_RESULT_FILE ?? `${ctrlworldRoot}/aggregate_metrics.json`,
    inputManifestFile:
      process.env.ACWM_CTRLWORLD_INPUT_MANIFEST ?? `${ctrlworldRoot}/inputs/metric_manifest.json`,
    interactionFile:
      process.env.ACWM_CTRLWORLD_INTERACTION_FILE ??
      `${ctrlworldRoot}/metrics/worldarena_interaction_quality/full100/results.json`,
    actionFollowingFile:
      process.env.ACWM_CTRLWORLD_AF_FILE ??
      `${ctrlworldRoot}/metrics/worldarena_action_following/status.json`,
  },
];

export const acwmPublishConfig = {
  bundleVersion: "official8-20260810-v1",
  outputFile:
    process.env.ACWM_OUTPUT_FILE ??
    new URL("../app/data/generated/acwm-results.json", import.meta.url).pathname,
  mediaManifestFile:
    process.env.DASHBOARD_MEDIA_MANIFEST ??
    "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-media/v1-20260819-a5b6a78/manifest.json",
};
