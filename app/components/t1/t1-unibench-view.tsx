"use client";

import { ChevronDown, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  T1_SPLITS, t1UnibenchResults,
  type T1SplitId, type T1SplitMetrics, type T1UnibenchEpisode, type T1UnibenchModel, type T1UnibenchResults,
} from "../../data/t1-unibench-results";
import type { T1UnibenchVqaEpisode } from "../../data/t1-unibench-vqa";
import { dataUrl, STATIC_SITE, withMedia } from "../../static-site";

type Selection = { modelId: string; split: T1SplitId; taskId: string; episodeId: string | null };
type HeadlineId = "score" | "subtask" | "success" | "vqa";

const SPLIT_SHORT: Record<T1SplitId, string> = { ID: "ID", V: "V-OOD", S: "S-OOD", B: "B-OOD", REC: "Recovery" };
const SPLIT_LABEL: Record<T1SplitId, string> = {
  ID: "In-distribution", V: "Visual OOD", S: "Semantic OOD", B: "Behavioral OOD", REC: "Failure recovery",
};
const HEADLINES: { id: HeadlineId; label: string; note: string }[] = [
  { id: "score", label: "Setting score", note: "0.7 × Subtask + 0.3 × VQA (Recovery: Subtask)" },
  { id: "subtask", label: "Subtask", note: "Native stage score, or success where a task has no stages" },
  { id: "success", label: "Success", note: "Native task success rate" },
  { id: "vqa", label: "VQA", note: "(A + B + C1) / 3 from first answers before control" },
];
const BREAKDOWN: { id: keyof T1SplitMetrics; label: string; title: string }[] = [
  { id: "score", label: "Score", title: "0.7 × Subtask + 0.3 × VQA" },
  { id: "subtask", label: "Subtask", title: "Native stage score" },
  { id: "success", label: "Success", title: "Native task success" },
  { id: "vqa", label: "VQA", title: "(A + B + C1) / 3" },
  { id: "a", label: "A · Perception", title: "Object facts, localization, relations" },
  { id: "b", label: "B · Understanding", title: "Goal binding and constraints" },
  { id: "c1", label: "C1 · Full plan", title: "Initial high-level plan" },
  { id: "c2", label: "C2 · Milestones", title: "Completed-milestone set at reached checkpoints" },
  { id: "c3", label: "C3 · Next action", title: "Next action at reached checkpoints" },
];
const REC_BREAKDOWN: { id: keyof T1SplitMetrics; label: string; title: string }[] = [
  { id: "subtask", label: "Recovery score", title: "Native score at the end of the takeover" },
  { id: "success", label: "Recovery success", title: "Native task success after takeover" },
  { id: "scoreGain", label: "Score gain", title: "End score minus the score already reached at takeover" },
];

export const scoreText = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";

function splitValue(model: T1UnibenchModel, split: T1SplitId, metric: keyof T1SplitMetrics): number | null {
  const value = model.splits[split]?.[metric];
  return typeof value === "number" ? value : null;
}

export function unibenchEpisodes(results: T1UnibenchResults, modelId: string, split: T1SplitId, taskId?: string) {
  return results.episodes
    .filter((e) => e.modelId === modelId && e.split === split && (taskId === undefined || e.taskId === taskId))
    .sort((a, b) => a.slot.localeCompare(b.slot, "en", { numeric: true }));
}

export function firstUnibenchSelection(results: T1UnibenchResults, modelId: string, split?: T1SplitId, taskId?: string): Selection {
  const splits = split ? [split, ...T1_SPLITS.filter((s) => s !== split)] : T1_SPLITS;
  for (const candidate of splits) {
    const own = unibenchEpisodes(results, modelId, candidate);
    if (!own.length) continue;
    const task = own.some((e) => e.taskId === taskId) ? taskId! : own[0].taskId;
    const first = unibenchEpisodes(results, modelId, candidate, task)[0];
    return { modelId, split: candidate, taskId: task, episodeId: first?.id ?? null };
  }
  return { modelId, split: split ?? "ID", taskId: taskId ?? results.tasks[0]?.id ?? "", episodeId: null };
}

