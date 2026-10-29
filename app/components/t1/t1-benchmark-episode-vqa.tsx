"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { T1BenchmarkEpisode } from "../../data/t1-benchmark-results";
import type { T1BenchmarkVqaCheckpoint, T1BenchmarkVqaEpisode } from "../../data/t1-benchmark-vqa";
import { benchmarkScoreText } from "./t1-benchmark-table";
import { benchmarkStepTime, type T1BenchmarkPlayback } from "./t1-benchmark-viewer";
import { metricDisplayLabel, metricSummary } from "./metric-presentation";

type Props = {
  episode: T1BenchmarkEpisode;
  modelLabel: string;
  taskLabel: string;
  resultVersion: string;
  playback?: T1BenchmarkPlayback;
  onSeek?: (seconds: number) => void;
};

const capabilityGroups = [
  { label: "Perception", ids: ["a1", "a2", "a3"] },
  { label: "Understanding", ids: ["b1", "b3", "b_interaction"] },
  { label: "Reasoning", ids: ["c1", "c2", "c3"] },
];

const label = (id: string) => metricDisplayLabel({ id, label: id });
const summary = (id: string) => metricSummary({ id, definition: "" });
const stageLabel = (id: string) => id.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function ModelAnswer({ text }: { text: string }) {
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll long answers.
  return <pre className="t1bVqaResponse" tabIndex={0} aria-label="Model first answer">{text}</pre>;
}

function QuestionText({ text }: { text: string }) {
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll long public prompts.
  return <p className="t1bVqaPrompt" tabIndex={0} aria-label="Question">{text}</p>;
}

export function sameVqaEpisode(detail: T1BenchmarkVqaEpisode, episode: T1BenchmarkEpisode, resultVersion: string): boolean {
  return (episode.resultVersion ?? resultVersion) === resultVersion &&
    detail.episodeId === episode.id && detail.resultVersion === resultVersion &&
    detail.modelId === episode.modelId && detail.taskId === episode.taskId &&
    detail.layoutId === episode.layoutId && detail.attempt === episode.attempt;
}

export function vqaEpisodeIdentity(episode: T1BenchmarkEpisode, resultVersion: string): string {
  return JSON.stringify([resultVersion, episode.modelId, episode.taskId, episode.layoutId, episode.attempt, episode.id]);
}

function VqaScore({ id, value }: { id: string; value: number | null | undefined }) {
  return <span className="t1bVqaScore" aria-label={`${label(id)}: ${benchmarkScoreText(value)} out of 100`}>
    {benchmarkScoreText(value)}<small> / 100</small>
  </span>;
}

function CheckpointScores({ point }: { point: T1BenchmarkVqaCheckpoint }) {
  return <span className="t1bVqaCheckpointScores">
    <span>Task Tracking <VqaScore id="c2" value={point.scores.c2}/></span>
    <span>Next Action <VqaScore id="c3" value={point.scores.c3}/></span>
  </span>;
}

function CheckpointBody({ point }: { point: T1BenchmarkVqaCheckpoint }) {
  return <div className="t1bVqaAnswerBody">
    <dl className="t1bVqaAnswerMeta">
      {point.triggerStep !== null && <div><dt>Native trigger step</dt><dd>{point.triggerStep}</dd></div>}
      {point.returnStep !== null && <div><dt>Returned context step</dt><dd>{point.returnStep}</dd></div>}
    </dl>
    {point.question !== null && <><h5>Question</h5><QuestionText text={point.question}/></>}
    {point.response !== null && <><h5>Model first answer</h5><ModelAnswer text={point.response}/></>}
    {point.status === "reached_reference_blocked" && <p className="t1bVqaPolicyNote">Checkpoint reached; public Q&amp;A is unavailable under the registered zero-score policy.</p>}
  </div>;
}

export function checkpointTimeSeconds(
  point: T1BenchmarkVqaCheckpoint,
  episode: T1BenchmarkEpisode,
): number | null {
  return benchmarkStepTime(episode, point.triggerStep);
}

function checkpointTimeText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function LegacyProcessCheckpoints({ checkpoints }: { checkpoints: T1BenchmarkVqaCheckpoint[] }) {
  return <div className="t1bVqaQuestionList">{checkpoints.map((point) => {
    if (point.status === "not_reached") return <div className="t1bVqaUnreached" key={point.slotId} data-vqa-slot-id={point.slotId}>
      <span className="t1bVqaQuestionTitle"><span>Not reached</span><strong>{stageLabel(point.stageId)}</strong></span><CheckpointScores point={point}/>
    </div>;
    return <details className="t1bVqaQuestion t1bVqaCheckpoint" key={point.slotId} data-vqa-slot-id={point.slotId} data-score-origin={point.scoreOrigin}>
      <summary><span className="t1bVqaQuestionTitle"><span>{point.status === "scored" ? "Answered" : "Checkpoint"}</span><strong>{stageLabel(point.stageId)}</strong></span><CheckpointScores point={point}/><ChevronDown size={16} aria-hidden="true"/></summary>
      <CheckpointBody point={point}/>
    </details>;
  })}</div>;
}

