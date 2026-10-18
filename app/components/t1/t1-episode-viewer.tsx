import type { T1Episode, T1Model } from "../../data/t1-agent-results";
import { durationText, outcomeText, reasonText, scoreText } from "./result-format";

type Props = { episode: T1Episode; model: T1Model };

export function T1EpisodeViewer({ episode, model }: Props) {
  const { execution, video } = episode;
  return <div className="t1EpisodeBody" data-episode-id={episode.id} data-video-id={video.id}>
    <div className="t1Player">
      <div className="t1PlayerBar"><span>{video.hasMotion ? "Execution" : "Initial view"}</span>
        <span>Head · Left wrist · Right wrist</span></div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Original simulation views have no speech or audio. */}
      <video key={episode.id + ":" + video.id} src={video.url} controls playsInline preload="metadata"
        aria-label={model.label + ", Stack Bowls layout " + episode.layoutId + ", " + (video.hasMotion ? "original three-view execution video" : "original three-view initial view")}>
        Your browser does not support video playback.
      </video>
      <div className="t1PlayerCaption"><strong>{model.label}</strong><span>Layout {episode.layoutId} · Original three-view video</span></div>
    </div>
    <div className="t1EpisodeFacts" aria-label="Selected episode results">
      <dl className="t1FactGrid">
        <div><dt>Native steps</dt><dd>{execution.steps.toLocaleString("en-US")}</dd></div>
        <div><dt>Observed progress</dt><dd>{scoreText(execution.progress)}<small> / 100</small></dd></div>
        <div><dt>Outcome</dt><dd className="t1Outcome">{outcomeText(execution)}</dd></div>
        <div><dt>Answer coverage</dt><dd>{episode.answered}<small> / {episode.expected}</small></dd></div>
      </dl>
      <div className="t1StopReason"><span>Stop reason</span><p>{reasonText(execution.reason)}</p></div>
      <dl className="t1EpisodeScores">
        <div><dt>Initial VQA</dt><dd>{scoreText(episode.scores.composite)}</dd></div>
        <div><dt>A1</dt><dd>{scoreText(episode.scores.a1)}</dd></div>
        <div><dt>A2</dt><dd>{scoreText(episode.scores.a2)}</dd></div>
        <div><dt>B1</dt><dd>{scoreText(episode.scores.b1)}</dd></div>
        <div><dt>C1</dt><dd>{scoreText(episode.scores.c1)}</dd></div>
      </dl>
      <p className="t1EpisodeFoot">Elapsed: {durationText(execution.elapsedSeconds)}. Native progress is separate from task success.</p>
    </div>
  </div>;
}
