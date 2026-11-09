// Cross-track leaderboard: one main table grouped by track and capability tag,
// plus per-track sub-tables by evaluation axis and by metric.
// Every value is derived from the published, validated bundles; nothing here is
// hand-entered. Missing evidence stays null and is never coerced to zero.
import { acwm600, compositeScoresFor, type Acwm600Summary } from "./acwm600-results.ts";
import { tracks, type TrackId } from "./metric-plan.ts";
import { policyBaselineModelIds, policyBaselines, type PolicyBaselineModel } from "./policy-baselines.ts";
import { scenarioTags, simulationV2Plan, type ScenarioTag } from "./scenario-plan.ts";
import { t1UnibenchResults, T1_SPLITS, type T1SplitId, type T1UnibenchResults } from "./t1-unibench-results.ts";

export const BOARD_TAGS = (Object.keys(scenarioTags) as ScenarioTag[]).map((id) => ({
  id,
  label: scenarioTags[id].label,
  rule: scenarioTags[id].rule,
  // Base tags only: candidate and variant-scoped tags are not frozen protocol.
  scenes: simulationV2Plan.filter((scene) => scene.tags.includes(id)).map((scene) => scene.id),
}));
export const BOARD_SCENES = simulationV2Plan.map((scene) => ({ id: scene.id, name: scene.name, tags: scene.tags }));

export const AXES = [
  { id: "ID", short: "ID", label: "In-distribution" },
  { id: "V", short: "V-OOD", label: "Visual OOD" },
  { id: "S", short: "S-OOD", label: "Semantic OOD" },
  { id: "B", short: "B-OOD", label: "Behavioral OOD" },
  { id: "REC", short: "Failure", label: "Failure recovery" },
] as const;
export type AxisId = (typeof AXES)[number]["id"];

export type SceneScore = { value: number | null; secondary: number | null; n: number };
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
  overall: number | null;
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
  version: string | null;
  rows: BoardRow[];
};

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
/** Mean over every listed scene; null as soon as one scene has no value. */
function strictMean(values: (number | null | undefined)[]) {
  return values.length > 0 && values.every(finite) ? mean(values as number[]) : null;
}
function aggregate(scenes: Record<string, SceneScore>) {
  const tags = Object.fromEntries(BOARD_TAGS.map((tag) =>
    [tag.id, strictMean(tag.scenes.map((scene) => scenes[scene]?.value))])) as Record<ScenarioTag, number | null>;
  return { tags, overall: strictMean(BOARD_SCENES.map((scene) => scenes[scene.id]?.value)) };
}
const trackMeta = (id: TrackId) => tracks.find((track) => track.id === id)!;

// ---------------------------------------------------------------- T1 · VLM agents
// Scene score follows the published T1 formula: 0.7 × Subtask + 0.3 × VQA, where
// Subtask is averaged over the settings that evaluated the scene (Recovery included)
// and VQA over ID and the three OOD settings.
export function t1Rows(results: T1UnibenchResults = t1UnibenchResults): BoardRow[] {
  return results.models.map((model) => {
    const complete = T1_SPLITS.every((split) => model.splits[split] !== null);
    const scenes: Record<string, SceneScore> = {};
    for (const scene of BOARD_SCENES) {
      const subtask: number[] = [];
      const vqa: number[] = [];
      let n = 0;
      for (const split of T1_SPLITS) {
        const task = model.splits[split]?.perTask[scene.id];
        if (!task) continue;
        n += task.cases;
        if (finite(task.subtask)) subtask.push(task.subtask);
        if (split !== "REC" && finite(task.vqa)) vqa.push(task.vqa);
      }
      const sub = mean(subtask);
      const q = mean(vqa);
      scenes[scene.id] = {
        value: complete && sub !== null && q !== null ? 0.7 * sub + 0.3 * q : null,
        secondary: complete ? sub : null,
        n,
      };
    }
    const cases = T1_SPLITS.reduce((sum, split) => sum + (model.splits[split]?.cases ?? 0), 0);
    return {
      trackId: "T1",
      id: model.id,
      label: model.label,
      type: "VLM agent",
      detail: model.family,
      ranked: complete,
      pendingReason: complete ? null : `Only ${model.splitsPresent.join(", ")} evaluated`,
      scenes,
      ...(complete ? aggregate(scenes) : { tags: nullTags(), overall: null }),
      cases,
    };
  });
}