function Scoreboard({ results, selectedModelId, onModel }: {
  results: T1UnibenchResults; selectedModelId: string; onModel: (id: string) => void;
}) {
  return <div className="trackMetricTableWrap t1uBoardWrap" role="region" aria-label="Track 1 leaderboard by evaluation setting, horizontally scrollable"
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
    tabIndex={0}>
    <table className="trackMetricTable methodLeaderboard t1uBoard">
      <caption className="srOnly">Scores out of 100 for each model and evaluation setting. A dash means the setting has not been run for that model.</caption>
      <thead>
        <tr>
          <th scope="col" rowSpan={2}>Model</th>
          <th className="overallScoreHead" scope="col" rowSpan={2}><span>Overall</span><small>70% Subtask · 30% VQA</small></th>
          {HEADLINES.map((metric) => <th className="metricGroupHead" key={metric.id} scope="colgroup" colSpan={T1_SPLITS.length}>
            <div className="t1uGroupTitle"><strong>{metric.label}</strong><span>{metric.note}</span></div>
          </th>)}
        </tr>
        <tr>{HEADLINES.flatMap((metric) => T1_SPLITS.map((split) =>
          <th className={`settingHead setting-${split}`} key={`${metric.id}:${split}`} scope="col" title={SPLIT_LABEL[split]}>{SPLIT_SHORT[split]}</th>))}</tr>
      </thead>
      <tbody>{results.models.map((model) => <tr key={model.id} className={model.id === selectedModelId ? "t1uSelected" : undefined}>
        <th scope="row"><button type="button" className="t1uModelButton" aria-pressed={model.id === selectedModelId} onClick={() => onModel(model.id)}>
          <strong>{model.label}</strong><span>{model.splitsPresent.length} of 5 settings</span>
        </button></th>
        <td className="overallScoreCell" title="Reported when ID, V-OOD, S-OOD, B-OOD and Recovery are all available.">
          <strong>{scoreText(model.overall?.overall)}</strong>
          <span aria-label={`${model.splitsPresent.length} of 5 settings available`}>{T1_SPLITS.map((split) =>
            <i key={split} className={model.splits[split] ? "is-available" : ""}/>)}</span>
        </td>
        {HEADLINES.flatMap((metric) => T1_SPLITS.map((split) => {
          const value = metric.id === "vqa" && split === "REC" ? null : splitValue(model, split, metric.id);
          const m = model.splits[split];
          return <td key={`${metric.id}:${split}`} data-setting={split} className="t1uCell">
            <span className={value === null ? "t1uPending" : undefined}
              title={m ? `${m.tasks} tasks · ${m.cases} episodes` : metric.id === "vqa" && split === "REC" ? "Recovery has no VQA" : "Not run yet"}>
              {scoreText(value)}{value !== null && metric.id === "score" && <small>N={m!.cases}</small>}
            </span>
          </td>;
        }))}
      </tr>)}</tbody>
    </table>
  </div>;
}

