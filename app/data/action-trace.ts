export type ActionTraceSource = { url: string; bindingSha256: string; manifestSha256: string } | { unavailable: string };
export type ActionSeries = {
  unit: string; labels: string[]; t?: number[]; left: number[][] | null; right: number[][] | null;
};
export type ActionTrace = {
  schemaVersion: "roboexam.action-trace.v1";
  episodeId: string;
  clock: { dataset: string; unit: "seconds"; sourceFrames: number; samples: number; label?: string };
  t: number[];
  jointPosition: { unit: "rad"; left: number[][] | null; right: number[][] | null };
  endEffectorPosition: { unit: "m"; frame: "world" | "source"; left: number[][] | null; right: number[][] | null };
  action?: ActionSeries;
  provenance: { manifestSha256: string; trajectorySha256: string | null; datasets: string[];
    bindingSha256?: string; expectedTrajectorySha256?: string | null; sourceFormat?: string;
    bindingMethod?: string; missing?: string[] };
};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
/** Reject stale identity, invalid clocks/arrays and non-finite values before plotting. */
export function validateActionTrace(value: unknown, episodeId: string, source?: ActionTraceSource): ActionTrace {
  const trace = record(value), clock = record(trace.clock), provenance = record(trace.provenance);
  if (trace.schemaVersion !== "roboexam.action-trace.v1" || trace.episodeId !== episodeId ||
    !hash(provenance.manifestSha256) || (provenance.trajectorySha256 !== null && !hash(provenance.trajectorySha256))) throw new Error("trace_identity");
  if (source && "url" in source && (provenance.manifestSha256 !== source.manifestSha256 || provenance.bindingSha256 !== source.bindingSha256)) throw new Error("trace_binding");
  const t = trace.t;
  if (clock.unit !== "seconds" || typeof clock.dataset !== "string" || !Array.isArray(t) || t.length < 2 || t.length > 80 ||
    clock.samples !== t.length || !Number.isSafeInteger(clock.sourceFrames) || Number(clock.sourceFrames) < t.length ||
    t.some((v, i) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || (i > 0 && v <= t[i - 1]))) throw new Error("trace_clock");
  let arrays = 0;
  for (const [name, dimension, unit] of [["jointPosition", 6, "rad"], ["endEffectorPosition", 3, "m"]] as const) {
    const group = record(trace[name]);
    if (group.unit !== unit || (name === "endEffectorPosition" && !["world", "source"].includes(String(group.frame)))) throw new Error("trace_units");
    for (const side of ["left", "right"]) {
      const rows = group[side];
      if (rows === null) continue;
      if (!Array.isArray(rows) || rows.length !== t.length || rows.some(row => !Array.isArray(row) || row.length !== dimension ||
        row.some(v => typeof v !== "number" || !Number.isFinite(v)))) throw new Error("trace_values");
      arrays++;
    }
  }
  if (trace.action !== undefined) {
    const group = record(trace.action), labels = group.labels;
    if (typeof group.unit !== "string" || !group.unit || !Array.isArray(labels) || labels.length < 1 || labels.length > 8 ||
      labels.some(label => typeof label !== "string" || !label)) throw new Error("trace_units");
    const actionTime = group.t === undefined ? t : group.t;
    if (!Array.isArray(actionTime) || actionTime.length < 2 || actionTime.length > 80 ||
      actionTime.some((v, i) => typeof v !== "number" || !Number.isFinite(v) || v < 0 ||
        (i > 0 && v <= actionTime[i - 1]) || v > t[t.length - 1] + 1e-6)) throw new Error("trace_clock");
    for (const side of ["left", "right"]) {
      const rows = group[side];
      if (rows === null) continue;
      if (!Array.isArray(rows) || rows.length !== actionTime.length || rows.some(row => !Array.isArray(row) || row.length !== labels.length ||
        row.some(v => typeof v !== "number" || !Number.isFinite(v)))) throw new Error("trace_values");
      arrays++;
    }
  }
  if (!arrays || !Array.isArray(provenance.datasets) || provenance.datasets.some(v => typeof v !== "string")) throw new Error("trace_missing");
  return value as ActionTrace;
}
