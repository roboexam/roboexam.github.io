// Cross-track leaderboard: one main table grouped by track and capability tag,
// plus per-track sub-tables by evaluation axis and by metric.
// Every value comes from the submitted manuscript's bundle (paper-results.ts);
// nothing here is hand-entered. Missing evidence stays null and is never coerced to zero.
import { tracks, type TrackId } from "./metric-plan.ts";
import {
  PAPER_REAL_TASKS, PAPER_SETTINGS, PAPER_SIM_CASES, PAPER_VERSION, paperResults,
  type PaperResults, type PaperSetting,
} from "./paper-results.ts";
import { scenarioTags, simulationV2Plan, tagsForScenario, type ScenarioTag } from "./scenario-plan.ts";

export const BOARD_TAGS = (Object.keys(scenarioTags) as ScenarioTag[]).map((id) => ({
  id,
  label: scenarioTags[id].label,
  rule: scenarioTags[id].rule,
  // Manuscript Supp. Table 3: a conditional tag (Solve Equation M†, Set Button Colors M‡)
  // counts toward its task group, giving 12/13/10/11/13/14 tasks.
  scenes: simulationV2Plan.filter((scene) => tagsForScenario(scene).includes(id)).map((scene) => scene.id),
}));
export const BOARD_SCENES = simulationV2Plan.map((scene) => ({ id: scene.id, name: scene.name, tags: tagsForScenario(scene) }));

export const AXES = [
  { id: "ID", short: "ID", label: "In-distribution" },
  { id: "V", short: "V-OOD", label: "Visual OOD" },
  { id: "S", short: "S-OOD", label: "Semantic OOD" },
  { id: "B", short: "B-OOD", label: "Behavioral OOD" },
  { id: "REC", short: "Recovery", label: "Failure recovery" },
] as const;
export type AxisId = (typeof AXES)[number]["id"];

export type SceneScore = { value: number | null; secondary: number | null; n: number };
/** One T4 cell: success rate (value) and Subtask (secondary) for a task scope. */
export type RealCell = { id: string; value: number; secondary: number; successes: number; n: number };
export type BoardRow = {
  trackId: TrackId;
  id: string;
  label: string;
  type: string;
  detail: string;
  /** Rows that lack the full five-setting cohort are shown but never ranked. */
  ranked: boolean;
  pendingReason: string | null;
  scenes: Record<string, SceneScore>;
  tags: Record<ScenarioTag, number | null>;
  /** Second number of each Table 1 cell (Score, EE error or Subtask). */
  tagSecondary: Record<ScenarioTag, number | null>;
  overall: number | null;
  overallSecondary: number | null;
  /** T4 only: the six task-scope cells of Table 1 (ordinary / extra for each real task). */
  real?: RealCell[];
  cases: number;
};
export type BoardTrack = {
  id: TrackId;
  title: string;
  subtitle: string;
  metric: string;
  metricShort: string;
  definition: string;
  secondaryLabel: string | null;
  /** True when a smaller secondary value is better (T2 end-effector error). */
  secondaryLowerIsBetter: boolean;
  /** T4 replaces the six tag columns with these task-scope columns. */
  realColumns?: { id: string; task: string; scope: string }[];
  version: string | null;
  rows: BoardRow[];
};

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
const trackMeta = (id: TrackId) => tracks.find((track) => track.id === id)!;
function nullTags() {
  return Object.fromEntries(BOARD_TAGS.map((tag) => [tag.id, null])) as Record<ScenarioTag, null>;
}
function pick<T>(source: Record<ScenarioTag, T>, read: (value: T) => number) {
  return Object.fromEntries(BOARD_TAGS.map((tag) => [tag.id, read(source[tag.id])])) as Record<ScenarioTag, number>;
}

// ---------------------------------------------------------------- T1 · VLM agents
// Manuscript Table 1: TSR and Score (0.7 × Subtask + 0.3 × VQA) per capability tag.
// Per-task values of the completed 600-case run are not part of the bundle, so scenes stay empty.
export function t1Rows(results: PaperResults = paperResults): BoardRow[] {
  return results.tracks.T1.map((model) => ({
    trackId: "T1", id: model.id, label: model.label, type: "VLM agent", detail: "Shared robot-control harness",
    ranked: true, pendingReason: null, scenes: {},
    tags: pick(model.tags, (cell) => cell.tsr), tagSecondary: pick(model.tags, (cell) => cell.score),
    overall: model.overall.tsr, overallSecondary: model.overall.score, cases: PAPER_SIM_CASES,
  }));
}

