import { tracks } from "./metric-plan.ts";
import { t1AgentResults, type T1Scores } from "./t1-agent-results.ts";
import {
  t1BenchmarkResults,
  type T1BenchmarkMetric,
  type T1BenchmarkResults,
  type T1BenchmarkScores,
} from "./t1-benchmark-results.ts";

// Presentation only. Every number below is read from a published result bundle;
// this module does not aggregate episodes or calculate missing metrics.
const legacyAggregation = "Original Stack Bowls release: five layouts, with the saved question and subgroup aggregation. Values are copied directly from that release.";
const legacyMetric = (id: string, label: string, definition: string, formula: string): T1BenchmarkMetric => ({
  id, label, definition, formula, aggregation: legacyAggregation, unit: "percent",
});
const legacyOverrides: Record<string, T1BenchmarkMetric> = {
  vqa: legacyMetric("vqa", "Initial VQA", "Initial perception, task understanding and full planning under the saved Stack Bowls protocol; process questions are not included.", "(A + B + C1) / 3"),
  a: legacyMetric("a", "Perception", "Initial recognition and localization under the saved Stack Bowls protocol.", "(A1 + A2) / 2"),
  b: legacyMetric("b", "Understanding", "Initial task understanding under the saved Stack Bowls protocol.", "B1"),
  c: legacyMetric("c", "Planning", "Initial full-plan score under the saved Stack Bowls protocol; this value contains only C1.", "C1"),
  a1: legacyMetric("a1", "Recognition", "The saved recognition score combines the count and interior-color questions.", "(count + color) / 2"),
  count: legacyMetric("count", "Counting", "The original bowl-count question score.", "Saved count-question mean"),
  color: legacyMetric("color", "Color", "The original bowl interior-color question score.", "Saved color-question mean"),
};

const emptyScores = (): T1BenchmarkScores => Object.fromEntries([
  ...t1BenchmarkResults.metrics.map(metric => metric.id), "count", "color",
].map(id => [id, null]));

function legacyScores(original: T1Scores): T1BenchmarkScores {
  return {
    ...emptyScores(),
    vqa: original.composite,
    a: original.a, b: original.b, c: original.c,
    a1: original.a1, a2: original.a2, b1: original.b1, c1: original.c1,
    count: original.count, color: original.color,
  };
}

const legacyModels = t1AgentResults.models.filter(model => ["mimo", "gpt6-astra"].includes(model.id)).map(model => ({
  id: model.id,
  label: model.label,
  requestModel: model.requestModel,
  scores: legacyScores(model.scores),
  publication: {
    resultVersion: t1AgentResults.resultVersion,
    sourceModelId: model.id,
    scope: { taskCount: 1, sceneCount: t1AgentResults.task.layoutIds.length, processSlotCount: null },
    metricOverrides: legacyOverrides,
    sourceHashes: { ...t1AgentResults.sourceHashes, scoreReport: t1AgentResults.scorer.reportSha256 },
    scorerPolicy: t1AgentResults.scorer.policy,
    scorerCommit: t1AgentResults.scorer.commit,
  },
}));

const plannedModels = tracks.find(track => track.id === "T1")!.models;
const placeholderLabels: Record<string, string> = {
  "glm-5.3-flash": "GLM 5.3 Flash",
  "minimax-h3.1-preview": "MiniMax H3.1 Preview",
  "Cosmos3-Nano": "Cosmos3-Nano",
};
const placeholders = ["glm-5.3-flash", "minimax-h3.1-preview", "Cosmos3-Nano"].map(id => {
  const planned = plannedModels.find(model => model.id === id);
  if (!planned) throw new Error("Missing original Track 1 model: " + id);
  return {
    id: planned.id, label: placeholderLabels[id], requestModel: planned.id, scores: emptyScores(),
    publication: { resultVersion: null, sourceModelId: planned.id, scope: null },
  };
});

export const t1LeaderboardResults: T1BenchmarkResults = {
  ...t1BenchmarkResults,
  models: [
    ...t1BenchmarkResults.models.map(model => ({
      ...model,
      scores: { ...model.scores },
      publication: {
        resultVersion: t1BenchmarkResults.resultVersion,
        sourceModelId: model.id,
        scope: {
          taskCount: t1BenchmarkResults.scope.taskCount,
          sceneCount: t1BenchmarkResults.scope.sceneCount,
          processSlotCount: t1BenchmarkResults.scope.processSlotCount,
        },
        sourceHashes: t1BenchmarkResults.provenance.sourceHashes,
        scorerPolicy: t1BenchmarkResults.provenance.initialScorerPolicy,
      },
    })),
    ...legacyModels,
    ...placeholders,
  ],
  tasks: [...t1BenchmarkResults.tasks],
  episodes: t1BenchmarkResults.episodes.map(episode => ({ ...episode, resultVersion: t1BenchmarkResults.resultVersion })),
  metrics: [...t1BenchmarkResults.metrics],
};
