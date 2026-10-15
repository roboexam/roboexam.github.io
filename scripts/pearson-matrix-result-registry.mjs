const resultRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/metrics/correlation/stack_bowls/stack-bowls-existing-metrics-pearson-20260829-v2";

export const pearsonMatrixResultRegistry = {
  resultVersion: "stack-bowls-existing-metrics-pearson-20260829-v2",
  task: "stack_bowls",
  manifestFile: process.env.PEARSON_MATRIX_MANIFEST_FILE ?? `${resultRoot}/MANIFEST.json`,
  analysisFile: process.env.PEARSON_MATRIX_ANALYSIS_FILE ?? `${resultRoot}/outputs/analysis_summary.json`,
  expectedManifestSha256: "50f9972c79778289a2a3e44eba6f3cc9de87cff0e593f9e06d20913b31d071ec",
  expectedAnalysisSha256: "79ea8238e3e8cef96396a1f99b6f8f663f7d844bdfceb53e3a0d74c8e2f1165b",
  figures: {
    metricVsEpisodeSuccess: {
      file: `${resultRoot}/figures/vla_wam_metric_vs_episode_success.png`,
      expectedSha256: "0ef5c5b52a69ef532c2bec864a439a01f7de32c5e088324d21acb24786e3eca4",
      expectedBytes: 261904,
      expectedWidth: 3214,
      expectedHeight: 1597,
    },
    metricOnlyMatrices: {
      file: `${resultRoot}/figures/all_models_metric_only_pearson_matrices.png`,
      expectedSha256: "7d7a37d718d1f3f08b1de0456ae856bf0769f8acc0e826599b7881188c075f8c",
      expectedBytes: 426867,
      expectedWidth: 3301,
      expectedHeight: 2995,
    },
  },
  matrixFiles: {
    pi05: {
      file: `${resultRoot}/outputs/pi05_pearson_metrics_only.csv`,
      expectedSha256: "20ddf579cbf9c06f21f0167027dcee4815feb8605ba83e268e28e4b69225ad90",
    },
    fastwam: {
      file: `${resultRoot}/outputs/fastwam_pearson_metrics_only.csv`,
      expectedSha256: "021c41223f495a51abfce8cfa1f92d445f25425e7070b82a6845a55cdcf910fb",
    },
    cosmosPredict25: {
      file: `${resultRoot}/outputs/cosmos_predict2_5_pearson_metrics_heldout73.csv`,
      expectedSha256: "52efc913dffc278c376831680f8da47a6fd3acea0cec690e94f60456514e5c8b",
    },
    ctrlworld: {
      file: `${resultRoot}/outputs/ctrlworld_pearson_metrics_heldout73.csv`,
      expectedSha256: "565dff9f5171e2f3e7ce03ec814c0b9801cedad54509ebaf8eb84cc13bd5bb31",
    },
  },
  formalSources: [
    {
      modelId: "pi05",
      file: "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/pi05/stack_bowls/pi05-stack-bowls-vla13-events100-20260817-v1/final_vla13_eval/episodes.jsonl",
      expectedSha256: "77eda50fbc9b1462314faa5eaf61056e4456066cbfcbe105b23b59f7e68cf1de",
    },
    {
      modelId: "fastwam",
      file: "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/fastwam/stack_bowls/fastwam-stack-bowls-vla13-events100-formal-20260818-v1/final_vla13_eval/episodes.jsonl",
      expectedSha256: "140beaa32b29e22441a2c7871aa90115e3d1f78cd8e91553b7eca7aab7012e8e",
    },
    {
      modelId: "cosmos_predict2_5",
      file: "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/cosmos_predict2_5_2b/stack_bowls_corrected_v2/metrics_official8_stageb2000_20260810T050325Z/summary/official8_metrics.json",
      expectedSha256: "26d41a3105db304a32520981318953679c4a7dbab440b41191e5897c4ac7ca32",
    },
    {
      modelId: "ctrlworld",
      file: "/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-official8-success100-20260810/aggregate_metrics.json",
      expectedSha256: "fcafdb45d0dbfa025c04558e903940cfd7405fc46b30f2e9c87dbe91d29cf30c",
    },
  ],
};

const publicRoot = new URL("../public/analysis/stack-bowls-pearson-20260829/", import.meta.url).pathname;

export const pearsonMatrixPublishConfig = {
  bundleVersion: "stack-bowls-pearson-20260829-v3",
  outputFile:
    process.env.PEARSON_MATRIX_OUTPUT_FILE ??
    new URL("../app/data/generated/pearson-matrix-results.json", import.meta.url).pathname,
  figures: {
    metricVsEpisodeSuccess: {
      outputFile:
        process.env.PEARSON_SUCCESS_PUBLIC_FIGURE_FILE ??
        `${publicRoot}vla-wam-metric-vs-episode-success.png`,
      url: "/analysis/stack-bowls-pearson-20260829/vla-wam-metric-vs-episode-success.png",
    },
    metricOnlyMatrices: {
      outputFile:
        process.env.PEARSON_MATRIX_PUBLIC_FIGURE_FILE ??
        `${publicRoot}all-models-metric-only-pearson-matrices.png`,
      url: "/analysis/stack-bowls-pearson-20260829/all-models-metric-only-pearson-matrices.png",
    },
  },
};