// ---------------------------------------------------------------- T2 · world models
// Manuscript Table 1: video prediction score (Pred., higher is better) and EE error (mm, lower is better).
export function t2Rows(results: PaperResults = paperResults): BoardRow[] {
  return results.tracks.T2.map((model) => ({
    trackId: "T2", id: model.id, label: model.label, type: "ACWM", detail: "Fixed recorded actions",
    ranked: true, pendingReason: null, scenes: {},
    tags: pick(model.tags, (cell) => cell.pred), tagSecondary: pick(model.tags, (cell) => cell.ee),
    overall: model.overall.pred, overallSecondary: model.overall.ee, cases: PAPER_SIM_CASES,
  }));
}

// ---------------------------------------------------------------- T3 · sim policies
// Manuscript Table 1: TSR and Score per tag. Scene strips pool the frozen episodes of each task.
export function t3Rows(results: PaperResults = paperResults): BoardRow[] {
  return results.tracks.T3.map((model) => {
    const scenes: Record<string, SceneScore> = {};
    for (const scene of BOARD_SCENES) {
      const cells = Object.values(model.tasks[scene.id] ?? {});
      const n = cells.reduce((sum, cell) => sum + cell.n, 0);
      const successes = cells.reduce((sum, cell) => sum + cell.successes, 0);
      const subtask = cells.filter((cell) => finite(cell.subtask)).reduce((sum, cell) => sum + cell.subtask! * cell.n, 0);
      scenes[scene.id] = { value: n ? (100 * successes) / n : null, secondary: n ? subtask / n : null, n };
    }
    return {
      trackId: "T3", id: model.id, label: model.label, type: "Policy", detail: "Fine-tuned on 2,400 demos",
      ranked: true, pendingReason: null, scenes,
      tags: pick(model.tags, (cell) => cell.tsr), tagSecondary: pick(model.tags, (cell) => cell.score),
      overall: model.overall.tsr, overallSecondary: model.overall.score, cases: model.cases,
    };
  });
}

// ---------------------------------------------------------------- T4 · real robot
// Manuscript Table 1 (T4 block): SR and Subtask for 20 ordinary + 3 extra cases per task.
const REAL_SCOPES = ["ordinary", "extra"] as const;
export const REAL_COLUMNS = PAPER_REAL_TASKS.flatMap((task) => REAL_SCOPES.map((scope) => ({
  id: `${task}:${scope}`,
  task: paperResults.tracks.T4[0]?.tasks[task].label ?? task,
  scope: scope === "ordinary" ? "Ordinary" : paperResults.tracks.T4[0]?.tasks[task].extraLabel ?? "Extra",
})));
export function t4Rows(results: PaperResults = paperResults): BoardRow[] {
  return results.tracks.T4.map((model) => ({
    trackId: "T4", id: `T4:${model.id}`, label: model.label, type: "Policy", detail: "Dual Piper arms",
    ranked: true, pendingReason: null, scenes: {}, tags: nullTags(), tagSecondary: nullTags(),
    overall: model.overall.sr, overallSecondary: model.overall.subtask,
    real: PAPER_REAL_TASKS.flatMap((task) => REAL_SCOPES.map((scope) => {
      const cell = model.tasks[task][scope];
      return { id: `${task}:${scope}`, value: cell.sr, secondary: cell.subtask, successes: cell.successes, n: cell.n };
    })),
    cases: model.overall.n,
  }));
}

