"use client";

import { useId, useRef, useState } from "react";
import { t1BenchmarkResults, type T1BenchmarkResults } from "../../data/t1-benchmark-results";
import { T1BenchmarkMetricDialog } from "./t1-benchmark-metric-dialog";
import { T1BenchmarkTable } from "./t1-benchmark-table";
import { T1BenchmarkViewer } from "./t1-benchmark-viewer";

export type T1BenchmarkSelection = { modelId: string; taskId: string; layoutId: number };

export function firstBenchmarkSelection(results: T1BenchmarkResults, modelId: string, taskId?: string): T1BenchmarkSelection {
  const tasks = results.tasks.filter((candidate) => results.episodes.some((episode) => episode.modelId === modelId && episode.taskId === candidate.id));
  const task = tasks.find((candidate) => candidate.id === (taskId ?? "arrange_largest_number")) ?? tasks[0];
  const episodes = results.episodes.filter((candidate) => candidate.modelId === modelId && candidate.taskId === task?.id);
  const layoutId = results.scope.layoutIds.find((id) => episodes.some((episode) => episode.layoutId === id));
  const episode = episodes.find((candidate) => candidate.layoutId === layoutId) ?? episodes[0];
  return { modelId, taskId: task?.id ?? "", layoutId: episode?.layoutId ?? results.scope.layoutIds[0] };
}

export function findBenchmarkEpisode(results: T1BenchmarkResults, selection: T1BenchmarkSelection) {
  return results.episodes.find((episode) => episode.modelId === selection.modelId && episode.taskId === selection.taskId && episode.layoutId === selection.layoutId);
}

export function T1BenchmarkView({ results = t1BenchmarkResults }: { results?: T1BenchmarkResults } = {}) {
  const [selection, setSelection] = useState<T1BenchmarkSelection>(() => firstBenchmarkSelection(results, results.models[0]?.id ?? ""));
  const [detail, setDetail] = useState<{ metricId: string; modelId: string } | null>(null);
  const viewerId = useId();
  const viewer = useRef<HTMLElement>(null);
  const model = results.models.find((item) => item.id === selection.modelId);
  const task = results.tasks.find((item) => item.id === selection.taskId);
  const scenes = results.episodes.filter((episode) => episode.modelId === selection.modelId && episode.taskId === selection.taskId);
  const episode = findBenchmarkEpisode(results, selection);
  const activeMetric = results.metrics.find((metric) => metric.id === detail?.metricId);
  const metricModel = results.models.find((item) => item.id === detail?.modelId);

  function selectModel(modelId: string, scroll = false) {
    setSelection(firstBenchmarkSelection(results, modelId));
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
            {results.tasks.filter((item) => results.episodes.some((candidate) => candidate.modelId === selection.modelId && candidate.taskId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label>Scene<select aria-label="Rollout scene" value={selection.layoutId} onChange={(event) => setSelection({ ...selection, layoutId: Number(event.target.value) })}>
            {scenes.map((item) => <option key={`${item.taskId}:${item.layoutId}`} value={item.layoutId}>{item.layoutId}</option>)}
          </select></label>
        </div>
      </header>
      {episode && model && task && <T1BenchmarkViewer key={`${selection.modelId}:${selection.taskId}:${selection.layoutId}:${results.resultVersion}:${episode.video?.id ?? episode.id}`}
        episode={episode} modelLabel={model.label} taskLabel={task.label} resultVersion={results.resultVersion}/>}
    </section>
    {activeMetric && metricModel && <T1BenchmarkMetricDialog key={`${results.resultVersion}:${metricModel.id}:${activeMetric.id}`}
      metric={activeMetric} model={metricModel} results={results} onClose={() => setDetail(null)} onMetric={onMetric}/>}
  </div>;
}
