import details from "./generated/t1-unibench-vqa.json" with { type: "json" };
import { t1UnibenchResults, type T1UnibenchResults } from "./t1-unibench-results.ts";
import type { T1UnibenchVqaBundle, T1UnibenchVqaEpisode } from "./t1-unibench-vqa.ts";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,160}$/;

export class T1UnibenchVqaInvalid extends Error {
  constructor() { super("Invalid T1 UniBench VQA publication"); this.name = "T1UnibenchVqaInvalid"; }
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new T1UnibenchVqaInvalid();
}

/** Index the static VQA publication by episode, accepting only episodes of the formal board. */
export function createT1UnibenchVqaStore(raw: T1UnibenchVqaBundle, formal: T1UnibenchResults) {
  requireValid(raw.schemaVersion === "roboexam.t1-unibench-vqa.v1" && raw.resultVersion === formal.resultVersion);
  const allowed = new Map(formal.episodes.map((episode) => [episode.id, episode]));
  const episodes = new Map<string, T1UnibenchVqaEpisode>();
  for (const episode of raw.episodes) {
    const source = allowed.get(episode.episodeId);
    requireValid(source && !episodes.has(episode.episodeId));
    requireValid(source.modelId === episode.modelId && source.split === episode.split && source.taskId === episode.taskId);
    episodes.set(episode.episodeId, Object.freeze(episode));
  }
  return Object.freeze({ getEpisode(id: string): T1UnibenchVqaEpisode | null { return ID.test(id) ? episodes.get(id) ?? null : null; } });
}

let store: ReturnType<typeof createT1UnibenchVqaStore> | undefined;

/** Only the server imports the detailed static JSON. No filesystem or network access. */
export function getT1UnibenchVqaEpisode(id: string): T1UnibenchVqaEpisode | null {
  if (typeof id !== "string" || !ID.test(id)) return null;
  store ??= createT1UnibenchVqaStore(details as T1UnibenchVqaBundle, t1UnibenchResults);
  return store.getEpisode(id);
}
