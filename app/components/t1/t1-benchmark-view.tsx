"use client";

import { useId, useRef, useState } from "react";
import type { T1BenchmarkResults } from "../../data/t1-benchmark-results";
import { t1LeaderboardResults } from "../../data/t1-leaderboard-results";
import { T1BenchmarkMetricDialog } from "./t1-benchmark-metric-dialog";
import { T1BenchmarkTable } from "./t1-benchmark-table";
import { T1BenchmarkEmptyViewer, T1BenchmarkSceneGallery, T1BenchmarkViewer } from "./t1-benchmark-viewer";
import { T1BenchmarkEpisodeVqa } from "./t1-benchmark-episode-vqa";

export type T1BenchmarkSelection = { modelId: string; taskId: string; layoutId: number };

export function benchmarkModelEpisodes(results: T1BenchmarkResults, modelId: string) {
  const model = results.models.find((candidate) => candidate.id === modelId);
  const version = model?.publication ? model.publication.resultVersion : results.resultVersion;
  return results.episodes.filter((episode) => episode.modelId === modelId && (episode.resultVersion ?? results.resultVersion) === version);
}

export function firstBenchmarkSelection(results: T1BenchmarkResults, modelId: string, taskId?: string): T1BenchmarkSelection {
  const task = results.tasks.find((candidate) => candidate.id === (taskId ?? "arrange_largest_number")) ?? results.tasks[0];
  const layoutIds = benchmarkTaskLayoutIds(results, task?.id ?? "");
  return { modelId, taskId: task?.id ?? "", layoutId: layoutIds[0] ?? results.scope.layoutIds[0] };
}

// Scene positions describe the shared task scope; clips and facts still join by model.
// The scope's layoutIds is a union, so different tasks can have different five scenes.
export function benchmarkTaskLayoutIds(results: T1BenchmarkResults, taskId: string): number[] {
  const admitted = new Set(results.episodes.filter((episode) => episode.taskId === taskId &&
    (episode.resultVersion ?? results.resultVersion) === results.resultVersion).map((episode) => episode.layoutId));
  return results.scope.layoutIds.filter((id) => admitted.has(id));
}

export function findBenchmarkEpisode(results: T1BenchmarkResults, selection: T1BenchmarkSelection) {
  return benchmarkModelEpisodes(results, selection.modelId).find((episode) => episode.taskId === selection.taskId && episode.layoutId === selection.layoutId);
}

export function T1BenchmarkView({ results = t1LeaderboardResults }: { results?: T1BenchmarkResults } = {}) {
  const [selection, setSelection] = useState<T1BenchmarkSelection>(() => firstBenchmarkSelection(results, results.models[0]?.id ?? ""));
  const [detail, setDetail] = useState<{ metricId: string; modelId: string } | null>(null);
  const viewerId = useId();
  const viewer = useRef<HTMLElement>(null);
  const model = results.models.find((item) => item.id === selection.modelId);
  const task = results.tasks.find((item) => item.id === selection.taskId);
  const ownEpisodes = benchmarkModelEpisodes(results, selection.modelId);
  const scenes = benchmarkTaskLayoutIds(results, selection.taskId).map((layoutId) => ({
    layoutId,
    episode: ownEpisodes.find((candidate) => candidate.taskId === selection.taskId && candidate.layoutId === layoutId),
  }));
  const episode = findBenchmarkEpisode(results, selection);
  const metricModel = results.models.find((item) => item.id === detail?.modelId);
  const activeMetric = (detail && metricModel?.publication?.metricOverrides?.[detail.metricId]) ?? results.metrics.find((metric) => metric.id === detail?.metricId);
  const playbackVersion = episode?.resultVersion ?? results.resultVersion;

  function selectModel(modelId: string, scroll = false) {
    setSelection(firstBenchmarkSelection(results, modelId, selection.taskId));
    if (scroll) viewer.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  const onMetric = (metricId: string, modelId: string) => setDetail({ metricId, modelId });

  return <div className="t1Benchmark">
    <header className="t1bHeading"><div><p className="eyebrow">VLM agents · Shared harness</p><h2>Model performance</h2></div></header>
    <T1BenchmarkTable models={results.models} metrics={results.metrics} selectedModelId={selection.modelId}
      viewerId={viewerId} onSelectModel={(modelId) => selectModel(modelId, true)} onMetric={onMetric}/>
    <section className="t1bViewerSection" ref={viewer} id={viewerId} aria-labelledby={`${viewerId}-title`}>
      <header className="t1bViewerHeading"><div><p className="eyebrow">Saved executions</p><h3 id={`${viewerId}-title`}>Explore rollouts</h3></div>
        <div className="t1bViewerControls">
          <label>Model<select aria-label="Rollout model" value={selection.modelId} onChange={(event) => selectModel(event.target.value)}>
            {results.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label>Task<select aria-label="Rollout task" value={selection.taskId} onChange={(event) => setSelection(firstBenchmarkSelection(results, selection.modelId, event.target.value))}>
            {results.tasks.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
        </div>
      </header>
      {model && task && <>
        <T1BenchmarkSceneGallery key={`${selection.modelId}:${selection.taskId}`} scenes={scenes}
          selectedLayoutId={selection.layoutId} onSelect={(layoutId) => setSelection({ ...selection, layoutId })}/>
        {episode ? <T1BenchmarkViewer key={`${selection.modelId}:${selection.taskId}:${selection.layoutId}:${playbackVersion}:${episode.video?.id ?? episode.id}`}
          episode={episode} modelLabel={model.label} taskLabel={task.label} resultVersion={playbackVersion}/>
          : <T1BenchmarkEmptyViewer modelLabel={model.label} taskLabel={task.label}/>}
        {episode && <T1BenchmarkEpisodeVqa key={`${selection.modelId}:${selection.taskId}:${selection.layoutId}:${playbackVersion}:${episode.attempt}`}
          episode={episode} modelLabel={model.label} taskLabel={task.label} resultVersion={playbackVersion}/>}
      </>}
    </section>
    {activeMetric && metricModel && <T1BenchmarkMetricDialog key={`${results.resultVersion}:${metricModel.id}:${activeMetric.id}`}
      metric={activeMetric} model={metricModel} results={results} onClose={() => setDetail(null)} onMetric={onMetric}/>}
  </div>;
}
