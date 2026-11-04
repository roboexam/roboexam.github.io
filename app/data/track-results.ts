import { isPolicyBaselineModel, policyBaselineResult, type PolicySetting } from './policy-baselines.ts';
import { acwmDashboardBundle } from './acwm-results.ts';
import { vlaWamDashboardBundle } from './vla-wam-results.ts';
import { metricInfo, type MetricInfo } from './metric-definitions.ts';
import { tracks, type MetricDefinition, type TrackId } from './metric-plan.ts';

export type ReportMode = 'plan' | 'history';
export type MetricSelection = { trackId: TrackId; mode: ReportMode; metricId: string; modelId: string; taskId?: string; setting?: string };
export type ReportResult = {
  primary: string; detail: string; status: string; available: boolean;
  version?: string; protocol?: string; sampleCount?: number; cohort?: string;
};

export const protocolNotes: Record<TrackId, string> = {
  T1: 'VLM design · 07 Sep 2026 · Three dimensions, nine subdimensions. Alternatives, audit subsets, and diagnostics remain labeled.',
  T2: 'ACWM v2 · 13 Sep 2026 · 18 report items. Future frames only; AF-div is auxiliary, and Brier / boundary error are extensions.',
  T3: 'Policy design · Action correctness, local effectiveness, long-horizon execution, and deployment diagnostics. Baseline: Stack Bowls, 100 distinct seeds per model.',
  T4: 'Hardware design · Task success, subgoal progress, and manual review. Three independent evaluators; 1–3 ratings per rubric item. Trials pending.',
};
export function metricsFor(trackId: TrackId, mode: ReportMode): MetricDefinition[] {
  if (mode === 'history' && trackId === 'T2') return Object.entries(acwmDashboardBundle.models['Cosmos Predict 2.5'].values).map(([id, m]) => ({
    id, label: metricInfo[id]?.name ?? id, group: 'Historical ACWM protocol', direction: id === 'AF' ? 'Report' : m.direction === 'higher' ? '↑' : '↓',
  }));
  return tracks.find(t => t.id === trackId)!.metrics;
}
export function readResult({ trackId, mode, metricId, modelId, taskId, setting }: MetricSelection): ReportResult {
  const pending = { primary: '—', detail: 'No validated result for this metric and protocol.', status: 'Pending', available: false };
  if (trackId === 'T3' && setting === 'recovery') return pending;
  if (trackId === 'T4') return { ...pending, detail: 'Hardware trial and manual review pending.' };
  // A matching metric name is not evidence of a matching input/scorer contract.
  if (trackId === 'T1' || (trackId === 'T2' && mode !== 'history')) return pending;
  if (trackId === 'T2') {
    const model = acwmDashboardBundle.models[modelId];
    const m = model?.values[metricId];
    if (!m) return pending;
    const cohort = acwmDashboardBundle.primarySplit.split(' ')[0];
    return { primary: m.availability === 'available' ? m.primary : '—', detail: m.availability === 'available' ? m.aux : m.availability.replaceAll('_', ' '), status: m.status, available: m.availability === 'available', version: model.resultVersion, protocol: model.protocol, sampleCount: m.groups[cohort]?.sampleCount, cohort };
  }
  if (trackId === 'T3' && taskId) {
    if (isPolicyBaselineModel(modelId)) return policyBaselineResult(modelId, taskId, metricId, (setting ?? 'id') as PolicySetting);
    return pending;
  }
  const model = vlaWamDashboardBundle.models[modelId];
  const m = model?.values[metricId];
  if (!m) return pending;
  return { primary: m.availability === 'available' ? m.primary : '—', detail: metricId === 'AC' ? `Outcome, trajectory, and metadata verified · N = ${m.n}` : m.aux, status: m.status, available: m.availability === 'available', version: model.resultVersion, protocol: model.protocol, sampleCount: m.n || undefined, cohort: `${model.cohort.uniqueSeeds}-seed` };
}
export function definitionFor(selection: MetricSelection): MetricInfo {
  const { trackId, mode, metricId } = selection;
  const info = metricInfo[metricId];
  if (trackId === 'T2' && mode === 'history') return {
    ...info, source: 'Historical ACWM run · Stack Bowls · heldout73 (primary), all100 (diagnostic)',
    formula: metricId === 'PSNR' ? '10 × log10(1 / (pooled split MSE + 1e−8))' : metricId === 'JEPA' ? 'Frozen split-level JEPA evaluator; see versioned source provenance.' : info.formula,
    caveat: 'Original per-metric frame contract: 1 conditioning + 38 future frames, 39 valid / 42 stored, 320×256, 25/6 FPS. Reference-free IQ uses 38 future frames. Not a result for the future-only v2 metric plan.',
  };
  if (trackId === 'T4') return { ...info, evidence: 'Synchronized trial video, operator event log, task checklist, timestamps, and an adjudicated manual rubric.', caveat: [info.caveat, 'Hardware-only report. Video or manual evidence must support the decision; unobservable telemetry remains unavailable.'].filter(Boolean).join(' ') };
  return info;
}
