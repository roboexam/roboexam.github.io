"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { T1BenchmarkMetric, T1BenchmarkResults } from "../../data/t1-benchmark-results";
import { benchmarkMetricLabel, benchmarkScoreText } from "./t1-benchmark-table";
import { metricDisplayFormula, metricSummary } from "./metric-presentation";

type Props = {
  metric: T1BenchmarkMetric;
  model: T1BenchmarkResults["models"][number];
  results: T1BenchmarkResults;
  onClose: () => void;
  onMetric: (metricId: string, modelId: string) => void;
};

export function T1BenchmarkMetricDialog({ metric, model, results, onClose, onMetric }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const scope = model.publication ? model.publication.scope : results.scope;
  const resultVersion = model.publication ? model.publication.resultVersion : results.resultVersion;
  const sourceMetric = model.publication?.metricOverrides?.[metric.id];
  const summary = sourceMetric ? metric.definition : metricSummary(metric);
  const relatedIds = metric.id === "overall" ? ["subtask", "vqa"]
    : metric.id === "vqa" ? ["a", "b", sourceMetric ? "c1" : "c"]
    : metric.id === "a" ? ["a1", "a2", "a3"]
      : metric.id === "b" ? ["b1", "b3", "b_interaction"]
        : metric.id === "c" ? ["c1", "c2", "c3"]
          : metric.id === "a1" ? ["count", "color"] : [];
  const related = relatedIds.flatMap((id) => {
    const item = model.publication?.metricOverrides?.[id] ?? results.metrics.find((entry) => entry.id === id);
    return item && typeof model.scores[id] === "number" ? [item] : [];
  });
  const hasScores = (ids: string[]) => ids.every((id) => typeof model.scores[id] === "number" && Number.isFinite(model.scores[id]));
  const appliedFormula = metric.id === "overall" && hasScores(["overall", "subtask", "vqa"])
    ? `0.70 × ${benchmarkScoreText(model.scores.subtask)} + 0.30 × ${benchmarkScoreText(model.scores.vqa)} = ${benchmarkScoreText(model.scores.overall)}`
    : metric.id === "vqa" && hasScores(["vqa", "a", "b", "c"])
      ? `(${benchmarkScoreText(model.scores.a)} + ${benchmarkScoreText(model.scores.b)} + ${benchmarkScoreText(model.scores.c)}) / 3 = ${benchmarkScoreText(model.scores.vqa)}`
      : metric.id === "c" && hasScores(["c", "c1", "c2", "c3"])
        ? `(${benchmarkScoreText(model.scores.c1)} + ${benchmarkScoreText(model.scores.c2)} + ${benchmarkScoreText(model.scores.c3)}) / 3 = ${benchmarkScoreText(model.scores.c)}`
        : null;

  useEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="metricDialog t1bMetricDialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="drawerTop"><div><p className="eyebrow">T1 · Metric definition</p><h2 id={titleId}>{sourceMetric && metric.id === "vqa" ? metric.label : benchmarkMetricLabel(metric)}</h2></div>
      <button type="button" className="closeDialog" onClick={onClose} aria-label="Close metric detail"><X size={22}/></button>
    </div>
    <div className="t1bMetricSummary"><div><span>Model</span><strong>{model.label}</strong></div>
      {hasScores([metric.id]) && <div><strong>{benchmarkScoreText(model.scores[metric.id])}</strong><span>out of 100</span></div>}
    </div>
    <section className="detailBlock"><h3>What it measures</h3><p>{summary}</p></section>
    <section className="detailBlock"><h3>Scoring formula</h3><p className="formula t1bFormula">{metricDisplayFormula(metric.formula)}</p></section>
    {appliedFormula && <section className="detailBlock"><h3>{model.label} calculation</h3><p className="formula t1bFormula t1bAppliedFormula">{appliedFormula}</p></section>}
    <section className="detailBlock"><h3>Aggregation</h3><p>{metric.aggregation}</p></section>
    {summary !== metric.definition && <section className="detailBlock"><h3>Scoring rule</h3><p>{metric.definition}</p></section>}
    {scope && <section className="detailBlock"><h3>Evaluation scope</h3>
      <dl className="t1bMetricScope"><div><dt>Tasks</dt><dd>{scope.taskCount}</dd></div><div><dt>Scenes</dt><dd>{scope.sceneCount}</dd></div>{scope.processSlotCount !== null && <div><dt>Process slots</dt><dd>{scope.processSlotCount}</dd></div>}</dl>
    </section>}
    {related.length > 0 && <section className="detailBlock"><h3>Score components</h3><div className="t1bRelatedMetrics">
      {related.map((item) => <button key={item.id} type="button" onClick={() => onMetric(item.id, model.id)} aria-label={`Define ${benchmarkMetricLabel(item)}`}>
        <span>{benchmarkMetricLabel(item)}</span><strong>{benchmarkScoreText(model.scores[item.id])}</strong><ArrowUpRight size={15} aria-hidden="true"/>
      </button>)}
    </div></section>}
    {resultVersion && <section className="detailBlock t1bMetricVersion"><h3>Result version</h3><p>{resultVersion}</p></section>}
  </dialog>;
}
