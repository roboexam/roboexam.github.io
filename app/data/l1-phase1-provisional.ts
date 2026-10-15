import publishedBundle from "./generated/l1-phase1-provisional.json" with { type: "json" };

export type L1Phase1MetricState =
  | "scored"
  | "scored_provisional_gt"
  | "scored_provisional_judge"
  | "scored_with_contract_pending"
  | "contract_pending";

export type L1Phase1Metric = {
  metricId: string;
  layer: "L1-A" | "L1-B" | "L1-C" | "L1-D";
  score: number | null;
  rawScore: number | null;
  state: L1Phase1MetricState;
  scoreTier: string;
  lane: "deterministic" | "judge";
  scoreBearingN: number;
  membershipN: number;
  terminalCounts: Record<string, number>;
  aggregationProfile: string | null;
};

export type L1Phase1Example = {
  canonicalSampleId: string;
  taskId: "stack_bowls";
  episodeBlueprintId: string;
  seed: number;
  split: string;
  instruction: string;
  question: string;
  queryType: string;
  promptFamily: string;
  camera: string;
  frameIndices: number[];
  media: Array<{
    url: string;
    sha256: string;
    frameIndex: number;
  }>;
  metricMemberships: string[];
  reviewStatus: "automated_binding_verified" | "human_verified";
};

export type L1Phase1ProvisionalBundle = {
  schemaVersion: "unibench.dashboard.l1-phase1-provisional.v3";
  bundleVersion: string;
  generatedAt: string;
  run: {
    id: string;
    status: "PASS";
    testedModel: "nvidia/Cosmos3-Nano";
    predictionCount: number;
    predictionSha256: string;
    contractVersion: string;
    resultTier: "provisional";
    publishScope: "internal_development_only";
    humanGtReview: "not_started";
    judgeModel: "Qwen/Qwen3-VL-8B-Instruct";
    judgeHumanCalibration: "waived_for_provisional_run";
    generalizationScope: string;
    crossLayerTotal: "forbidden";
  };
  coverage: {
    membershipCount: number;
    nonNotApplicableMembershipCount: number;
    scoreBearingMembershipCount: number;
    scoreBearingFraction: number;
    metricCount: number;
    numericMetricCount: number;
    terminalCounts: Record<string, number>;
    infrastructureFailureCount: number;
  };
  layers: Record<"L1-A" | "L1-B" | "L1-C" | "L1-D", {
    metricCount: number;
    numericMetricCount: number;
    pendingMetricCount: number;
  }>;
  metrics: L1Phase1Metric[];
  examples: L1Phase1Example[];
  exampleByMetricId: Record<string, string>;
  blockers: string[];
  forbiddenClaims: string[];
  sourceHashes: Record<string, string>;
};

export const l1Phase1ProvisionalBundle = publishedBundle as unknown as L1Phase1ProvisionalBundle;
