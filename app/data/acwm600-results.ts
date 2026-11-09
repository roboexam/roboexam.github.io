import summary from './generated/acwm600-summary.json' with { type: 'json' };

export type ReaderVersion = 'v5' | 'v4';
export type AValues = Record<string, number | null>;
export type BValues = {
  armFrames: number;
  sourceSha256: string;
  position: { mae: number; valid: number; expected: number };
  rotation: { mae: number; valid: number; expected: number };
};
export type Acwm600Case = {
  id: string; task: string; family: string;
  predictionSha256: string; timeSha256: string; generationSha256: string;
  a: AValues; b: Record<ReaderVersion, BValues>;
};
export type Acwm600Model = {
  id: string; label: string; checkpoint: string; sha256: string;
  groups: Record<string, { a: AValues; a3Scope: string; count: number; b: Record<ReaderVersion, BValues> }>;
  cases: Acwm600Case[];
};
export type Acwm600Bundle = {
  schema: string; version: string; protocol: string; split: string;
  gridSeconds: number; excludeT0: boolean;
  readers: Record<ReaderVersion, string>;
  acceptedAt: string; readerLimitedTasks: string[]; readerLimits: string;
  evaluator: { id: string; sha256: string }[];
  models: Acwm600Model[]; sources: { id: string; sha256: string }[];
};
export type Acwm600Summary = Omit<Acwm600Bundle, 'models'> & {
  fullBundleSha256: string;
  models: (Omit<Acwm600Model, 'cases'> & { caseCount: number })[];
};
export const acwm600 = summary as Acwm600Summary;
export const aColumns = [
  { id: 'A1', name: 'PSNR', unit: 'dB', direction: '↑', note: 'Future-frame micro mean' },
  { id: 'A2', name: 'SSIM', unit: '', direction: '↑', note: 'Future-frame micro mean' },
  { id: 'JEPA', name: 'JEPA similarity', unit: '', direction: '↑', note: '集合级 / set-level' },
  { id: 'JEDi', name: 'JEDi distance', unit: '', direction: '↓', note: '与 JEPA 同一集合分布结果' },
  { id: 'A4', name: 'Motion Smoothness', unit: '', direction: '↑', note: 'A4 · Frozen future-only triples · case macro' },
  { id: 'A5', name: 'M-MSE', unit: '', direction: '↓', note: 'Pooled numerator / denominator · η=0.01' },
  { id: 'A6', name: 'Subject Consistency', unit: '', direction: '↑', note: 'A6 · Frozen motion gate · case macro' },
] as const;
export const regimeNames: Record<string, string> = { ID: 'ID', V: 'Visual OOD', S: 'Semantic OOD', B: 'Behavioral OOD', REC: 'Recovery' };

const compositeMetrics = [
  { key: 'A1', direction: 'higher' },
  { key: 'A2', direction: 'higher' },
  { key: 'JEPA', direction: 'higher' },
  { key: 'JEDi', direction: 'lower' },
  { key: 'A4', direction: 'higher' },
  { key: 'A5', direction: 'lower' },
  { key: 'A6', direction: 'higher' },
] as const;

function geometricMean(values: number[]) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

/**
 * Direction-aware 0–100 score for the frozen nine-metric T2 comparison.
 * Each metric is normalized against the geometric mean of the three methods
 * in the selected scope, then all seven A metrics and two B metrics are
 * averaged equally. Native values remain available beside this score.
 */
export function compositeScores(scope: string, reader: ReaderVersion = 'v5') {
  return compositeScoresFor(acwm600.models, scope, reader);
}

/** Same normalisation as `compositeScores`, for an explicit model cohort. */
export function compositeScoresFor(models: Acwm600Summary['models'], scope: string, reader: ReaderVersion = 'v5'): Record<string, number | null> {
  const groups = models.map(model => model.groups[scope]);
  const anchors = compositeMetrics.map(({ key }) => geometricMean(
    groups.map(group => group.a[key]).filter((value): value is number => typeof value === 'number' && value > 0),
  ));
  const positionAnchor = geometricMean(groups.map(group => group.b[reader].position.mae));
  const rotationAnchor = geometricMean(groups.map(group => group.b[reader].rotation.mae));

  return Object.fromEntries(models.map(model => {
    const group = model.groups[scope];
    const metricScores = compositeMetrics.map(({ key, direction }, index) => {
      const value = group.a[key];
      const anchor = anchors[index];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
      return direction === 'higher' ? 100 * value / (value + anchor) : 100 * anchor / (value + anchor);
    }).filter((value): value is number => value !== null);
    const position = group.b[reader].position.mae;
    const rotation = group.b[reader].rotation.mae;
    if (Number.isFinite(position) && position > 0) metricScores.push(100 * positionAnchor / (positionAnchor + position));
    if (Number.isFinite(rotation) && rotation > 0) metricScores.push(100 * rotationAnchor / (rotationAnchor + rotation));
    return [model.id, metricScores.length === 9
      ? metricScores.reduce((sum, value) => sum + value, 0) / metricScores.length
      : null];
  }));
}

export function casesInScope(model: Acwm600Model, scope: string) {
  return model.cases.filter(row => scope === 'ALL' || (scope.startsWith('task/')
    ? row.task === scope.slice(5) : row.family === scope.slice(7)));
}
