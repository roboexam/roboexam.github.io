import { curatedResult } from './pi05-curated.ts';
import { acwmDashboardBundle } from './acwm-results.ts';
import { l1Phase1ProvisionalBundle } from './l1-phase1-provisional.ts';
import { vlaWamDashboardBundle } from './vla-wam-results.ts';
import { metricInfo, type MetricInfo } from './metric-definitions.ts';
import { tracks, type MetricDefinition, type TrackId } from './metric-plan.ts';

export type ReportMode = 'plan' | 'history';
export type MetricSelection = { trackId: TrackId; mode: ReportMode; metricId: string; modelId: string; taskId?: string; setting?: string };
export type ReportResult = { primary: string; detail: string; status: string; available: boolean; version?: string; protocol?: string };

export const protocolNotes: Record<TrackId, string> = {
  T1: 'VLM design · 07 Sep 2026 · Three dimensions, nine subdimensions. Alternatives, audit subsets, and diagnostics remain labeled.',
  T2: 'ACWM v2 · 13 Sep 2026 · 18 report items. Future frames only; AF-div is auxiliary, and Brier / boundary error are extensions.',
  T3: 'Policy design · Action correctness, local effectiveness, long-horizon execution, and deployment diagnostics. Baseline: Stack Bowls, 100 distinct seeds per model.',
  T4: 'Hardware design · Task success, subgoal progress, and manual review. Three independent evaluators; 1–3 ratings per rubric item. Trials pending.',
};
const pilotLabels: Record<string, string> = {
  'l1a.object_state_f1': 'Object-state F1', 'l1a.llm_alignment': 'Scene semantic alignment',
  'l1a.text_spatial_f1': 'Text spatial F1', 'l1a.mra': 'MRA', 'l1a.roa': 'RoA',
  'l1a.refspatial': 'RefSpatial mask hit', 'l1a.direct': 'Direct grounding', 'l1a.pio_s1': 'Point-It-Out S1',
  'l1b.situational': 'Situational grounding', 'l1b.area_hit_ratio': 'Area hit ratio',
  'l1b.affordance_similarity': 'Affordance similarity', 'l1b.pio_s2': 'Point-It-Out S2', 'l1b.affordance_ap': 'Affordance AP',
  'l1c.stage_accuracy': 'Stage accuracy', 'l1c.next_subgoal_accuracy': 'Next-subgoal accuracy',
  'l1c.stage_macro_f1': 'Stage macro F1', 'l1c.plan_step_f1': 'Plan step F1',
  'l1c.plan_edit_similarity': 'Plan edit similarity', 'l1c.dependency_f1': 'Dependency F1',
  'l1c.bleu1': 'BLEU-1', 'l1c.bleu2': 'BLEU-2', 'l1c.bleu3': 'BLEU-3', 'l1c.bleu4': 'BLEU-4',
  'l1c.planning_llm_alignment': 'Planning semantic alignment',
  'l1d.failure_occurrence_macro_f1': 'Failure occurrence macro F1', 'l1d.failure_type_macro_f1': 'Failure type macro F1',
  'l1d.failure_onset_similarity': 'Failure onset similarity', 'l1d.recovery_subgoal_accuracy': 'Recovery subgoal accuracy',
  'l1d.recovery_plan_score': 'Recovery plan score',
};
export function metricsFor(trackId: TrackId, mode: ReportMode): MetricDefinition[] {
  if (mode === 'history' && trackId === 'T1') return l1Phase1ProvisionalBundle.metrics.map(m => ({
    id: m.metricId, label: pilotLabels[m.metricId], group: `${m.layer} · Historical pilot`, direction: '↑',
    note: m.state.replaceAll('_', ' '),
  }));
  if (mode === 'history' && trackId === 'T2') return Object.entries(acwmDashboardBundle.models['Cosmos Predict 2.5'].values).map(([id, m]) => ({
    id, label: metricInfo[id]?.name ?? id, group: 'Historical ACWM protocol', direction: id === 'AF' ? 'Report' : m.direction === 'higher' ? '↑' : '↓',
  }));
  return tracks.find(t => t.id === trackId)!.metrics;
}
export function readResult({ trackId, mode, metricId, modelId, taskId, setting }: MetricSelection): ReportResult {
  const pending = { primary: '—', detail: 'No validated result for this metric and protocol.', status: 'Pending', available: false };
  if (trackId === 'T3' && setting && setting !== 'id') return pending;
  if (trackId === 'T4') return { ...pending, detail: 'Hardware trial and manual review pending.' };
  // A matching metric name is not evidence of a matching input/scorer contract.
  if ((trackId === 'T1' || trackId === 'T2') && mode !== 'history') return pending;
  if (trackId === 'T1') {
    if (modelId !== 'Cosmos3-Nano') return pending;
    const m = l1Phase1ProvisionalBundle.metrics.find(m => m.metricId === metricId);
    if (!m) return pending;
    const available = m.score !== null && m.state !== 'contract_pending';
    return { primary: available ? `${m.score!.toFixed(2)}%` : '—', detail: `${m.state.replaceAll('_', ' ')} · N = ${m.scoreBearingN}`, status: m.state, available, version: l1Phase1ProvisionalBundle.run.id, protocol: l1Phase1ProvisionalBundle.run.contractVersion };
  }
  if (trackId === 'T2') {
    const model = acwmDashboardBundle.models[modelId];
    const m = model?.values[metricId];
    if (!m) return pending;
    return { primary: m.availability === 'available' ? m.primary : '—', detail: m.availability === 'available' ? m.aux : m.availability.replaceAll('_', ' '), status: m.status, available: m.availability === 'available', version: model.resultVersion, protocol: model.protocol };
  }
  if (trackId === 'T3' && taskId) {
    if (modelId === 'Pi0.5') return curatedResult(taskId, metricId);
    if (taskId !== 'stack_bowls') return pending;
  }
  const model = vlaWamDashboardBundle.models[modelId];
  const m = model?.values[metricId];
  if (!m) return pending;
  return { primary: m.availability === 'available' ? m.primary : '—', detail: metricId === 'AC' ? `Outcome, trajectory, and metadata verified · N = ${m.n}` : m.aux, status: m.status, available: m.availability === 'available', version: model.resultVersion, protocol: model.protocol };
}
export function definitionFor(selection: MetricSelection): MetricInfo {
  const { trackId, mode, metricId } = selection;
  if (trackId === 'T1' && mode === 'history') {
    const m = l1Phase1ProvisionalBundle.metrics.find(m => m.metricId === metricId)!;
    return {
      name: pilotLabels[metricId], definition: 'Historical Stack Bowls development pilot result under the original v0.2 contract.',
      formula: `Frozen pilot scorer: ${metricId}. Aggregation: ${m.aggregationProfile ?? 'contract pending'}.`,
      direction: 'Higher is better under this pilot contract', unit: 'native score × 100',
      evidence: 'Versioned predictions, sample memberships, scorer outputs, and source hashes.',
      source: 'L1 pilot · 02 Sep 2026 · 12 development episodes',
      caveat: 'This pilot does not establish generalization or scores for the September 7 metric plan. Qwen3-VL-8B is the provisional semantic judge, not a competing model. Human GT review has not started.',
    };
  }
  const info = metricInfo[metricId];
  if (trackId === 'T2' && mode === 'history') return {
    ...info, source: 'Historical ACWM run · Stack Bowls · heldout73 (primary), all100 (diagnostic)',
    formula: metricId === 'PSNR' ? '10 × log10(1 / (pooled split MSE + 1e−8))' : metricId === 'JEPA' ? 'Frozen split-level JEPA evaluator; see versioned source provenance.' : info.formula,
    caveat: 'Original per-metric frame contract: 1 conditioning + 38 future frames, 39 valid / 42 stored, 320×256, 25/6 FPS. Reference-free IQ uses 38 future frames. Not a result for the future-only v2 metric plan.',
  };
  if (trackId === 'T4') return { ...info, evidence: 'Synchronized trial video, operator event log, task checklist, timestamps, and an adjudicated manual rubric.', caveat: [info.caveat, 'Hardware-only report. Video or manual evidence must support the decision; unobservable telemetry remains unavailable.'].filter(Boolean).join(' ') };
  return info;
}
