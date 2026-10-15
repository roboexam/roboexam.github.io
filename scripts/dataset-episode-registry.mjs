const episodeRoot = "/mnt/gyc_ckp/benchmark2027/data/episode";

const modelMeta = {
  oracle: { modelId: "oracle", displayName: "Oracle", family: "Oracle", protocolKind: "oracle_gt" },
  pi05: { modelId: "pi05", displayName: "Pi0.5", family: "VLA", protocolKind: "policy_rollout" },
  fastwam: { modelId: "fastwam", displayName: "FastWAM", family: "WAM", protocolKind: "policy_rollout" },
  cosmos: { modelId: "cosmos_predict_2_5", displayName: "Cosmos Predict 2.5", family: "ACWM", protocolKind: "acwm_open_loop" },
  ctrlworld: { modelId: "ctrlworld", displayName: "CtrlWorld", family: "ACWM", protocolKind: "acwm_open_loop" },
};

function source(model, values) {
  return { ...modelMeta[model], ...values };
}

export const datasetEpisodeRegistry = {
  mediaBundleVersion: "formal-three-tasks-v1-20260820",
  mediaBundleDir:
    process.env.DATASET_EPISODE_MEDIA_BUNDLE_DIR ??
    "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-episode-media/formal-three-tasks-v1-20260820",
  stagingRoot:
    process.env.DATASET_EPISODE_STAGING_ROOT ??
    "/mnt/gyc_ckp/benchmark2027/runtime/staging",
  indexOutputFile:
    process.env.DATASET_EPISODE_OUTPUT_FILE ??
    new URL("../app/data/generated/dataset-episodes.json", import.meta.url).pathname,
  chunkOutputDir:
    process.env.DATASET_EPISODE_CHUNK_DIR ??
    new URL("../public/episode-data", import.meta.url).pathname,
  tasks: [
    {
      id: "stack_bowls",
      displayName: "Stack Bowls",
      selectionMode: "seed",
      pairingStatus: "verified_same_seed",
      pairingNote: "五组正式 cohort 的 100-seed 集合完全一致。",
      sources: [
        source("oracle", {
          sourceKind: "stack_oracle",
          resultVersion: "corrected-v2-success100",
          cohortRoot: episodeRoot + "/oracle/stack_bowls_corrected_v2/success",
          alignmentSummary:
            "/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-success100-openloop42f-8gpu-train22-20260810/batch_summary.json",
          summarySha256: "582d830ccb7b961829fb9cb55f0a53a4bc3c96e8c079d052c11ac20fabe27268",
        }),
        source("pi05", {
          sourceKind: "policy_manifest",
          resultVersion: "vla13-events100-20260817-v1",
          cohortRoot: episodeRoot + "/pi05/stack_bowls/vla13_events100_20260817_v1",
          summarySha256: "8e66a9381edfcf37932af891e1aa9f854a3a438b4622fd98f45bd558eb410f2b",
          manifestSha256: "f3094cd480d9d266370c03301be76c989528b12c45a83d0bda0779180eeb1dc1",
        }),
        source("fastwam", {
          sourceKind: "policy_manifest",
          resultVersion: "vla13-events100-20260818-v1",
          cohortRoot: episodeRoot + "/fastwam/stack_bowls/vla13_events100_20260818_v1",
          summarySha256: "7c5dfa7be6dffc2b2a7956f00f9b05ce81a29298278043c172fe3ee4982e9c27",
          manifestSha256: "c78353d56fbe76988600e36495a7a4f1b83ad5977209c21600222f2d8903fb3e",
        }),
        source("cosmos", {
          sourceKind: "acwm_summary",
          resultVersion: "success100-openloop42f-stageb2000-20260810",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/cosmos_predict2_5_2b/stack_bowls_corrected_v2/success100_openloop42f_stageb2000_seed2027_aihc8_20260810T031240Z",
          summarySha256: "4fd0d5aeb8668f57febb809055cf028ba41e5325ad854d224c001a92c7bb99c8",
        }),
        source("ctrlworld", {
          sourceKind: "acwm_summary",
          resultVersion: "success100-openloop42f-20260810",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/ctrlworld/stack_bowls_corrected_v2/ACWM-wjx-ctrlworld-stackbowls-success100-openloop42f-8gpu-train22-20260810",
          summarySha256: "582d830ccb7b961829fb9cb55f0a53a4bc3c96e8c079d052c11ac20fabe27268",
        }),
      ],
    },
    {
      id: "arrange_largest_number",
      displayName: "Arrange Largest Number",
      selectionMode: "source_episode",
      pairingStatus: "source_episode",
      pairingNote: "按 source episode index / run ordinal 对照；requested_seed 不是已验证 simulator seed。",
      sources: [
        source("oracle", {
          sourceKind: "oracle_directory",
          resultVersion: "official100_for_acwm_v1",
          cohortRoot: episodeRoot + "/oracle/arrange_largest_number/official100_for_acwm_v1",
          summarySha256: "1a7ca606bbc32ed874e81575274dcf80896299114fab51f3559ee6466347d246",
        }),
        source("pi05", {
          sourceKind: "policy_manifest",
          resultVersion: "formal100_crosshost_v1",
          cohortRoot: episodeRoot + "/pi05/arrange_largest_number/formal100_crosshost_v1",
          summarySha256: "be01535d14f23ea4795fc79f5f2b5783659cf19ae609555f230bf500bf4c3cd8",
          manifestSha256: "8c98c28a70762eb45826b60f0a97ec62669db4dae807d9ed97ca1b20db25afe9",
          pairingStatus: "requested_seed_only",
        }),
        source("fastwam", {
          sourceKind: "policy_manifest",
          resultVersion: "formal100_40s_crosshost_v2",
          cohortRoot: episodeRoot + "/fastwam/arrange_largest_number/formal100_40s_crosshost_v2",
          summarySha256: "a6641904095554f11350fbc8b09207e56e86230a5ee197a3775add187cf7c5bd",
          manifestSha256: "fd2632b71512dbb97d8fe49bb621f4fc7c4d13c755295feb6f5c0d6d9a1b7846",
          pairingStatus: "requested_seed_only",
        }),
        source("cosmos", {
          sourceKind: "acwm_summary",
          resultVersion: "zeroshot100-openloop42f-a800dev-20260816",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/cosmos_predict2_5/zero_shot_cross_task/arrange_largest_number/ACWM-wjx-cosmos25-arrange-largest-number-zeroshot100-openloop42f-a800dev-20260816",
          summarySha256: "17e5939ff31071d645eff4773e330174c3615368d99d90778582b488242ef6b5",
        }),
        source("ctrlworld", {
          sourceKind: "acwm_summary",
          resultVersion: "zeroshot100-openloop42f-8gpu-20260815",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/ctrlworld/zero_shot_cross_task/arrange_largest_number/ACWM-wjx-ctrlworld-arrange-largest-number-zeroshot100-openloop42f-8gpu-train22-20260815",
          summarySha256: "1376cae4d395ed11b7896c5421fd59c0e6b06634349d2e394f0e9ef71b94b395",
        }),
      ],
    },
    {
      id: "sort_nesting_dolls_by_size",
      displayName: "Sort Nesting Dolls By Size",
      selectionMode: "source_episode",
      pairingStatus: "source_episode",
      pairingNote: "按 source episode index / run ordinal 对照；requested_seed 不是已验证 simulator seed。",
      sources: [
        source("oracle", {
          sourceKind: "oracle_directory",
          resultVersion: "official100_for_acwm_v1",
          cohortRoot: episodeRoot + "/oracle/sort_nesting_dolls_by_size/official100_for_acwm_v1",
          summarySha256: "5ec9019b08b4a5d9f0d639eb3c7401cfc71e0f9b98d40b3fa1fd581efb7ddc2f",
        }),
        source("pi05", {
          sourceKind: "policy_manifest",
          resultVersion: "formal100_crosshost_v1",
          cohortRoot: episodeRoot + "/pi05/sort_nesting_dolls_by_size/formal100_crosshost_v1",
          summarySha256: "994e5c15b7b6600bbd51360859795589cf5b54d7d4c003880641d2acb2481127",
          manifestSha256: "4adb3238319a133152c5b56aa9e21b50fc69f900c5a2cfd33c494aa84e62e210",
          pairingStatus: "requested_seed_only",
        }),
        source("fastwam", {
          sourceKind: "policy_manifest",
          resultVersion: "formal100_40s_crosshost_v2",
          cohortRoot: episodeRoot + "/fastwam/sort_nesting_dolls_by_size/formal100_40s_crosshost_v2",
          summarySha256: "31435abb2433ca3e5610bae4e2f51ea73e8b13280c97bcc79110377516ba0239",
          manifestSha256: "1f6723c4c18f91e3d6e676a19f8b001d83aeb6db6bf9474b78872bb9ef193902",
          pairingStatus: "requested_seed_only",
        }),
        source("cosmos", {
          sourceKind: "acwm_summary",
          resultVersion: "zeroshot100-openloop42f-a800dev-20260816",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/cosmos_predict2_5/zero_shot_cross_task/sort_nesting_dolls_by_size/ACWM-wjx-cosmos25-sort-nesting-dolls-by-size-zeroshot100-openloop42f-a800dev-20260816",
          summarySha256: "73ca6ca2a1c31bec714a2734ee1d077b90e1bd50110b3634c96d7c3d0f56e727",
        }),
        source("ctrlworld", {
          sourceKind: "acwm_summary",
          resultVersion: "zeroshot100-openloop42f-8gpu-20260815",
          cohortRoot:
            "/mnt/gyc_ckp/benchmark2027/ctrlworld/zero_shot_cross_task/sort_nesting_dolls_by_size/ACWM-wjx-ctrlworld-sort-nesting-dolls-by-size-zeroshot100-openloop42f-8gpu-train22-20260815",
          summarySha256: "cd8b29f707b7277b69fea98a78db08f3baeaaa1115bb0bad20980d67fcaadeaa",
        }),
      ],
    },
  ],
};