function Breakdown({ results }: { results: T1UnibenchResults }) {
  const [split, setSplit] = useState<T1SplitId>("ID");
  const columns = split === "REC" ? REC_BREAKDOWN : BREAKDOWN;
  return <section className="t1uSection" aria-labelledby="t1u-breakdown">
    <header className="t1uSectionHeading"><div><p className="eyebrow">Capability breakdown</p><h3 id="t1u-breakdown">{SPLIT_LABEL[split]}</h3></div>
      <div className="reportSwitch t1uSplitTabs" role="group" aria-label="Evaluation setting">{T1_SPLITS.map((id) =>
        <button key={id} type="button" aria-pressed={split === id} onClick={() => setSplit(id)}>{SPLIT_SHORT[id]}</button>)}</div>
    </header>
    <div className="t1bTableScroll" role="region" aria-label={`${SPLIT_LABEL[split]} capability breakdown`}
      /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
      tabIndex={0}>
      <table className="t1bTable t1uBreakdown">
        <thead><tr><th scope="col">Model</th>{columns.map((c) => <th key={c.id} scope="col" title={c.title}>{c.label}</th>)}<th scope="col">Episodes</th></tr></thead>
        <tbody>{results.models.map((model) => {
          const m = model.splits[split];
          return <tr key={model.id}><th scope="row">{model.label}</th>
            {columns.map((c) => <td key={c.id}><span className={m && typeof m[c.id] === "number" ? "t1uValue" : "t1uPending"}>
              {scoreText(m ? (m[c.id] as number | null) : null)}</span></td>)}
            <td><span className="t1uValue">{m ? `${m.cases} · ${m.tasks} tasks` : "not run"}</span></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {split !== "REC" && <p className="t1uNote">C2/C3 process checkpoints are shown where they were asked; they are not part of the VQA column yet.</p>}
  </section>;
}

function TaskMatrix({ results, model, onPick }: {
  results: T1UnibenchResults; model: T1UnibenchModel; onPick: (split: T1SplitId, taskId: string) => void;
}) {
  return <section className="t1uSection" aria-labelledby="t1u-tasks">
    <header className="t1uSectionHeading"><div><p className="eyebrow">Per task · {model.label}</p><h3 id="t1u-tasks">Subtask score by setting</h3></div></header>
    <div className="t1bTableScroll" role="region" aria-label="Per-task subtask scores"
      /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
      tabIndex={0}>
      <table className="t1bTable t1uTaskMatrix">
        <thead><tr><th scope="col">Task</th>{T1_SPLITS.map((s) => <th key={s} scope="col">{SPLIT_SHORT[s]}</th>)}</tr></thead>
        <tbody>{results.tasks.map((task) => <tr key={task.id}><th scope="row">{task.label}</th>
          {T1_SPLITS.map((split) => {
            const row = model.splits[split]?.perTask[task.id];
            if (!row) return <td key={split}><span className="t1uPending">—</span></td>;
            const level = Math.round(Math.min(100, Math.max(0, row.subtask ?? 0)) / 25);
            return <td key={split} data-level={level}><button type="button" className="t1uTaskCell"
              onClick={() => onPick(split, task.id)}
              aria-label={`${task.label}, ${SPLIT_LABEL[split]}: subtask ${scoreText(row.subtask)}, ${row.cases} episodes. Open rollouts.`}>
              <strong>{scoreText(row.subtask)}</strong><small>{split === "REC" ? `success ${scoreText(row.success)}` : `VQA ${scoreText(row.vqa)}`}</small>
            </button></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function elapsedText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function EpisodeVqa({ episode }: { episode: T1UnibenchEpisode }) {
  const [state, setState] = useState<{ id: string; detail: T1UnibenchVqaEpisode | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl(`/api/t1-unibench-vqa/${encodeURIComponent(episode.id)}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("VQA request failed");
        const detail: T1UnibenchVqaEpisode = await response.json();
        if (detail.episodeId !== episode.id || detail.modelId !== episode.modelId) throw new Error("VQA episode mismatch");
        setState({ id: episode.id, detail, failed: false });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ id: episode.id, detail: null, failed: true }); });
    return () => controller.abort();
  }, [episode.id, episode.modelId]);
  const detail = state?.id === episode.id ? state.detail : null;
  const s = episode.scores;
  return <section className="t1bEpisodeVqa t1uVqa" aria-label="Episode VQA">
    <div className="t1bVqaHeading"><div><p className="eyebrow">Selected episode</p><h3>VQA</h3></div>
      {detail?.instruction && <span className="t1uInstruction">Instruction: {detail.instruction}</span>}</div>
    {episode.split === "REC"
      ? <p className="t1uNote">Failure recovery measures execution only: the recorded failure is replayed, then the model takes over. No VQA is asked.</p>
      : <dl className="t1bVqaOverview t1uVqaOverview">{(["vqa", "a", "b", "c1", "c2", "c3"] as const).map((id) =>
        <div key={id} className={id === "vqa" ? "t1bVqaTotal" : undefined}><dt>{id === "vqa" ? "VQA" : id.toUpperCase()}</dt>
          <dd><span className="t1bVqaScore">{scoreText(s[id])}<small> / 100</small></span></dd></div>)}</dl>}
    {detail && detail.initial.length > 0 && <div className="t1bVqaQuestionSection">
      <div className="t1bVqaSectionHeading"><h4>Initial questions</h4><span>{detail.initial.length} questions · first answers before control</span></div>
      <div className="t1bVqaQuestionList">{detail.initial.map((q, index) => <details className="t1bVqaQuestion" key={q.questionId}>
        <summary><span className="t1bVqaQuestionTitle"><span>{q.metricId.toUpperCase()}</span><strong>{q.question}</strong></span>
          {q.score === null ? <span className="t1bVqaStatus">{q.status === "not_graded" ? "Not scored" : "—"}</span>
            : <span className="t1bVqaScore">{scoreText(q.score)}<small> / 100</small></span>}
          <ChevronDown size={16} aria-hidden="true"/></summary>
        <div className="t1bVqaAnswerBody"><h5>Question {index + 1}</h5><p className="t1bVqaPrompt">{q.question}</p>
          <h5>Model first answer</h5>
          {q.response !== null ? <pre className="t1bVqaResponse">{q.response}</pre> : <p className="t1uNote">No answer was recorded{q.status === "policy_zero" ? " (scored 0 under the missing-answer policy)" : ""}.</p>}
        </div>
      </details>)}</div>
    </div>}
    {detail && detail.checkpoints.length > 0 && <div className="t1bVqaQuestionSection">
      <div className="t1bVqaSectionHeading"><h4>Process checkpoints (C2/C3)</h4>
        <span>{detail.checkpoints.filter((c) => c.status === "scored").length} answered · {detail.checkpoints.length} {STATIC_SITE ? "checkpoints" : "planned"}</span></div>
      <div className="t1bVqaQuestionList">{detail.checkpoints.map((c) => <div className="t1bVqaUnreached t1uCheckpoint" key={c.slotId}>
        <span className="t1bVqaQuestionTitle"><span>{c.status.replaceAll("_", " ")}</span><strong>{c.slotId.toLowerCase().replaceAll("_", " ")}</strong></span>
        <span className="t1bVqaCheckpointScores"><span>C2 <span className="t1bVqaScore">{scoreText(c.c2)}</span></span><span>C3 <span className="t1bVqaScore">{scoreText(c.c3)}</span></span></span>
        <span/>
      </div>)}</div>
    </div>}
    {state?.failed && state.id === episode.id && <div className="t1bVqaLoadError" role="alert">VQA details could not be loaded.</div>}
    {!state && <div className="t1bVqaLoading" role="status" aria-label="Loading episode VQA"/>}
  </section>;
}

function Explorer({ results, selection, setSelection }: {
  results: T1UnibenchResults; selection: Selection; setSelection: (next: Selection) => void;
}) {
  const id = useId();
  const [view, setView] = useState<"takeover" | "replay">("takeover");
  const model = results.models.find((m) => m.id === selection.modelId);
  const task = results.tasks.find((t) => t.id === selection.taskId);
  const splitEpisodes = unibenchEpisodes(results, selection.modelId, selection.split);
  const taskIds = new Set(splitEpisodes.map((e) => e.taskId));
  const scenes = unibenchEpisodes(results, selection.modelId, selection.split, selection.taskId);
  const episode = scenes.find((e) => e.id === selection.episodeId) ?? scenes[0];
  const replayVideo = withMedia(episode?.replayVideo);
  const video = withMedia(view === "replay" && replayVideo ? episode?.replayVideo : episode?.video);
  return <section className="t1bViewerSection t1uSection" aria-labelledby={`${id}-title`}>
    <header className="t1bViewerHeading"><div><p className="eyebrow">Saved executions</p><h3 id={`${id}-title`}>Explore rollouts</h3></div>
      <div className="t1bViewerControls">
        <label>Model<select aria-label="Rollout model" value={selection.modelId}
          onChange={(e) => setSelection(firstUnibenchSelection(results, e.target.value, selection.split, selection.taskId))}>
          {results.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label>Setting<select aria-label="Rollout setting" value={selection.split}
          onChange={(e) => setSelection(firstUnibenchSelection(results, selection.modelId, e.target.value as T1SplitId, selection.taskId))}>
          {T1_SPLITS.map((s) => <option key={s} value={s} disabled={!model?.splits[s]}>{SPLIT_LABEL[s]}{model?.splits[s] ? "" : " (not run)"}</option>)}</select></label>
        <label>Task<select aria-label="Rollout task" value={selection.taskId}
          onChange={(e) => setSelection(firstUnibenchSelection(results, selection.modelId, selection.split, e.target.value))}>
          {results.tasks.filter((t) => taskIds.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      </div>
    </header>
    <div className="t1bSceneGallery" role="group" aria-label="Episodes of this task and setting">
      {scenes.map((e) => <button type="button" key={e.id} className="t1bSceneCard" aria-pressed={e.id === episode?.id}
        onClick={() => { setView("takeover"); setSelection({ ...selection, episodeId: e.id }); }}>
        <span className="t1bScenePreview">{withMedia(e.video) && <><video src={withMedia(e.video)!.url} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
          <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/></video>
          <span className="t1bScenePlay"><Play size={17} fill="currentColor" aria-hidden="true"/></span></>}</span>
        <span className="t1bSceneCaption"><strong>{e.slot}</strong><span>{e.execution.success ? "Success" : "Failure"} · subtask {scoreText(e.execution.subtask)}</span></span>
      </button>)}
    </div>
    {episode && model && task ? <div className={`t1bEpisode${video ? "" : " t1bEpisodeFactsOnly"}`} data-episode-id={episode.id}>
      {video && <div className="t1bPlayer">
        <div className="t1bPlayerBar"><span>{view === "replay" ? "Recorded failure (replayed, model observing)" : "Saved rollout"}</span>
          {replayVideo && <span className="t1uReplaySwitch" role="group" aria-label="Recovery video part">
            <button type="button" aria-pressed={view === "replay"} onClick={() => setView("replay")}>Failure replay</button>
            <button type="button" aria-pressed={view === "takeover"} onClick={() => setView("takeover")}>Model takeover</button></span>}
          {!replayVideo && <span>Head · Left wrist · Right wrist</span>}</div>
        <video key={`${episode.id}:${video.id}`} src={video.url} controls playsInline preload="metadata"
          aria-label={`${model.label}, ${task.label}, ${SPLIT_LABEL[episode.split]} ${episode.slot}`}>
          <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/>
          Your browser does not support video playback.
        </video>
        <div className="t1bPlayerCaption"><strong>{task.label}</strong><span>{model.label} · {SPLIT_SHORT[episode.split]} {episode.slot}</span></div>
      </div>}
      <div className="t1bEpisodeFacts">
        <p className="eyebrow">Selected execution</p><h4>{task.label}</h4>
        <dl className="t1bFactGrid">
          <div><dt>{episode.split === "REC" ? "Recovery score" : "Subtask score"}</dt><dd>{scoreText(episode.execution.subtask)}<small> / 100</small></dd></div>
          <div><dt>Result</dt><dd className="t1bOutcome">{episode.execution.success ? "Success" : "Failure"}</dd></div>
          <div><dt>Native steps</dt><dd>{episode.execution.steps?.toLocaleString("en-US") ?? "—"}</dd></div>
          <div><dt>Elapsed</dt><dd className="t1bElapsed">{elapsedText(episode.execution.elapsedSeconds)}</dd></div>
          {episode.recovery && <div><dt>Score gain</dt><dd>{scoreText(episode.recovery.scoreGain)}</dd></div>}
          {episode.recovery?.failureType && <div><dt>Injected failure</dt><dd>{episode.recovery.failureType.replaceAll("_", " ")}</dd></div>}
          {episode.execution.endReason && <div><dt>End</dt><dd className="t1uEndReason">{episode.execution.endReason.replaceAll("_", " ").replace(":", " · ")}</dd></div>}
        </dl>
        {episode.notes.includes("continued_to_native_end") && <p className="t1uNote">This episode hit the 4-hour wall budget and was continued to its native end; the continued outcome is scored.</p>}
      </div>
    </div> : <div className="t1bEmptyPlayer" role="img" aria-label="No rollout recorded for this selection"/>}
    {episode && <EpisodeVqa key={episode.id} episode={episode}/>}
  </section>;
}

export function T1UnibenchView({ results = t1UnibenchResults }: { results?: T1UnibenchResults } = {}) {
  const [selection, setSelection] = useState<Selection>(() => firstUnibenchSelection(results, results.models[0]?.id ?? ""));
  const explorer = useRef<HTMLDivElement>(null);
  const model = results.models.find((m) => m.id === selection.modelId) ?? results.models[0];
  const jump = (next: Selection) => {
    setSelection(next);
    explorer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return <div className="t1Benchmark t1Unibench">
    <header className="t1bHeading"><div><p className="eyebrow">VLM agents · Shared harness · 24 tasks</p><h2>Model performance by setting</h2></div>
      <p className="t1uVersion">Result version {results.resultVersion}</p></header>
    <Scoreboard results={results} selectedModelId={selection.modelId}
      onModel={(id) => setSelection(firstUnibenchSelection(results, id, selection.split, selection.taskId))}/>
    <Breakdown results={results}/>
    {model && <TaskMatrix results={results} model={model}
      onPick={(split, taskId) => jump(firstUnibenchSelection(results, model.id, split, taskId))}/>}
    <div ref={explorer} className="t1uExplorerAnchor"><Explorer results={results} selection={selection} setSelection={setSelection}/></div>
    <section className="t1uSection t1uNotes" aria-label="Data notes">
      <h3>Notes on this release</h3>
      <ul>
        <li>Each setting averages tasks equally. ID uses 5 episodes per task; V-OOD, S-OOD, B-OOD and Recovery use up to 3 per task. Hover a score to see its episode count.</li>
        <li>To save budget, earlier runs are reused: a few tasks ran under the pre-v3 instruction wording or on another layout of the same task. Each model is scored on the episodes it actually ran.</li>
        <li>Recovery replays a recorded failure (the model only observes), then hands control to the model; only qualified replays count.</li>
        <li>A dash means not run yet. Overall is reported only when all five settings are available.</li>
      </ul>
    </section>
  </div>;
}
