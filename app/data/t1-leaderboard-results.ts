import { tracks } from "./metric-plan.ts";
import {
  t1BenchmarkResults,
  type T1BenchmarkResults,
  type T1BenchmarkScores,
} from "./t1-benchmark-results.ts";

// Presentation only. Numeric values are copied from the current published bundle;
// this module does not aggregate episodes or inherit scores from archived protocols.
const emptyScores = (): T1BenchmarkScores => Object.fromEntries(
  t1BenchmarkResults.metrics.map(metric => [metric.id, null]),
);

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
    ...placeholders,
  ],
  tasks: [...t1BenchmarkResults.tasks],
  episodes: t1BenchmarkResults.episodes.map(episode => ({ ...episode, resultVersion: t1BenchmarkResults.resultVersion })),
  metrics: [...t1BenchmarkResults.metrics],
};
