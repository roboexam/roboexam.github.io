import type { DatasetCohort, DatasetEpisodeChunk } from './dataset-episodes.ts';

// Browser-side identity checks supplement the exporter contract and the exact chunk hash.
export function assertBrowserCohort(value: unknown, cohort: DatasetCohort): asserts value is DatasetEpisodeChunk {
  const chunk = value as DatasetEpisodeChunk | null;
  if (!chunk || chunk.schemaVersion !== 'unibench.dashboard.dataset-episode-cohort.v1'
    || chunk.cohortId !== cohort.id || chunk.taskId !== cohort.taskId || chunk.modelId !== cohort.modelId
    || chunk.pairingStatus !== cohort.pairingStatus || !Array.isArray(chunk.episodes)
    || chunk.episodes.length !== cohort.catalogEpisodeCount) throw new Error('Cohort identity or episode count mismatch');
  const ids = new Set<string>(); const positions = new Set<number>();
  for (const episode of chunk.episodes) {
    if (!episode || typeof episode.id !== 'string' || !episode.id || ids.has(episode.id)
      || episode.taskId !== cohort.taskId || episode.modelId !== cohort.modelId
      || episode.protocolKind !== cohort.protocolKind || episode.pairingStatus !== cohort.pairingStatus
      || !Number.isInteger(episode.catalogOrdinal) || episode.catalogOrdinal < 0 || episode.catalogOrdinal >= cohort.catalogEpisodeCount
      || positions.has(episode.catalogOrdinal) || !Array.isArray(episode.media) || !episode.media.length) throw new Error('Episode identity mismatch');
    if (episode.protocolKind === 'acwm_open_loop' && (episode.outcome !== 'not_applicable' || episode.finalScore !== null)) throw new Error('Open-loop predictions cannot carry policy success scores');
    const mediaIds = new Set<string>();
    for (const media of episode.media) {
      if (!media || typeof media.id !== 'string' || mediaIds.has(media.id) || !media.id.startsWith(episode.id + ':')
        || !/^[a-f0-9]{64}$/.test(media.sha256) || !Number.isSafeInteger(media.bytes) || media.bytes <= 0
        || typeof media.relativePath !== 'string' || media.relativePath.split('/').some(s => !/^[a-zA-Z0-9_.-]+$/.test(s) || s === '.' || s === '..')
        || !media.relativePath.startsWith(`${cohort.taskId}/${cohort.modelId}/`)
        || media.url !== '/api/episode-media/' + media.relativePath) throw new Error('Invalid episode media identity');
      mediaIds.add(media.id);
    }
    ids.add(episode.id); positions.add(episode.catalogOrdinal);
  }
}
