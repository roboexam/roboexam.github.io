// The three dataset cards must partition a task's episodes exactly. An OOD
// episode keeps failure_type "clean" and is told apart only by its declared
// rendering condition, which is what once made OOD runs appear under Clean
// while the OOD card sat pinned at zero.
//
// This module deliberately imports nothing: the generated bundle cannot be
// loaded by the plain Node test runner, and this split is worth unit-testing.
export type PartitionableEpisode = { type: string; oodCondition: string | null };

export function partitionEpisodes<T extends PartitionableEpisode>(episodes: T[]) {
  return {
    clean: episodes.filter((e) => e.type === "clean" && !e.oodCondition),
    recovery: episodes.filter((e) => e.type !== "clean"),
    ood: episodes.filter((e) => e.oodCondition),
  };
}