export function buildMainBoard(): BoardTrack[] {
  return [
    {
      id: "T1", title: trackMeta("T1").title, subtitle: trackMeta("T1").subtitle,
      metric: "Task success rate", metricShort: "TSR %",
      definition: "TSR (%) per capability tag; small: Score = 0.7 × Subtask + 0.3 × VQA.",
      secondaryLabel: "Score", secondaryLowerIsBetter: false, version: PAPER_VERSION, rows: t1Rows(),
    },
    {
      id: "T2", title: trackMeta("T2").title, subtitle: trackMeta("T2").subtitle,
      metric: "Video prediction score", metricShort: "Pred.",
      definition: "Pred. averages normalized video-quality, feature-consistency and action-following scores; small: EE error (mm, lower is better).",
      secondaryLabel: "EE mm", secondaryLowerIsBetter: true, version: PAPER_VERSION, rows: t2Rows(),
    },
    {
      id: "T3", title: trackMeta("T3").title, subtitle: trackMeta("T3").subtitle,
      metric: "Task success rate", metricShort: "TSR %",
      definition: "TSR (%) per capability tag in Isaac Sim; small: Score = Subtask × (0.50 + 0.25 I + 0.25 K).",
      secondaryLabel: "Score", secondaryLowerIsBetter: false, version: PAPER_VERSION, rows: t3Rows(),
    },
    {
      id: "T4", title: trackMeta("T4").title, subtitle: trackMeta("T4").subtitle,
      metric: "Success rate", metricShort: "SR %",
      definition: "SR (%) per real-robot task: 20 ordinary + 3 extra cases each; small: Subtask (%). Overall averages all 69 cases.",
      secondaryLabel: "Subtask", secondaryLowerIsBetter: false, realColumns: REAL_COLUMNS, version: PAPER_VERSION, rows: t4Rows(),
    },
  ];
}

/** Rank of each ranked row per column (1 = best); unranked rows and nulls are skipped. */
export function columnRanks<T extends { id: string; ranked: boolean }>(rows: T[], read: (row: T) => number | null, higherIsBetter = true) {
  const scored = rows.filter((row) => row.ranked && finite(read(row)))
    .map((row) => ({ id: row.id, value: read(row) as number }))
    .sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value);
  const ranks = new Map<string, number>();
  scored.forEach((entry, index) => {
    const tie = index > 0 && scored[index - 1].value === entry.value;
    ranks.set(entry.id, tie ? ranks.get(scored[index - 1].id)! : index + 1);
  });
  return ranks;
}

// ================================================================= Sub-table 1 · by evaluation axis
export type AxisRow = {
  id: string; label: string; type: string; ranked: boolean; note: string | null;
  overall: number | null;
  axes: Record<AxisId, { value: number | null; secondary: number | null; n: number }>;
  oodMean: number | null;
  oodDrop: number | null;
};
/** T2 axis values are prediction errors, so smaller is better and a positive OOD − ID is a loss. */
export const axisLowerIsBetter = (trackId: TrackId) => trackId === "T2";
function withOod(row: Omit<AxisRow, "oodMean" | "oodDrop">): AxisRow {
  const values = [row.axes.V.value, row.axes.S.value, row.axes.B.value];
  const ood = values.every(finite) ? mean(values as number[]) : null;
  const id = row.axes.ID.value;
  return { ...row, oodMean: ood, oodDrop: ood !== null && finite(id) ? ood - id : null };
}
const emptyAxes = () => Object.fromEntries(AXES.map((axis) => [axis.id, { value: null, secondary: null, n: 0 }])) as AxisRow["axes"];
const CASES_PER_SETTING = PAPER_SIM_CASES / PAPER_SETTINGS.length;

