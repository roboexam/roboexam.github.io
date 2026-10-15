const pilotRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/vlm/native/qwen3-vl-8b-instruct/qwen3-vl-8b-instruct-native-l1-pilot1277-v0.2.1-20260829-aihc32";

export const vlmResultRegistry = [
  {
    modelId: "qwen3-vl-8b-instruct",
    displayName: "Qwen3-VL-8B-Instruct",
    resultVersion: "pilot1277-v0.2.1-20260829-aihc32",
    runId: "qwen3-vl-8b-instruct-native-l1-pilot1277-v0.2.1-20260829-aihc32",
    runManifestFile: process.env.VLM_RUN_MANIFEST_FILE ?? `${pilotRoot}/run_manifest.json`,
    configFile: process.env.VLM_CONFIG_FILE ?? `${pilotRoot}/config.json`,
    runtimeStatusFile: process.env.VLM_RUNTIME_STATUS_FILE ?? `${pilotRoot}/runtime_status.json`,
    gateFile: process.env.VLM_GATE_FILE ?? `${pilotRoot}/gate_d_audit.json`,
    summaryFile: process.env.VLM_SUMMARY_FILE ?? `${pilotRoot}/summary.json`,
    publicManifestFile: process.env.VLM_PUBLIC_MANIFEST_FILE ?? `${pilotRoot}/public_manifest.jsonl`,
    predictionsFile: process.env.VLM_PREDICTIONS_FILE ?? `${pilotRoot}/predictions.jsonl`,
    itemScoresFile: process.env.VLM_ITEM_SCORES_FILE ?? `${pilotRoot}/item_scores.jsonl`,
    expectedSha256: {
      runManifest: "826d81e979c363d3d383215bd98bb09f6dcd27f52cc479e1ee3143573d33e470",
      config: "46cfa068d893d047052f5a501d36ce67d05e3c7c6e2b2f2fa2ca519353bcd54a",
      runtimeStatus: "5b31de9c1357d34235146693f032458749a170f46213df9e573fdbe74ca008a7",
      gate: "0270b90880bda8a85ddc9d6a54dd6981b56c1a956b03d234c8ed72fc1e1c07f5",
      summary: "5b4a58669a018653f20bf1ddbe5579acbda073e6ca423e30f6b9fcc04179e8a1",
      publicManifest: "fc5e8b31dfb8d88880c43710c37230673de0340ed9de73e3bc7cc99bc4cf9e42",
      predictions: "1fa774ae84f4eaf397a6976f4161fdbadea8850786dc78ab1c89f0a935c5b190",
      itemScores: "62904e173e9e6efe8451398a4955db780ca56c8b3001985efd45c1cde89dca2b",
    },
  },
];

export const vlmPublishConfig = {
  bundleVersion: "vlm-l1-pilot1277-v0.2.1-samples-v1-20260829",
  outputFile:
    process.env.VLM_OUTPUT_FILE ??
    new URL("../app/data/generated/vlm-results.json", import.meta.url).pathname,
  sampleMediaBundleDir:
    process.env.DASHBOARD_VLM_SAMPLE_BUNDLE_DIR ??
    "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-vlm-l1-samples/pilot1277-v1-20260829",
  sampleMediaUrlPrefix: "/vlm-l1-samples",
};
