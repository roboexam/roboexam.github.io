import raw from './generated/pi05-curated-aggregates.json' with { type: 'json' };
export type Scalar = number | string | null | Record<string, number | null>;
export type CuratedValue = {value: Scalar; n: number; unit: string; primary: string; available: boolean; coverage: number | null; detail: string; micro: unknown};
export type CuratedSample = {id: string; sourceEpisode: string; layoutId: number; seed: number; success: boolean; score: number; values: Record<string, Scalar>; units: Record<string,string>; videos: {camera: string; url: string; sha256: string; durationSeconds: number; frameCount: number; width: number; height: number}[]; reportSha256: string};
export type CuratedTask = {task: string; model: string; split: string; resultVersion: string; protocol: string; episodes: number; successes: number; values: Record<string,CuratedValue>; samples: CuratedSample[]; stageNames: Record<string,string>};
export const pi05Curated = raw as unknown as Record<string, Omit<CuratedTask,'samples'>>;
export function curatedResult(task: string, id: string) {
 const run = pi05Curated[task], m = run?.values[id];
 return {primary: m?.primary ?? '—', detail: m ? `N = ${m.n}${m.coverage == null ? '' : ` · coverage ${(m.coverage * 100).toFixed(1)}%`}${m.detail ? ` · ${m.detail}` : ''}` : 'No validated result for this task and metric.',
 status: m?.available ? 'Computed' : 'N/A', available: m?.available ?? false, version: run?.resultVersion, protocol: run?.protocol};
}
export function sampleDisplay(value: Scalar | undefined, unit = 'rate'): string {
 if (value == null) return 'N/A';
 if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${k}: ${sampleDisplay(v,unit)}`).join(' / ');
 if (typeof value === 'string') return value;
 return unit === 'rate' ? `${(value * 100).toFixed(2)}%` : `${value.toFixed(3)} ${unit}`;
}