// ---------------------------------------------------------------- T2 · world models
// Scene score is the frozen nine-metric T2 composite computed on that scene's 25
// cases (5 settings × 5). It is cohort-relative: 50 equals the cohort geometric mean.
export function t2Rows(models: Acwm600Summary["models"] = acwm600.models): BoardRow[] {
  const perScene = Object.fromEntries(BOARD_SCENES.map((scene) => [scene.id, compositeScoresFor(models, `task/${scene.id}`)]));
  return models.map((model) => {
    const scenes: Record<string, SceneScore> = {};
    for (const scene of BOARD_SCENES) {
      const group = model.groups[`task/${scene.id}`];
      scenes[scene.id] = { value: perScene[scene.id][model.id] ?? null, secondary: group?.a.A1 ?? null, n: group?.count ?? 0 };
    }
    return {
      trackId: "T2",
      id: model.id,
      label: model.label,
      type: "ACWM",
      detail: model.checkpoint,
      ranked: true,
      pendingReason: null,
      scenes,
      ...aggregate(scenes),
      cases: model.caseCount,
    };
  });
}

// ---------------------------------------------------------------- T3 · sim policies
const POLICY_SPLITS = ["id", "visual", "semantic", "behavior", "recovery"] as const;
type PolicyBundle = typeof policyBaselines;
// Scene score is the pooled task success rate over the five settings' frozen
// episodes (25 per scene; the published cohort may freeze fewer, e.g. 4 recovery).
export function t3Rows(bundle: PolicyBundle = policyBaselines): BoardRow[] {
  return policyBaselineModelIds.map((model) => {
    const scenes: Record<string, SceneScore> = {};
    let cases = 0;
    for (const scene of BOARD_SCENES) {
      let successes = 0;
      let episodes = 0;
      let progress = 0;
      let progressN = 0;
      let complete = true;
      for (const split of POLICY_SPLITS) {
        const task = bundle.models[model][split]?.[scene.id];
        if (!task || task.episodes <= 0 || !task.values.TSR?.available) { complete = false; continue; }
        successes += task.successes;
        episodes += task.episodes;
        const score = task.values.TASK_SCORE;
        if (score?.available && finite(score.value)) { progress += score.value * score.n; progressN += score.n; }
      }
      cases += episodes;
      scenes[scene.id] = {
        value: complete && episodes > 0 ? (100 * successes) / episodes : null,
        secondary: complete && progressN > 0 ? (100 * progress) / progressN : null,
        n: episodes,
      };
    }
    return {
      trackId: "T3",
      id: model,
      label: model,
      type: "VLA",
      detail: "Benchmark policy",
      ranked: true,
      pendingReason: null,
      scenes,
      ...aggregate(scenes),
      cases,
    };
  });
}

// ---------------------------------------------------------------- T4 · real robot
function plannedRows(trackId: TrackId): BoardRow[] {
  return trackMeta(trackId).models.map((model) => ({
    trackId,
    id: `${trackId}:${model.id}`,
    label: model.id,
    type: model.family,
    detail: model.status,
    ranked: false,
    pendingReason: model.status,
    scenes: {},
    tags: nullTags(),
    overall: null,
    cases: 0,
  }));
}
function nullTags() {
  return Object.fromEntries(BOARD_TAGS.map((tag) => [tag.id, null])) as Record<ScenarioTag, null>;
}