export function axisRows(trackId: TrackId, results: PaperResults = paperResults): AxisRow[] {
  if (trackId === "T1") {
    return results.tracks.T1.map((model) => {
      const axes = emptyAxes();
      for (const setting of PAPER_SETTINGS) axes[setting] = { value: model.settings[setting].tsr, secondary: model.settings[setting].subtask, n: CASES_PER_SETTING };
      return withOod({ id: model.id, label: model.label, type: "VLM agent", ranked: true, note: null, overall: model.summary.tsr, axes });
    });
  }
  if (trackId === "T2") {
    return results.tracks.T2.map((model) => {
      const axes = emptyAxes();
      for (const setting of PAPER_SETTINGS) axes[setting] = { value: model.settings[setting].eePos, secondary: model.settings[setting].mmse, n: CASES_PER_SETTING };
      return withOod({ id: model.id, label: model.label, type: "ACWM", ranked: true, note: null, overall: model.metrics.eePos, axes });
    });
  }
  if (trackId === "T3") {
    return results.tracks.T3.map((model) => {
      const axes = emptyAxes();
      for (const setting of PAPER_SETTINGS) {
        const n = Object.values(model.tasks).reduce((sum, task) => sum + (task[setting]?.n ?? 0), 0);
        axes[setting] = { value: model.settings[setting].tsr, secondary: model.settings[setting].subtask, n };
      }
      return withOod({ id: model.id, label: model.label, type: "Policy", ranked: true, note: null, overall: model.summary.tsr, axes });
    });
  }
  return results.tracks.T4.map((model) => {
    const axes = emptyAxes();
    for (const setting of ["ID", "V", "S", "B"] as const) {
      const cells = PAPER_REAL_TASKS.map((task) => model.tasks[task].conditions[setting]);
      const n = cells.reduce((sum, cell) => sum + cell.n, 0);
      axes[setting] = { value: (100 * cells.reduce((sum, cell) => sum + cell.successes, 0)) / n, secondary: null, n };
    }
    // Real-robot recovery is the continuation scope of towel folding and puzzle insertion.
    const continuation = (["Towel", "Puzzle"] as const).map((task) => model.tasks[task].extra);
    const n = continuation.reduce((sum, cell) => sum + cell.n, 0);
    axes.REC = { value: (100 * continuation.reduce((sum, cell) => sum + cell.successes, 0)) / n, secondary: null, n };
    return withOod({ id: model.id, label: model.label, type: "Policy", ranked: true, note: null, overall: model.overall.sr, axes });
  });
}

// ================================================================= Sub-table 2 · by metric
export type MetricColumn = {
  id: string; label: string; short: string; group: string; direction: "↑" | "↓" | "→0";
  unit: string; digits: number; pending?: string;
};
export type MetricRow = { id: string; label: string; type: string; ranked: boolean; note: string | null; values: Record<string, number | null> };
export type MetricTable = { columns: MetricColumn[]; rows: MetricRow[]; caption: string };

const T1_METRIC_COLUMNS: MetricColumn[] = [
  { id: "tsr", label: "Task success rate", short: "TSR", group: "Execution", direction: "↑", unit: "%", digits: 2 },
  { id: "subtask", label: "Subtask progress", short: "Subtask", group: "Execution", direction: "↑", unit: "%", digits: 2 },
  { id: "vqa", label: "VQA · (perception + instruction + reasoning) / 3", short: "VQA", group: "Understanding", direction: "↑", unit: "", digits: 2 },
  { id: "score", label: "Score · 0.7 × Subtask + 0.3 × VQA", short: "Score", group: "Composite", direction: "↑", unit: "", digits: 2 },
];
const T2_METRIC_COLUMNS: MetricColumn[] = [
  { id: "pred", label: "Video prediction score", short: "Pred.", group: "Composite", direction: "↑", unit: "", digits: 1 },
  { id: "psnr", label: "PSNR", short: "PSNR", group: "Video quality", direction: "↑", unit: "dB", digits: 2 },
  { id: "ssim", label: "SSIM", short: "SSIM", group: "Video quality", direction: "↑", unit: "", digits: 3 },
  { id: "smoothness", label: "Motion smoothness", short: "Smooth", group: "Video quality", direction: "↑", unit: "", digits: 3 },
  { id: "mmse", label: "Motion-weighted MSE", short: "M-MSE", group: "Video quality", direction: "↓", unit: "", digits: 4 },
  { id: "jepa", label: "JEPA similarity (set-level)", short: "JEPA", group: "Feature consistency", direction: "↑", unit: "", digits: 3 },
  { id: "jedi", label: "JEDi distance (set-level)", short: "JEDi", group: "Feature consistency", direction: "↓", unit: "", digits: 3 },
  { id: "subject", label: "Subject consistency", short: "Subject", group: "Feature consistency", direction: "↑", unit: "", digits: 3 },
  { id: "eePos", label: "End-effector position error · AnyPos", short: "EE pos", group: "Action following", direction: "↓", unit: "mm", digits: 2 },
  { id: "eeRot", label: "End-effector rotation error · AnyPos", short: "EE rot", group: "Action following", direction: "↓", unit: "°", digits: 2 },
];
const T3_METRIC_COLUMNS: MetricColumn[] = [
  { id: "tsr", label: "Task success rate", short: "TSR", group: "Execution", direction: "↑", unit: "%", digits: 2 },
  { id: "subtask", label: "Subtask progress", short: "Subtask", group: "Execution", direction: "↑", unit: "%", digits: 2 },
  { id: "score", label: "Score · Subtask × (0.50 + 0.25 I + 0.25 K)", short: "Score", group: "Composite", direction: "↑", unit: "", digits: 1 },
];
const T4_METRIC_COLUMNS: MetricColumn[] = [
  ...REAL_COLUMNS.flatMap((column) => [
    { id: `${column.id}:sr`, label: `${column.task} · ${column.scope} SR`, short: `${column.scope} SR`, group: column.task, direction: "↑" as const, unit: "%", digits: 1 },
    { id: `${column.id}:subtask`, label: `${column.task} · ${column.scope} Subtask`, short: "Subtask", group: column.task, direction: "↑" as const, unit: "%", digits: 2 },
  ]),
  { id: "overall:sr", label: "Overall SR · all 69 cases", short: "SR", group: "Overall", direction: "↑", unit: "%", digits: 1 },
  { id: "overall:subtask", label: "Overall Subtask · all 69 cases", short: "Subtask", group: "Overall", direction: "↑", unit: "%", digits: 2 },
];

