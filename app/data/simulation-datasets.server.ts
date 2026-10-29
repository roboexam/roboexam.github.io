import { createRealDatasetReader } from "./real-datasets.server.ts";

export const SIMULATION_TRAINING_ROOT =
  "/mnt/public_ckp/UniEmbodied-Bench/simulation/dataset/policy_mix24_clean2400_sdk_ee20_25hz_instruction_20261029_v2";
export const SIMULATION_EVALUATION_ROOT =
  "/mnt/public_ckp/UniEmbodied-Bench/simulation/dataset/evaluation24_sdk_ee20_25hz_episode_mp4_instruction_20261029_v3";

export const simulationDatasets = createRealDatasetReader({
  roots: [
    {
      id: "clean2400",
      kind: "robot",
      root: SIMULATION_TRAINING_ROOT,
      label: "Training set · clean2400",
      sourceGroup: "training",
    },
    {
      id: "evaluation600",
      kind: "robot",
      root: SIMULATION_EVALUATION_ROOT,
      sourceGroup: "evaluation",
      indexFile: "EVALUATION_INDEX.json",
    },
  ],
  routePrefix: "simulation-datasets",
  schemaVersion: "roboexam.simulation-datasets.v1",
  refreshMs: 300000,
});
