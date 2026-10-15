const pi05Root =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/pi05/stack_bowls/pi05-stack-bowls-vla13-events100-20260817-v1/final_vla13_eval";
const fastWamRoot =
  "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/fastwam/stack_bowls/fastwam-stack-bowls-vla13-events100-formal-20260818-v1/final_vla13_eval";

export const vlaWamSampleRegistry = [
  {
    modelId: "pi05",
    displayName: "Pi0.5",
    family: "VLA",
    task: "stack_bowls",
    resultVersion: "vla13-events100-20260817-v1",
    episodesFile: process.env.VLA_PI05_EPISODES_FILE ?? `${pi05Root}/episodes.jsonl`,
    mediaCatalogFile:
      process.env.VLA_PI05_MEDIA_CATALOG_FILE ??
      new URL("../public/episode-data/stack_bowls--pi05--vla13-events100-20260817-v1.json", import.meta.url).pathname,
    expectedEpisodesSha256: "77eda50fbc9b1462314faa5eaf61056e4456066cbfcbe105b23b59f7e68cf1de",
    expectedMediaCatalogSha256: "a9a07d1ce25f9b6d754c47f671e807fa24027b3a4302185eb9d67080a327c074",
    sampleSeeds: [1, 11, 12, 14, 15, 0, 10, 210, 110, 159],
  },
  {
    modelId: "fastwam",
    displayName: "FastWAM",
    family: "WAM",
    task: "stack_bowls",
    resultVersion: "vla13-events100-20260818-v1",
    episodesFile: process.env.VLA_FASTWAM_EPISODES_FILE ?? `${fastWamRoot}/episodes.jsonl`,
    mediaCatalogFile:
      process.env.VLA_FASTWAM_MEDIA_CATALOG_FILE ??
      new URL("../public/episode-data/stack_bowls--fastwam--vla13-events100-20260818-v1.json", import.meta.url).pathname,
    expectedEpisodesSha256: "140beaa32b29e22441a2c7871aa90115e3d1f78cd8e91553b7eca7aab7012e8e",
    expectedMediaCatalogSha256: "36955730f88746325ba5acccd4882e614dd6ffc0b918b08c6bb83462e682844c",
    sampleSeeds: [12, 13, 23, 0, 11, 14, 1, 10, 15, 18],
  },
];

export const vlaWamSamplePublishConfig = {
  bundleVersion: "vla-wam-formal-samples-20260829-v1",
  outputFile:
    process.env.VLA_WAM_SAMPLE_OUTPUT_FILE ??
    new URL("../app/data/generated/vla-wam-samples.json", import.meta.url).pathname,
};