export function buildMainBoard(): BoardTrack[] {
  return [
    {
      id: "T1", title: trackMeta("T1").title, subtitle: trackMeta("T1").subtitle,
      metric: "Agent score", metricShort: "Score",
      definition: "0.7 × Subtask + 0.3 × VQA per scene, averaged over the settings that evaluated it.",
      secondaryLabel: "Subtask", version: t1UnibenchResults.resultVersion, rows: t1Rows(),
    },
    {
      id: "T2", title: trackMeta("T2").title, subtitle: trackMeta("T2").subtitle,
      metric: "Composite score", metricShort: "Composite",
      definition: "Nine frozen metrics, direction-normalised against the cohort geometric mean (= 50) and averaged; 25 cases per scene.",
      secondaryLabel: "PSNR (dB)", version: acwm600.version, rows: t2Rows(),
    },
    {
      id: "T3", title: trackMeta("T3").title, subtitle: trackMeta("T3").subtitle,
      metric: "Success rate", metricShort: "SR %",
      definition: "Official successes ÷ frozen episodes, pooled over ID, three OOD settings and Recovery (25 episodes per scene).",
      secondaryLabel: "Subtask %", version: policyBaselines.resultVersion, rows: t3Rows(),
    },
    {
      id: "T4", title: trackMeta("T4").title, subtitle: trackMeta("T4").subtitle,
      metric: "Success rate", metricShort: "SR %",
      definition: "No formal hardware score is published yet.",
      secondaryLabel: null, version: null, rows: plannedRows("T4"),
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
function withOod(row: Omit<AxisRow, "oodMean" | "oodDrop">): AxisRow {
  const ood = strictMean([row.axes.V.value, row.axes.S.value, row.axes.B.value]);
  const id = row.axes.ID.value;
  return { ...row, oodMean: ood, oodDrop: ood !== null && finite(id) ? ood - id : null };
}
const emptyAxes = () => Object.fromEntries(AXES.map((axis) => [axis.id, { value: null, secondary: null, n: 0 }])) as AxisRow["axes"];

export function axisRows(trackId: TrackId): AxisRow[] {
  if (trackId === "T1") {
    return t1UnibenchResults.models.map((model) => {
      const axes = emptyAxes();
      for (const split of T1_SPLITS) {
        const metrics = model.splits[split as T1SplitId];
        if (metrics) axes[split] = { value: metrics.score, secondary: metrics.subtask, n: metrics.cases };
      }
      const complete = model.overall !== null;
      return withOod({ id: model.id, label: model.label, type: "VLM agent", ranked: complete,
        note: complete ? null : `Only ${model.splitsPresent.join(", ")} evaluated`,
        overall: model.overall?.overall ?? null, axes });
    });
  }
  if (trackId === "T2") {
    const all = compositeScoresFor(acwm600.models, "ALL");
    const byAxis = Object.fromEntries(AXES.map((axis) => [axis.id, compositeScoresFor(acwm600.models, `family/${axis.id}`)]));
    return acwm600.models.map((model) => {
      const axes = emptyAxes();
      for (const axis of AXES) {
        const group = model.groups[`family/${axis.id}`];
        axes[axis.id] = { value: byAxis[axis.id][model.id] ?? null, secondary: group?.a.A1 ?? null, n: group?.count ?? 0 };
      }
      return withOod({ id: model.id, label: model.label, type: "ACWM", ranked: true, note: null, overall: all[model.id] ?? null, axes });
    });
  }
  if (trackId === "T3") {
    return policyBaselineModelIds.map((model) => {
      const axes = emptyAxes();
      const splitFor: Record<AxisId, (typeof POLICY_SPLITS)[number]> = { ID: "id", V: "visual", S: "semantic", B: "behavior", REC: "recovery" };
      let successes = 0;
      let episodes = 0;
      for (const axis of AXES) {
        const overall = policyBaselines.overall[model][splitFor[axis.id]];
        if (!overall) continue;
        const tsr = overall.values.TSR;
        const score = overall.values.TASK_SCORE;
        axes[axis.id] = {
          value: tsr?.available && finite(tsr.value) ? 100 * tsr.value : null,
          secondary: score?.available && finite(score.value) ? 100 * score.value : null,
          n: overall.episodes,
        };
        successes += overall.successes;
        episodes += overall.episodes;
      }
      return withOod({ id: model, label: model, type: "VLA", ranked: true, note: null, overall: episodes ? (100 * successes) / episodes : null, axes });
    });
  }
  return [];
}

// ================================================================= Sub-table 2 · by metric
export type MetricColumn = {
  id: string; label: string; short: string; group: string; direction: "↑" | "↓" | "→0";
  unit: string; digits: number; pending?: string;
};
export type MetricRow = { id: string; label: string; type: string; ranked: boolean; note: string | null; values: Record<string, number | null> };
export type MetricTable = { columns: MetricColumn[]; rows: MetricRow[]; caption: string };

const T1_METRIC_COLUMNS: MetricColumn[] = [
  { id: "score", label: "Agent score", short: "Overall", group: "Outcome", direction: "↑", unit: "", digits: 1 },
  { id: "subtask", label: "Subtask progress", short: "Subtask", group: "Outcome", direction: "↑", unit: "", digits: 1 },
  { id: "success", label: "Task success", short: "Success", group: "Outcome", direction: "↑", unit: "%", digits: 1 },
  { id: "vqa", label: "VQA · (A + B + C1) / 3", short: "VQA", group: "Embodied VQA", direction: "↑", unit: "", digits: 1 },
  { id: "a", label: "A · Perception", short: "A", group: "Embodied VQA", direction: "↑", unit: "", digits: 1 },
  { id: "b", label: "B · Understanding", short: "B", group: "Embodied VQA", direction: "↑", unit: "", digits: 1 },
  { id: "c1", label: "C1 · Full plan", short: "C1", group: "Planning", direction: "↑", unit: "", digits: 1 },
  { id: "c2", label: "C2 · Milestones", short: "C2", group: "Planning", direction: "↑", unit: "", digits: 1 },
  { id: "c3", label: "C3 · Next action", short: "C3", group: "Planning", direction: "↑", unit: "", digits: 1 },
];
const T2_METRIC_COLUMNS: MetricColumn[] = [
  { id: "composite", label: "Nine-metric composite", short: "Overall", group: "Outcome", direction: "↑", unit: "", digits: 1 },
  { id: "A1", label: "PSNR", short: "PSNR", group: "GT-action replay · video quality", direction: "↑", unit: "dB", digits: 2 },
  { id: "A2", label: "SSIM", short: "SSIM", group: "GT-action replay · video quality", direction: "↑", unit: "", digits: 3 },
  { id: "JEPA", label: "JEPA similarity (set-level)", short: "JEPA", group: "GT-action replay · video quality", direction: "↑", unit: "", digits: 3 },
  { id: "JEDi", label: "JEDi distance (set-level)", short: "JEDi", group: "GT-action replay · video quality", direction: "↓", unit: "", digits: 3 },
  { id: "A4", label: "Motion smoothness", short: "Smooth", group: "GT-action replay · video quality", direction: "↑", unit: "", digits: 3 },
  { id: "A5", label: "Motion-weighted MSE", short: "M-MSE", group: "GT-action replay · video quality", direction: "↓", unit: "", digits: 4 },
  { id: "A6", label: "Subject consistency", short: "Subject", group: "GT-action replay · video quality", direction: "↑", unit: "", digits: 3 },
  { id: "pos", label: "End-effector position error · AnyPos v5", short: "Pos err", group: "Action following · AnyPos v5", direction: "↓", unit: "mm", digits: 1 },
  { id: "rot", label: "End-effector rotation error · AnyPos v5", short: "Rot err", group: "Action following · AnyPos v5", direction: "↓", unit: "°", digits: 2 },
  { id: "cl_psnr", label: "Closed-loop PSNR (π0.5 actions)", short: "PSNR", group: "Closed loop · π0.5 actions", direction: "↑", unit: "dB", digits: 2, pending: "Planned" },
  { id: "cl_ssim", label: "Closed-loop SSIM (π0.5 actions)", short: "SSIM", group: "Closed loop · π0.5 actions", direction: "↑", unit: "", digits: 3, pending: "Planned" },
  { id: "cl_ndtw", label: "Closed-loop action following (NDTW)", short: "NDTW", group: "Closed loop · π0.5 actions", direction: "↑", unit: "", digits: 3, pending: "Planned" },
  { id: "sim_corr", label: "Simulator ↔ world-model success correlation", short: "Corr.", group: "Policy evaluator", direction: "↑", unit: "", digits: 2, pending: "Planned" },
];
const T3_METRIC_IDS: [string, string, MetricColumn["direction"], string][] = [
  ["TSR", "Overall", "↑", "Outcome"],
  ["TASK_SCORE", "Subtask", "↑", "Outcome"],
  ["FIRST_TARGET_SELECTION", "1st target", "↑", "Action correctness"],
  ["GRASP_STABILITY", "Grasp", "↑", "Action correctness"],
  ["DROP_RATE", "Drop", "↓", "Action correctness"],
  ["LOCAL_SUCCESS_AT_END", "Local SR", "↑", "Closed-loop effectiveness"],
  ["STAGE_TRANSITION", "Stage", "↑", "Stateful execution"],
  ["GOAL_RETENTION", "Retention", "↑", "Stateful execution"],
  ["PATH_EFFICIENCY", "Path eff.", "↑", "Motion & efficiency"],
  ["TIME_EFFICIENCY", "Time eff.", "↑", "Motion & efficiency"],
  ["SPARC", "SPARC", "→0", "Motion & efficiency"],
];
const T3_LABELS: Record<string, string> = {
  TSR: "Task success rate", TASK_SCORE: "Subtask completion", FIRST_TARGET_SELECTION: "First target selection",
  GRASP_STABILITY: "Grasp stability", DROP_RATE: "Transport drop rate", LOCAL_SUCCESS_AT_END: "Local success at end",
  STAGE_TRANSITION: "Stage transition accuracy", GOAL_RETENTION: "Completed-goal retention",
  PATH_EFFICIENCY: "Path efficiency", TIME_EFFICIENCY: "Time efficiency", SPARC: "SPARC smoothness",
};

export function metricTable(trackId: TrackId): MetricTable {
  if (trackId === "T1") {
    const rows = t1UnibenchResults.models.map((model) => {
      const present = T1_SPLITS.filter((split) => model.splits[split] !== null);
      const values: Record<string, number | null> = {};
      for (const column of T1_METRIC_COLUMNS) {
        if (column.id === "score") { values.score = model.overall?.overall ?? null; continue; }
        const splits = ["subtask", "success"].includes(column.id) ? present : present.filter((split) => split !== "REC");
        values[column.id] = mean(splits.map((split) => model.splits[split]?.[column.id as "subtask"]).filter(finite));
      }
      const complete = model.overall !== null;
      return { id: model.id, label: model.label, type: "VLM agent", ranked: complete,
        note: complete ? null : `ID only · ${model.splits.ID?.cases ?? 0} cases`, values };
    });
    return { columns: T1_METRIC_COLUMNS, rows, caption: "Each value is the mean over the evaluated settings; VQA-family metrics exclude Recovery, which has no VQA." };
  }
  if (trackId === "T2") {
    const composite = compositeScoresFor(acwm600.models, "ALL");
    const rows = acwm600.models.map((model) => {
      const all = model.groups.ALL;
      const values: Record<string, number | null> = { composite: composite[model.id] ?? null };
      for (const key of ["A1", "A2", "JEPA", "JEDi", "A4", "A5", "A6"]) values[key] = all.a[key] ?? null;
      values.pos = all.b.v5.position.mae;
      values.rot = all.b.v5.rotation.mae;
      return { id: model.id, label: model.label, type: "ACWM", ranked: true, note: null, values };
    });
    return { columns: T2_METRIC_COLUMNS, rows, caption: `All 600 cases (24 scenes × 5 settings × 5). Fixed-action self-recursive replay from t0 on a ${acwm600.gridSeconds}s grid; JEPA/JEDi are set-level.` };
  }
  if (trackId === "T3") {
    const columns: MetricColumn[] = T3_METRIC_IDS.map(([id, short, direction, group]) => ({
      id, short, direction, group, label: T3_LABELS[id], unit: id === "SPARC" ? "" : "%", digits: id === "SPARC" ? 2 : 1,
    }));
    const rows = policyBaselineModelIds.map((model: PolicyBaselineModel) => {
      const values: Record<string, number | null> = {};
      for (const [id] of T3_METRIC_IDS) {
        let total = 0;
        let n = 0;
        for (const split of POLICY_SPLITS) {
          const metric = policyBaselines.overall[model][split]?.values[id];
          if (!metric?.available || !finite(metric.value) || metric.n <= 0) continue;
          total += metric.value * metric.n;
          n += metric.n;
        }
        values[id] = n > 0 ? (id === "SPARC" ? total / n : (100 * total) / n) : null;
      }
      return { id: model, label: model, type: "VLA", ranked: true, note: null, values };
    });
    return { columns, rows, caption: "Pooled over all five settings, weighted by each metric's evaluable episodes." };
  }
  return { columns: [], rows: [], caption: "" };
}
