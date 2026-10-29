import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  RealDatasetCatalog,
  RealDatasetEntries,
  SimulationSplitId,
  SimulationTaskSummary,
} from "./real-datasets.ts";
import { createRealDatasetReader } from "./real-datasets.server.ts";

export const SIMULATION_TRAINING_ROOT =
  "/mnt/public_ckp/UniEmbodied-Bench/simulation/dataset/policy_mix24_clean2400_sdk_ee20_25hz_instruction_20261029_v2";
export const SIMULATION_EVALUATION_ROOT =
  "/mnt/public_ckp/UniEmbodied-Bench/simulation/dataset/evaluation24_sdk_ee20_25hz_episode_mp4_instruction_20261029_v3";

const TRAINING_EPISODES_PER_TASK = 100;
const SIMULATION_TASK_COUNT = 24;
const EVALUATION_EPISODES_PER_SPLIT = 5;
const evaluationSplits: { id: SimulationSplitId; suffix: string }[] = [
  { id: "id", suffix: "id" },
  { id: "visual", suffix: "ood/visual" },
  { id: "semantic", suffix: "ood/semantic" },
  { id: "behavioral", suffix: "ood/behavior" },
  { id: "failure", suffix: "failure" },
];

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === "string" ? value : null;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const taskName = (id: string) =>
  id.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

function mappingTask(value: Json) {
  const direct = text(object(value.source_record).task) ?? text(object(value.provider).task) ?? text(value.task);
  if (direct) return direct;
  const episodeId = text(value.episode_id);
  return episodeId?.match(/^[^:]+:([^:]+):/)?.[1] ?? null;
}

async function taskAt(root: string, episode: number) {
  const file = path.join(root, "meta", "source_mapping", `episode-${String(episode).padStart(6, "0")}.json`);
  const value = object(JSON.parse(await readFile(file, "utf8")));
  if ((value.episode_index !== undefined && value.episode_index !== episode) || !mappingTask(value))
    throw new Error("invalid_training_task_mapping");
  return mappingTask(value)!;
}

export async function buildSimulationTaskCatalog(
  catalog: RealDatasetCatalog,
  trainingRoot = SIMULATION_TRAINING_ROOT,
  evaluationRoot = SIMULATION_EVALUATION_ROOT,
) {
  const training = catalog.datasets.find(dataset => dataset.sourceGroup === "training");
  if (!training || training.episodeCount !== SIMULATION_TASK_COUNT * TRAINING_EPISODES_PER_TASK)
    throw new Error("invalid_training_episode_count");
  const taskCount = training.episodeCount / TRAINING_EPISODES_PER_TASK;
  const tasks = await Promise.all(Array.from({ length: taskCount }, async (_, sceneId) => {
    const start = sceneId * TRAINING_EPISODES_PER_TASK;
    const [first, last] = await Promise.all([
      taskAt(trainingRoot, start),
      taskAt(trainingRoot, start + TRAINING_EPISODES_PER_TASK - 1),
    ]);
    if (first !== last || !/^[A-Za-z0-9_+-]{1,128}$/.test(first)) throw new Error("invalid_training_task_block");
    return { id: first, sceneId };
  }));
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error("duplicate_training_task");

  const index = object(JSON.parse(await readFile(path.join(evaluationRoot, "EVALUATION_INDEX.json"), "utf8")));
  const groups = Array.isArray(index.groups) ? index.groups : [];
  if (groups.length !== taskCount * evaluationSplits.length) throw new Error("invalid_evaluation_index_size");
  const indexedPaths = new Map<string, string>();
  for (const item of groups) {
    const value = object(item);
    const relative = text(value.path);
    const task = text(value.task);
    if (!relative || !task || indexedPaths.has(relative)) throw new Error("invalid_evaluation_index_entry");
    indexedPaths.set(relative, task);
  }
  const evaluationDatasets = catalog.datasets
    .filter(dataset => dataset.sourceGroup === "evaluation" && dataset.relativePath);
  const byRelativePath = new Map(evaluationDatasets.map(dataset => [dataset.relativePath!, dataset]));
  if (evaluationDatasets.length !== groups.length || byRelativePath.size !== groups.length)
    throw new Error("invalid_evaluation_dataset_catalog");

  return tasks.map(({ id, sceneId }): SimulationTaskSummary => {
    const splits = [{
      id: "training" as const,
      datasetId: training.id,
      episodeCount: TRAINING_EPISODES_PER_TASK,
    }, ...evaluationSplits.map(({ id: splitId, suffix }) => {
      const relative = `${id}/${suffix}`;
      const dataset = byRelativePath.get(relative);
      if (indexedPaths.get(relative) !== id || dataset?.episodeCount !== EVALUATION_EPISODES_PER_SPLIT)
        throw new Error("invalid_evaluation_task_split");
      return { id: splitId, datasetId: dataset.id, episodeCount: dataset.episodeCount };
    })];
    return {
      id,
      name: taskName(id),
      sceneId,
      episodeCount: splits.reduce((sum, split) => sum + split.episodeCount, 0),
      splits,
    };
  });
}

const reader = createRealDatasetReader({
  roots: [
    {
      id: "clean2400",
      kind: "robot",
      root: SIMULATION_TRAINING_ROOT,
      label: "Training set · clean2400",
      sourceGroup: "training",
    },
    {
      id: "evaluation600",
      kind: "robot",
      root: SIMULATION_EVALUATION_ROOT,
      sourceGroup: "evaluation",
      indexFile: "EVALUATION_INDEX.json",
    },
  ],
  routePrefix: "simulation-datasets",
  schemaVersion: "roboexam.simulation-datasets.v1",
  refreshMs: 300000,
});

let taskSnapshot: {
  baseVersion: string;
  catalog: RealDatasetCatalog;
  byId: Map<string, SimulationTaskSummary>;
} | undefined;

async function catalog(force = false) {
  const base = await reader.catalog(force);
  if (!force && taskSnapshot?.baseVersion === base.version) return taskSnapshot.catalog;
  const simulationTasks = await buildSimulationTaskCatalog(base);
  const value = {
    ...base,
    version: digest([base.version, simulationTasks]),
    simulationTasks,
  };
  taskSnapshot = {
    baseVersion: base.version,
    catalog: value,
    byId: new Map(simulationTasks.map(task => [task.id, task])),
  };
  return value;
}

async function dataset(id: string, taskId?: string): Promise<RealDatasetEntries | null> {
  await catalog();
  const value = await reader.dataset(id);
  if (!value || !taskId) return value;
  const task = taskSnapshot?.byId.get(taskId);
  const split = task?.splits.find(candidate => candidate.datasetId === id);
  if (!task || !split) return null;
  const episodes = split.id === "training"
    ? value.episodes.filter(episode =>
      episode.index >= task.sceneId * TRAINING_EPISODES_PER_TASK &&
      episode.index < (task.sceneId + 1) * TRAINING_EPISODES_PER_TASK)
    : value.episodes;
  if (episodes.length !== split.episodeCount) throw new Error("simulation_task_episode_count_mismatch");
  return { ...value, episodes };
}

export const simulationDatasets = {
  catalog,
  dataset,
  episode: reader.episode,
  actionTrace: reader.actionTrace,
  serveMedia: reader.serveMedia,
};