function SynchronizedProcessCheckpoints({ detail, episode, playback, onSeek }: {
  detail: T1BenchmarkVqaEpisode;
  episode: T1BenchmarkEpisode;
  playback: T1BenchmarkPlayback;
  onSeek: (seconds: number) => void;
}) {
  const timed = detail.checkpoints.flatMap((point) => {
    const time = checkpointTimeSeconds(point, episode);
    return time === null ? [] : [{ point, time, returnTime: benchmarkStepTime(episode, point.returnStep) }];
  }).sort((left, right) => left.time - right.time);
  const unreached = detail.checkpoints.filter((point) => point.status === "not_reached");
  const latest = [...timed].reverse().find((item) => item.time <= playback.currentTime + 0.001);
  const latestReturnTime = latest?.returnTime ?? null;
  const next = timed.find((item) => item.time > playback.currentTime + 0.001);
  const nominalDuration = benchmarkStepTime(episode, episode.execution.steps) ?? 0;
  const duration = playback.duration > 0 ? playback.duration : nominalDuration;
  const progress = duration > 0 ? Math.min(100, Math.max(0, playback.currentTime / duration * 100)) : 0;

  return <div className="t1bVqaSync">
    {timed.length > 0 ? <>
      <div className="t1bVqaTimeline" aria-hidden="true">
        <span className="t1bVqaTimelineRail"><span style={{ width: `${progress}%` }}/></span>
        {timed.map(({ point, time }, index) => {
          const position = episode.execution.steps > 0 && point.triggerStep !== null
            ? Math.min(100, point.triggerStep / episode.execution.steps * 100)
            : duration > 0 ? Math.min(100, time / duration * 100) : 0;
          const state = latest?.point.slotId === point.slotId ? " isLatest" : time <= playback.currentTime ? " isPast" : "";
          return <span className={`t1bVqaTimelineMarker${state}`} style={{ left: `${position}%` }} key={point.slotId}>{index + 1}</span>;
        })}
      </div>
      <div className="t1bVqaStageNav" role="group" aria-label="Video process checkpoints">
        {timed.map(({ point, time }, index) => <button type="button" key={point.slotId}
          className={latest?.point.slotId === point.slotId ? "isLatest" : time <= playback.currentTime ? "isPast" : ""}
          aria-label={`View ${stageLabel(point.stageId)} milestone trigger at ${checkpointTimeText(time)}${latest?.point.slotId === point.slotId ? ", latest reached checkpoint" : ""}`}
          onClick={() => onSeek(time)}>
          <span>Stage {index + 1} · {checkpointTimeText(time)}</span><strong>{stageLabel(point.stageId)}</strong>
        </button>)}
      </div>
      {latest ? <article className="t1bVqaActiveCheckpoint" data-vqa-slot-id={latest.point.slotId} data-score-origin={latest.point.scoreOrigin}>
        <header><div><span>Latest reached checkpoint · {checkpointTimeText(latest.time)}</span>
          <h5>{stageLabel(latest.point.stageId)}</h5></div><CheckpointScores point={latest.point}/></header>
        <div className="t1bVqaSeekControls">
          <button type="button" onClick={() => onSeek(latest.time)}>
            <span>View milestone trigger</span><strong>Step {latest.point.triggerStep} · {checkpointTimeText(latest.time)}</strong>
          </button>
          {latestReturnTime !== null && <button type="button" onClick={() => onSeek(latestReturnTime)}>
            <span>View returned context</span><strong>Step {latest.point.returnStep} · {checkpointTimeText(latestReturnTime)}</strong>
          </button>}
        </div>
        <p className="t1bVqaTimingNote">The trigger marks milestone entry; the returned context is the observation used for this VQA record.</p>
        <CheckpointBody point={latest.point}/>
      </article> : <div className="t1bVqaAwaiting" aria-live="polite">
        <strong>Play to the first checkpoint</strong>
        {next && <span>Next: {stageLabel(next.point.stageId)} at {checkpointTimeText(next.time)}</span>}
      </div>}
    </> : <div className="t1bVqaAwaiting"><strong>{detail.checkpoints.some((point) => point.status !== "not_reached")
      ? "Checkpoint timing is unavailable for this rollout."
      : "No process checkpoint was reached in this rollout."}</strong></div>}
    {unreached.length > 0 && <details className="t1bVqaUnreachedGroup">
      <summary><span>{unreached.length} planned {unreached.length === 1 ? "stage" : "stages"} not reached</span><ChevronDown size={16} aria-hidden="true"/></summary>
      <p>No timestamp or Q&amp;A was recorded; fixed-denominator protocol scores remain 0.</p>
      <div>{unreached.map((point) => <span key={point.slotId} data-vqa-slot-id={point.slotId}>{stageLabel(point.stageId)}</span>)}</div>
    </details>}
  </div>;
}

