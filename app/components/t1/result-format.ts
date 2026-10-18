import type { T1Episode } from "../../data/t1-agent-results";

export function scoreText(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function durationText(seconds: number | null): string {
  if (seconds === null) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return rounded + " s";
  const minutes = Math.floor(rounded / 60);
  return minutes < 60
    ? minutes + " min " + (rounded % 60) + " s"
    : Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";
}

export function outcomeText(execution: T1Episode["execution"]): string {
  if (execution.success === true) return "Succeeded";
  if (execution.success === false) return "Not completed";
  return execution.state === "not_started" ? "Unknown · not started" : "Unknown · stopped";
}

export function reasonText(reason: string): string {
  return reason ? reason.replaceAll("_", " ").replaceAll(":", " · ") : "Not reported";
}

export function findEpisode(episodes: T1Episode[], modelId: string, layoutId: number): T1Episode | undefined {
  return episodes.find((episode) => episode.modelId === modelId && episode.layoutId === layoutId);
}
