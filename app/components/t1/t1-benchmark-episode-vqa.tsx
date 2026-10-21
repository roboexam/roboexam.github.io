"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { T1BenchmarkEpisode } from "../../data/t1-benchmark-results";
import type { T1BenchmarkVqaEpisode } from "../../data/t1-benchmark-vqa";
import { benchmarkScoreText } from "./t1-benchmark-table";
import { metricDisplayLabel, metricSummary } from "./metric-presentation";

type Props = {
  episode: T1BenchmarkEpisode;
  modelLabel: string;
  taskLabel: string;
  resultVersion: string;
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
  return detail.episodeId === episode.id && detail.resultVersion === resultVersion &&
    detail.modelId === episode.modelId && detail.taskId === episode.taskId &&
    detail.layoutId === episode.layoutId && detail.attempt === episode.attempt;
}

function VqaScore({ id, value }: { id: string; value: number | null | undefined }) {
  return <span className="t1bVqaScore" aria-label={`${label(id)}: ${benchmarkScoreText(value)} out of 100`}>
    {benchmarkScoreText(value)}<small> / 100</small>
  </span>;
}

export function T1BenchmarkVqaEvidence({ detail }: { detail: T1BenchmarkVqaEpisode }) {
  const answered = detail.checkpoints.filter((point) => point.status === "scored").length;
  return <div className="t1bVqaEvidence" data-vqa-detail-id={detail.episodeId}>
    <section className="t1bVqaQuestionSection" aria-label="Initial VQA questions">
      <div className="t1bVqaSectionHeading"><h4>Initial VQA</h4><span>{detail.initial.length} questions</span></div>
      <div className="t1bVqaQuestionList">{detail.initial.map((question, index) => <details className="t1bVqaQuestion" key={question.questionId}>
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
      <div className="t1bVqaSectionHeading"><h4>Process checkpoints</h4><span>{answered} answered · {detail.checkpoints.length} checkpoints</span></div>
      <div className="t1bVqaQuestionList">{detail.checkpoints.map((point) => {
        const scores = <span className="t1bVqaCheckpointScores"><span>Task Tracking <VqaScore id="c2" value={point.scores.c2}/></span><span>Next Action <VqaScore id="c3" value={point.scores.c3}/></span></span>;
        if (point.status === "not_reached") return <div className="t1bVqaUnreached" key={point.slotId} data-vqa-slot-id={point.slotId}>
          <span className="t1bVqaQuestionTitle"><span>Not reached</span><strong>{stageLabel(point.stageId)}</strong></span>{scores}
        </div>;
        return <details className="t1bVqaQuestion t1bVqaCheckpoint" key={point.slotId} data-vqa-slot-id={point.slotId}>
          <summary><span className="t1bVqaQuestionTitle"><span>Answered</span><strong>{stageLabel(point.stageId)}</strong></span>{scores}<ChevronDown size={16} aria-hidden="true"/></summary>
          <div className="t1bVqaAnswerBody">
            <dl className="t1bVqaAnswerMeta">
              {point.triggerStep !== null && <div><dt>Native trigger step</dt><dd>{point.triggerStep}</dd></div>}
              {point.returnStep !== null && <div><dt>Returned context step</dt><dd>{point.returnStep}</dd></div>}
            </dl>
            {point.question !== null && <><h5>Question</h5><QuestionText text={point.question}/></>}
            {point.response !== null && <><h5>Model first answer</h5><ModelAnswer text={point.response}/></>}
          </div>
        </details>;
      })}</div>
    </section>
  </div>;
}

export function T1BenchmarkEpisodeVqa({ episode, modelLabel, taskLabel, resultVersion }: Props) {
  const headingId = useId();
  const [detail, setDetail] = useState<T1BenchmarkVqaEpisode | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const selectedDetail = detail && sameVqaEpisode(detail, episode, resultVersion) ? detail : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/t1-benchmark-vqa/${encodeURIComponent(episode.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("VQA request failed");
        const record: T1BenchmarkVqaEpisode = await response.json();
        if (!sameVqaEpisode(record, episode, resultVersion)) throw new Error("VQA episode mismatch");
        if (!controller.signal.aborted) { setDetail(record); setFailed(false); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [episode, resultVersion, retry]);

  return <section className="t1bEpisodeVqa" aria-labelledby={headingId} data-vqa-episode-id={episode.id}>
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
    {selectedDetail ? <T1BenchmarkVqaEvidence key={`${resultVersion}:${episode.id}`} detail={selectedDetail}/>
      : failed ? <div className="t1bVqaLoadError" role="alert">VQA details could not be loaded. <button type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>Retry</button></div>
      : <div className="t1bVqaLoading" role="status" aria-label="Loading episode VQA details"/>}
  </section>;
}
