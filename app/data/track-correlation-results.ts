import { acwmDashboardBundle } from "./acwm-results.ts";
import { explainabilityDashboardBundle } from "./explainability-results.ts";
import { metricInfo } from "./metric-definitions.ts";
import type { PearsonMetricMatrix, PearsonModelId } from "./pearson-matrix-results.ts";
import { t1BenchmarkResults } from "./t1-benchmark-results.ts";
import { tracks } from "./metric-plan.ts";
import { vlaWamDashboardBundle } from "./vla-wam-results.ts";

export type CurrentCorrelationMetric = {
  metricId: string;
  displayName: string;
  r: number;
  sampleCount: number;
};

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : null;
}

const outcomeDerivedT1Metrics = new Set(["overall", "subtask", "success"]);
const t1Models = t1BenchmarkResults.models.map((model) => {
  const episodes = t1BenchmarkResults.episodes.filter((episode) => episode.modelId === model.id);
  const metrics = t1BenchmarkResults.metrics.flatMap((metric): CurrentCorrelationMetric[] => {
    if (outcomeDerivedT1Metrics.has(metric.id)) return [];
    const pairs = episodes.flatMap((episode): Array<[number, number]> => {
      const metricValue = episode.scores[metric.id];
      const targetValue = episode.execution.subtask;
      return typeof metricValue === "number" && typeof targetValue === "number"
        ? [[metricValue, targetValue]]
        : [];
    });
    const r = pearson(pairs.map(([value]) => value), pairs.map(([, target]) => target));
    return r === null ? [] : [{
      metricId: metric.id,
      displayName: metric.label,
      r,
      sampleCount: pairs.length,
    }];
  }).sort((left, right) => Math.abs(right.r) - Math.abs(left.r));
  return {
    modelId: model.id,
    displayName: model.label,
    episodeCount: episodes.length,
    strictSuccessCount: episodes.filter((episode) => episode.execution.success === true).length,
    target: "Episode subtask completion",
    metrics,
  };
});

const acwmModelIds: Record<string, PearsonModelId> = {
  "Cosmos Predict 2.5": "cosmos_predict2_5",
  CtrlWorld: "ctrlworld",
};

const t2Matrices = Object.entries(acwmDashboardBundle.models).map(([displayName, model]): PearsonMetricMatrix => {
  const samples = model.samples.filter((sample) => sample.heldout73);
  const metricIds = Object.keys(samples[0]?.values ?? {}).filter((metricId) => {
    const values = samples.map((sample) => Number(sample.values[metricId]));
    return values.every(Number.isFinite) && new Set(values).size > 1;
  });
  const values = metricIds.map((leftMetric) => metricIds.map((rightMetric) => {
    const left = samples.map((sample) => Number(sample.values[leftMetric]));
    const right = samples.map((sample) => Number(sample.values[rightMetric]));
    const r = pearson(left, right);
    if (r === null) throw new Error(`Undefined T2 correlation: ${displayName} ${leftMetric}/${rightMetric}`);
    return r;
  }));
  return {
    modelId: acwmModelIds[displayName],
    displayName,
    family: "ACWM",
    episodeCount: samples.length,
    split: "heldout73",
    metricIds,
    metricLabels: metricIds.map((metricId) => metricInfo[metricId]?.name ?? metricId),
    values,
    outcomeFieldsExcluded: true,
  };
});

const t3Models = Object.entries(explainabilityDashboardBundle.models).map(([modelId, model]) => ({
  modelId,
  resultVersion: model.resultVersion,
  leaderboardResultVersion: vlaWamDashboardBundle.models[modelId]?.resultVersion ?? null,
  inputManifestAligned:
    model.provenance.inputManifestSha256 === vlaWamDashboardBundle.models[modelId]?.provenance.inputManifestSha256,
  episodeCount: model.cohort.episodes,
  successCount: model.cohort.success,
}));

const t4 = tracks.find((track) => track.id === "T4")!;

export const trackCorrelationResults = {
  schemaVersion: "roboexam.dashboard.track-correlations.v1",
  T1: {
    resultVersion: t1BenchmarkResults.resultVersion,
    episodeCount: t1BenchmarkResults.episodes.length,
    target: "episode-subtask-completion",
    strictSuccessCorrelationAvailable: false,
    strictSuccessReason: "Only one GPT-6.1-sol episode and no DeepSeek episode has strict success, so success correlation is not estimable.",
    models: t1Models,
  },
  T2: {
    protocol: acwmDashboardBundle.protocol,
    relationship: "metric-to-metric",
    successCorrelationAvailable: false,
    reason: "The published ACWM cohort contains oracle-success futures and no variable downstream policy outcome.",
    resultVersions: Object.fromEntries(Object.entries(acwmDashboardBundle.models).map(([name, model]) => [name, model.resultVersion])),
    matrices: t2Matrices,
  },
  T3: {
    relationship: "metric-to-episode-success",
    models: t3Models,
  },
  T4: {
    relationship: "unavailable",
    reason: "No formal hardware trial scores or paired episode-level metric records have been published.",
    models: t4.models.map((model) => ({ ...model })),
  },
} as const;
