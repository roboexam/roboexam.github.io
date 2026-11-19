// Overview page: how the six capability tags, the shared tasks and the four tracks fit
// together, read from the submitted manuscript's bundle (paper-results.ts). No values
// are hand-entered here.
import { BOARD_SCENES, BOARD_TAGS } from "./main-board.ts";
import type { TrackId } from "./metric-plan.ts";
import { PAPER_DEMOS_PER_TASK, PAPER_REAL_TASKS, PAPER_SIM_CASES, paperResults } from "./paper-results.ts";
import type { ScenarioTag } from "./scenario-plan.ts";

/** The manuscript letters "Order & stages" as S; the task registry keeps its older code T. */
export const paperTagLetter = (tag: ScenarioTag) => (tag === "T" ? "S" : tag);

export type OverviewTag = { id: ScenarioTag; letter: string; label: string; rule: string; tasks: string[] };

export const overviewTags: OverviewTag[] = BOARD_TAGS.map((tag) => ({
  id: tag.id,
  letter: paperTagLetter(tag.id),
  label: tag.label,
  rule: tag.rule,
  tasks: BOARD_SCENES.filter((scene) => tag.scenes.includes(scene.id)).map((scene) => scene.name),
}));

export const realTaskLabels = PAPER_REAL_TASKS.map((id) => paperResults.tracks.T4[0]?.tasks[id].label ?? id);

const sceneNames = new Map(BOARD_SCENES.map((scene) => [scene.id.toLowerCase(), scene.name]));
export const taskName = (id: string) => sceneNames.get(id.toLowerCase()) ?? id;

const { findings, hybrid } = paperResults;

/** Finding 1: the three tasks each family leads most, by mean T1 agent minus mean T3 policy TSR (pp). */
export const strengthRows = (() => {
  const tasks = findings.taskStrengths.tasks;
  return [...tasks.slice(0, 3), ...tasks.slice(-3)].map((row) => ({ id: row.task, task: taskName(row.task), gapPp: row.gapPp, t1: row.t1, t3: row.t3 }));
})();
export const familyTsr = findings.taskStrengths.familyTsr;

/** Finding 2: change from ID to visual OOD. Success-rate tracks share one pp scale; T2 is a ratio and stays apart. */
export const visualShift = {
  rows: [
    { id: "hybrid-direct", label: "Hybrid agent", detail: "without forecasting", pp: -findings.conditionShifts.hybridVisualDropPp.direct },
    { id: "hybrid-forecast", label: "Hybrid agent", detail: "with forecasting", pp: -findings.conditionShifts.hybridVisualDropPp.forecast },
    { id: "t3", label: "T3 policies", detail: "mean of seven", pp: findings.conditionShifts.bySetting.V.t3Pp },
    { id: "t1", label: "T1 VLM agents", detail: "mean of five", pp: findings.conditionShifts.bySetting.V.t1Pp },
  ],
  t2: { ee: findings.conditionShifts.bySetting.V.t2EeRatio, mmse: findings.conditionShifts.bySetting.V.t2MmseRatio },
};

/** Finding 3: decision replay at the points where the original plan fails. */
export const replay = findings.decisionReplay;
export const answeringVsActing = findings.answeringVsActing;

export const hybridRuns = hybrid.map((run) => ({ id: run.id, label: run.label, tsr: run.tsr, subtask: run.subtask }));

export const overviewStats = {
  tasks: paperResults.tasks.length,
  newTasks: paperResults.tasks.filter((task) => task.origin === "new").length,
  demos: paperResults.tasks.length * PAPER_DEMOS_PER_TASK,
  simCases: PAPER_SIM_CASES,
  realCasesPerPolicy: paperResults.tracks.T4[0]?.overall.n ?? null,
};

/** The 24 tasks in manuscript order, with their tags (conditional tags included) in the paper's letters. */
export const galleryTasks = paperResults.tasks.map((task) => {
  const scene = BOARD_SCENES.find((item) => item.id.toLowerCase() === task.id.toLowerCase());
  const tags = (scene?.tags ?? []) as ScenarioTag[];
  return { id: task.id, name: taskName(task.id), isNew: task.origin === "new", tags, letters: tags.map(paperTagLetter) };
});

/** The five evaluation conditions as the manuscript defines them (Sec. 3.1). */
export const CONDITIONS = [
  { id: "ID", label: "In-distribution", rule: "New initial states under training conditions." },
  { id: "V", label: "Visual OOD", rule: "New textures, lighting, backgrounds, distractors or viewpoints." },
  { id: "S", label: "Semantic OOD", rule: "Rephrased instructions with the same requirements." },
  { id: "B", label: "Behavioral OOD", rule: "A changed task structure, timing or physical interaction." },
  { id: "REC", label: "Failure recovery", rule: "Continue from a recoverable error, with history and progress kept." },
] as const;

/** How many methods each track evaluates in the manuscript. */
export const trackSizes: Record<TrackId, number> = {
  T1: paperResults.tracks.T1.length, T2: paperResults.tracks.T2.length, T3: paperResults.tracks.T3.length, T4: paperResults.tracks.T4.length,
};
export const casesPerTask = PAPER_SIM_CASES / paperResults.tasks.length;
export const demosPerTask = PAPER_DEMOS_PER_TASK;
