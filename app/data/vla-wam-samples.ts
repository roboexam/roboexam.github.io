import publishedBundle from "./generated/vla-wam-samples.json" with { type: "json" };

export type VlaWamOutcome = "success" | "half-success" | "failure";

export type VlaWamEvent = {
  count: number;
  event_codes: string[];
  event_spec_version: string;
  flag: boolean;
  status: "computed";
};

export type VlaWamTrajectorySide = {
  ee_path_length_m: number;
  ee_sparc: number;
  ee_speed_mean_m_s: number;
  joint_path_length_rad: number;
  orientation_path_length_rad: number;
};

export type VlaWamSample = {
  id: string;
  seed: number;
  outcome: VlaWamOutcome;
  success: boolean;
  score: number;
  stepCount: number;
  durationSeconds: number | null;
  timing: { iterationsPerSecond: number; wallTotalSeconds: number };
  events: {
    taskAdherence: VlaWamEvent;
    objectSlip: VlaWamEvent;
    environmentCollision: VlaWamEvent;
    selfCollision: VlaWamEvent;
  };
  trajectory: { left: VlaWamTrajectorySide; right: VlaWamTrajectorySide };
  totals: { joint_path_length_rad: number; orientation_path_length_rad: number };
  media: {
    url: string;
    sha256: string;
    durationSeconds: number;
    frameCount: number;
    frameRate: string;
    width: number;
    height: number;
  };
};

export type VlaWamSampleModel = {
  modelId: string;
  displayName: string;
  family: "VLA" | "WAM";
  task: "stack_bowls";
  resultVersion: string;
  samples: VlaWamSample[];
  provenance: { episodesSha256: string; mediaCatalogSha256: string };
};

export type VlaWamSampleBundle = {
  schemaVersion: "unibench.dashboard.vla-wam-samples.v1";
  bundleVersion: string;
  generatedBy: string;
  models: Record<string, VlaWamSampleModel>;
};

export const vlaWamSampleBundle = publishedBundle as unknown as VlaWamSampleBundle;