export function metricTable(trackId: TrackId, results: PaperResults = paperResults): MetricTable {
  if (trackId === "T1") {
    const rows = results.tracks.T1.map((model) => ({ id: model.id, label: model.label, type: "VLM agent", ranked: true, note: null,
      values: { tsr: model.summary.tsr, subtask: model.summary.subtask, vqa: model.summary.vqa, score: model.summary.score } }));
    return { columns: T1_METRIC_COLUMNS, rows, caption: "All 600 simulation cases per agent (manuscript Supp. track metrics). VQA comes from probes in separate contexts; answers never enter the control loop." };
  }
  if (trackId === "T2") {
    const rows = results.tracks.T2.map((model) => ({ id: model.id, label: model.label, type: "ACWM", ranked: true, note: null,
      values: { pred: model.overall.pred, ...model.metrics } as Record<string, number | null> }));
    return { columns: T2_METRIC_COLUMNS, rows, caption: "All 600 cases with fixed recorded actions. JEPA/JEDi are set-level; EE errors come from a frozen AnyPos reader validated against simulator poses." };
  }
  if (trackId === "T3") {
    const rows = results.tracks.T3.map((model) => ({ id: model.id, label: model.label, type: "Policy", ranked: true, note: null,
      values: { tsr: model.summary.tsr, subtask: model.summary.subtask, score: model.overall.score } }));
    return { columns: T3_METRIC_COLUMNS, rows, caption: "All 600 simulation cases per policy in Isaac Sim. I and K ∈ [0, 1] are interaction and motion quality." };
  }
  const rows = results.tracks.T4.map((model) => {
    const values: Record<string, number | null> = { "overall:sr": model.overall.sr, "overall:subtask": model.overall.subtask };
    for (const task of PAPER_REAL_TASKS) for (const scope of REAL_SCOPES) {
      values[`${task}:${scope}:sr`] = model.tasks[task][scope].sr;
      values[`${task}:${scope}:subtask`] = model.tasks[task][scope].subtask;
    }
    return { id: model.id, label: model.label, type: "Policy", ranked: true, note: null, values };
  });
  return { columns: T4_METRIC_COLUMNS, rows, caption: "Dual Piper arms; 20 ordinary and three missing-color or continuation cases per task, verified on site." };
}

/** Per-setting success for a T3 policy and task, used by the scene strip tooltip. */
export function t3SettingCell(modelId: string, taskId: string, setting: PaperSetting) {
  return paperResults.tracks.T3.find((model) => model.id === modelId)?.tasks[taskId]?.[setting] ?? null;
}
