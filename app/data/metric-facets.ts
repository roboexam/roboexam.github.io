import type { MetricDefinition, TrackId } from './metric-plan.ts';
import type { ReportMode } from './track-results.ts';

export const evidenceLabels = {
  answers: 'Answers & annotations', video: 'Video / visual readout',
  state: 'State & event logs', motion: 'Motion / control traces',
  paired: 'Paired runs / cohorts', symbolic: 'Symbolic task model',
  manual: 'Human review', artifacts: 'Run artifacts',
} as const;
export const protocolLabels = {
  planned: 'In the plan', alternative: 'Alternative protocol', pending: 'Contract pending', historical: 'Historical contract',
} as const;
export type EvidenceKind = keyof typeof evidenceLabels;
export type ProtocolState = keyof typeof protocolLabels;
export type MetricFacets = { dimension: string; group: string; evidence: EvidenceKind[]; protocol: ProtocolState };

const policyMotion = new Set(['INTENTION_SCORE', 'SPARC', 'LSPARC', 'RSPARC', 'JERK', 'PEAK_SPEED', 'PATH_LENGTH', 'LPATH', 'RPATH', 'TOTAL_PATH', 'EE_DISPLACEMENT', 'PATH_EFFICIENCY', 'TIME_EFFICIENCY', 'ACTION_EFFICIENCY', 'SET', 'LOCAL_TIME', 'IPS', 'WT', 'SPEED_LIMIT_VIOLATION', 'ACCEL_LIMIT_VIOLATION', 'FORCE_LIMIT_VIOLATION', 'ACTION_JITTER']);

export function facetsFor(trackId: TrackId, metric: MetricDefinition, mode: ReportMode = 'plan'): MetricFacets {
  const { id } = metric;
  const group = metric.group.replace(/ · (candidate|pending|diagnostic)$/, '');
  if (mode === 'history' && trackId === 'T2') return { dimension: 'Historical ACWM', group, evidence: ['video'], protocol: 'historical' };
  if (trackId === 'T1') {
    const dimension = id.startsWith('l1a.') ? 'A · Scene & state' : id.startsWith('l1b.') ? 'B · Task-conditioned interaction' : 'C · Planning, task progress & next action';
    const alternative = ['l1a.vsr_topological', 'l1a.text_spatial', 'l1b.reference_mcq', 'l1b.situational'].includes(id);
    const pending = ['l1a.roa', 'l1c.cpe'].includes(id);
    const audit = ['l1c.epr', 'l1c.cgs'].includes(id);
    return { dimension, group, evidence: audit || id === 'l1c.cpe' ? ['answers', 'symbolic'] : ['answers', 'video'], protocol: alternative ? 'alternative' : pending ? 'pending' : 'planned' };
  }
  if (trackId === 'T2') {
    const paired = ['LAC', 'AF-DIV', 'CEE', 'P-OACC', 'BRIER', 'BOUNDARY'].includes(id);
    const state = ['ROBOT_NADE', 'LAC', 'OBJECT_NADE', 'EVENT_F1', 'NO_CONTACT', 'PRIMITIVE', 'CEE', 'P-OACC', 'BRIER', 'BOUNDARY'].includes(id);
    return { dimension: group, group, evidence: ['video', ...(state ? ['state' as const] : []), ...(paired ? ['paired' as const] : [])], protocol: 'planned' };
  }
  if (trackId === 'T4') return {
    dimension: group === 'Task outcome' ? 'Outcome' : group === 'Progress and recovery' ? 'Progress & recovery' : 'Safety & review', group,
    evidence: ['manual', 'video'], protocol: ['TSR', 'SUBGOAL_PROGRESS', 'HUMAN_EVAL', 'HUMAN_INTERVENTION'].includes(id) ? 'planned' : 'pending',
  };
  const dimension = group.startsWith('L2') ? 'L2 · Closed-loop effectiveness' : group.startsWith('L3') ? 'L3 · Stateful execution' : group;
  const context = ['AC', 'N', 'SR95'].includes(id);
  const paired = group === 'X · Generalization' || id === 'ROBUSTNESS' || ['INSTRUCTION_PRIDE', 'INSTRUCTION_SR'].includes(id);
  return { dimension, group, evidence: context ? ['artifacts'] : [...((group === 'L2 · Motion smoothness and efficiency' || policyMotion.has(id)) ? ['motion' as const] : ['state' as const]), ...(paired ? ['paired' as const] : [])], protocol: ['INSTRUCTION_PRIDE', 'ACTION_EFFICIENCY'].includes(id) ? 'pending' : 'planned' };
}

export type MetricFilters = { dimension: string; group: string; evidence: string; protocol: string; query: string };
export const initialMetricFilters: MetricFilters = { dimension: 'all', group: 'all', evidence: 'all', protocol: 'all', query: '' };
export function matchesMetric(metric: MetricDefinition, facets: MetricFacets, filters: MetricFilters) {
  const query = filters.query.trim().toLowerCase();
  return (filters.dimension === 'all' || facets.dimension === filters.dimension)
    && (filters.group === 'all' || facets.group === filters.group)
    && (filters.evidence === 'all' || facets.evidence.some(e => e === filters.evidence))
    && (filters.protocol === 'all' || facets.protocol === filters.protocol)
    && `${metric.id} ${metric.label} ${facets.dimension} ${facets.group} ${metric.note ?? ''}`.toLowerCase().includes(query);
}
