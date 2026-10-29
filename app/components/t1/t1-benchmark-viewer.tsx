import type { T1BenchmarkEpisode } from "../../data/t1-benchmark-results";
import { Play } from "lucide-react";
import type { Ref, SyntheticEvent } from "react";
import { benchmarkScoreText } from "./t1-benchmark-table";

export type T1BenchmarkPlayback = {
  currentTime: number;
  duration: number;
};

export function benchmarkStepTime(episode: T1BenchmarkEpisode, step: number | null): number | null {
  const { video } = episode;
  if (!video || typeof step !== "number" || !Number.isSafeInteger(step) || step < 0 || step > episode.execution.steps ||
      typeof video.frames !== "number" || !Number.isSafeInteger(video.frames) || video.frames !== episode.execution.steps + 1 ||
      typeof video.fps !== "number" || !Number.isFinite(video.fps) || video.fps <= 0) return null;
  return Math.min(step / video.fps, (video.frames - 1) / video.fps);
}

type Props = {
  episode: T1BenchmarkEpisode;
  modelLabel: string;
  taskLabel: string;
  resultVersion: string;
  videoRef?: Ref<HTMLVideoElement>;
  onPlaybackChange?: (playback: T1BenchmarkPlayback) => void;
};

export function T1BenchmarkSceneGallery({ scenes, selectedLayoutId, onSelect }: {
  scenes: { layoutId: number; episode?: T1BenchmarkEpisode }[];
  selectedLayoutId: number;
  onSelect: (layoutId: number) => void;
}) {
  return <div className="t1bSceneGallery" role="group" aria-label="Rollout scenes">
    {scenes.map(({ layoutId, episode }, index) => <button type="button" key={layoutId}
      className="t1bSceneCard" aria-label={`Select scene ${layoutId}`} aria-pressed={selectedLayoutId === layoutId && !!episode?.video}
      disabled={!episode?.video} onClick={() => onSelect(layoutId)} data-rollout-slot={index + 1} data-layout-id={layoutId}>
      <span className="t1bScenePreview">
        {episode?.video && <>
          <video key={`${episode.resultVersion}:${episode.id}:${episode.attempt}:${episode.video.id}`} src={episode.video.url} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
            <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/>
          </video>
          <span className="t1bScenePlay"><Play size={17} fill="currentColor" aria-hidden="true"/></span>
        </>}
      </span>
      <span className="t1bSceneCaption"><strong>Rollout {index + 1}</strong><span>Scene {layoutId}</span></span>
    </button>)}
  </div>;
}

export function T1BenchmarkEmptyViewer({ modelLabel, taskLabel }: { modelLabel: string; taskLabel: string }) {
  return <div className="t1bEmptyPlayer" role="img" aria-label={`${modelLabel}, ${taskLabel}, rollout player`}/>;
}

function elapsedText(value: number | null): string {
  if (value === null) return "—";
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function T1BenchmarkViewer({ episode, modelLabel, taskLabel, resultVersion, videoRef, onPlaybackChange }: Props) {
  const { execution, video } = episode;
  const videoLabel = video?.hasMotion === false ? "Saved observation" : "Saved rollout";
  const identity = `${episode.modelId}:${episode.taskId}:${episode.layoutId}:${resultVersion}:${episode.attempt}:${video?.id ?? episode.id}`;
  const outcome = execution.success === true ? "Success" : execution.success === false ? "Failure" : "—";
  const reportPlayback = (event: SyntheticEvent<HTMLVideoElement>) => {
    const player = event.currentTarget;
    onPlaybackChange?.({
      currentTime: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
    });
  };
  return <div className={`t1bEpisode${video ? "" : " t1bEpisodeFactsOnly"}`} data-episode-id={episode.id}
    data-model-id={episode.modelId} data-task-id={episode.taskId} data-layout-id={episode.layoutId}
    data-result-version={resultVersion} data-attempt={episode.attempt} data-video-id={video?.id}>
    {video && <div className="t1bPlayer">
      <div className="t1bPlayerBar"><span>{videoLabel}</span><span>Head · Left wrist · Right wrist</span></div>
      <video key={identity} ref={videoRef} src={video.url} controls playsInline preload="metadata"
        onDurationChange={reportPlayback} onLoadedMetadata={reportPlayback} onSeeked={reportPlayback} onTimeUpdate={reportPlayback}
        aria-label={`${modelLabel}, ${taskLabel}, scene ${episode.layoutId}, ${video?.hasMotion === false ? "saved observation" : "original rollout video"}`}>
        <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/>
        Your browser does not support video playback.
      </video>
      <div className="t1bPlayerCaption"><strong>{taskLabel}</strong><span>{modelLabel} · Scene {episode.layoutId}</span></div>
    </div>}
    <div className="t1bEpisodeFacts">
      <p className="eyebrow">Selected execution</p>
      <h4>{taskLabel}</h4>
      <dl className="t1bFactGrid">
        <div><dt>Subtask score</dt><dd>{benchmarkScoreText(execution.subtask)}<small> / 100</small></dd></div>
        <div><dt>Result</dt><dd className="t1bOutcome">{outcome}</dd></div>
        <div><dt>Native steps</dt><dd>{execution.steps.toLocaleString("en-US")}</dd></div>
        <div><dt>Elapsed</dt><dd className="t1bElapsed">{elapsedText(execution.elapsedSeconds)}</dd></div>
      </dl>
    </div>
  </div>;
}