export function T1BenchmarkVqaEvidence({ detail, episode, playback, onSeek }: {
  detail: T1BenchmarkVqaEpisode;
  episode?: T1BenchmarkEpisode;
  playback?: T1BenchmarkPlayback;
  onSeek?: (seconds: number) => void;
}) {
  const answered = new Set(detail.checkpoints.filter((point) => point.status === "scored").map((point) => point.questionId)).size;
  const reached = detail.checkpoints.filter((point) => point.status !== "not_reached").length;
  const synchronized = episode !== undefined && playback !== undefined && onSeek !== undefined;
  return <div className="t1bVqaEvidence" data-vqa-detail-id={detail.episodeId}>
    <section className="t1bVqaQuestionSection" aria-label="Initial VQA questions">
      <div className="t1bVqaSectionHeading"><h4>Initial VQA</h4><span>{detail.initial.length} questions</span></div>
      <div className="t1bVqaQuestionList">{detail.initial.map((question, index) => <details className="t1bVqaQuestion" key={question.questionId} data-score-origin={question.scoreOrigin}>
        <summary>
          <span className="t1bVqaQuestionTitle"><span>{label(question.metricId)}</span><strong>{question.question}</strong></span>
          {question.score === null ? <span className="t1bVqaStatus">Not scored</span> : <VqaScore id={question.metricId} value={question.score}/>}
          <ChevronDown size={16} aria-hidden="true"/>
        </summary>
        <div className="t1bVqaAnswerBody">
          <h5>Question {index + 1}</h5><QuestionText text={question.question}/>
          {question.response !== null && <><h5>Model first answer</h5><ModelAnswer text={question.response}/></>}
          {question.formatCompliant !== null && <dl className="t1bVqaAnswerMeta"><div><dt>Response format</dt><dd>{question.formatCompliant ? "Matched template" : "Different from template"}</dd></div></dl>}
        </div>
      </details>)}</div>
    </section>
    <section className="t1bVqaQuestionSection" aria-label="Process VQA checkpoints">
      <div className="t1bVqaSectionHeading"><h4>Process checkpoints</h4><span>{synchronized
        ? `${answered} answered · ${reached} reached · ${detail.checkpoints.length} planned`
        : `${answered} answered · ${detail.checkpoints.length} checkpoints`}</span></div>
      {synchronized
        ? <SynchronizedProcessCheckpoints detail={detail} episode={episode} playback={playback} onSeek={onSeek}/>
        : <LegacyProcessCheckpoints checkpoints={detail.checkpoints}/>}
    </section>
  </div>;
}

export function T1BenchmarkEpisodeVqa({ episode, modelLabel, taskLabel, resultVersion, playback, onSeek }: Props) {
  const headingId = useId();
  const [loaded, setLoaded] = useState<{ identity: string; detail: T1BenchmarkVqaEpisode | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const identity = vqaEpisodeIdentity(episode, resultVersion);
  const selectedDetail = loaded?.identity === identity && loaded.detail && sameVqaEpisode(loaded.detail, episode, resultVersion) ? loaded.detail : null;
  const failed = loaded?.identity === identity && loaded.failed;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/t1-benchmark-vqa/${encodeURIComponent(episode.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("VQA request failed");
        const record: T1BenchmarkVqaEpisode = await response.json();
        if (!sameVqaEpisode(record, episode, resultVersion)) throw new Error("VQA episode mismatch");
        if (!controller.signal.aborted) setLoaded({ identity, detail: record, failed: false });
      })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ identity, detail: null, failed: true }); });
    return () => controller.abort();
  }, [episode, identity, resultVersion, retry]);

  return <section className="t1bEpisodeVqa" aria-labelledby={headingId} data-vqa-episode-id={episode.id}
    data-model-id={episode.modelId} data-task-id={episode.taskId} data-result-version={resultVersion}
    data-layout-id={episode.layoutId} data-attempt={episode.attempt}>
    <div className="t1bVqaHeading"><div><p className="eyebrow">Selected episode</p><h3 id={headingId}>VQA results</h3></div>
      <span>{modelLabel} · {taskLabel} · Scene {episode.layoutId}</span></div>
    <dl className="t1bVqaOverview">{["vqa", "a", "b", "c"].map((id) => <div key={id} className={id === "vqa" ? "t1bVqaTotal" : undefined}>
      <dt title={summary(id)}>{label(id)}</dt><dd><VqaScore id={id} value={episode.scores[id]}/></dd>
    </div>)}</dl>
    <div className="t1bVqaCapabilities">{capabilityGroups.map((group) => <section key={group.label} aria-label={`${group.label} scores`}>
      <h4>{group.label}</h4><dl>{group.ids.filter((id) => typeof episode.scores[id] === "number").map((id) => <div key={id}>
        <dt title={summary(id)}>{label(id)}</dt><dd>{benchmarkScoreText(episode.scores[id])}</dd>
      </div>)}</dl>
    </section>)}</div>
    {selectedDetail ? <T1BenchmarkVqaEvidence key={`${resultVersion}:${episode.id}`} detail={selectedDetail}
      episode={episode} playback={playback} onSeek={onSeek}/>
      : failed ? <div className="t1bVqaLoadError" role="alert">VQA details could not be loaded. <button type="button" onClick={() => { setLoaded(null); setRetry((value) => value + 1); }}>Retry</button></div>
      : <div className="t1bVqaLoading" role="status" aria-label="Loading episode VQA details"/>}
  </section>;
}
