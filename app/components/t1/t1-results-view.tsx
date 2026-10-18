"use client";

import { useId, useRef, useState } from "react";
import { t1AgentResults } from "../../data/t1-agent-results";
import { findEpisode } from "./result-format";
import { T1EpisodeViewer } from "./t1-episode-viewer";
import { T1ScoreTable } from "./t1-score-table";

export function T1ResultsView() {
  const [modelId, setModelId] = useState("gpt6-astra");
  const [layoutId, setLayoutId] = useState(136);
  const viewerId = useId();
  const viewer = useRef<HTMLElement>(null);
  const model = t1AgentResults.models.find((entry) => entry.id === modelId);
  const episode = findEpisode(t1AgentResults.episodes, modelId, layoutId);
  const answered = t1AgentResults.models.reduce((sum, entry) => sum + entry.answered, 0);
  const expected = t1AgentResults.models.reduce((sum, entry) => sum + entry.expected, 0);

  function selectModel(nextModelId: string) {
    setModelId(nextModelId);
    viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <div className="t1Results">
    <div className="t1ResultsHeading">
      <div><p className="eyebrow">VLM agents · Shared harness</p><h2>{t1AgentResults.task.label}</h2></div>
      <div className="t1Scope"><span>{t1AgentResults.task.layoutIds.length} layouts</span><span>{t1AgentResults.models.length} models</span><span>{answered}/{expected} answers</span></div>
    </div>
    <T1ScoreTable models={t1AgentResults.models} selectedModelId={modelId} viewerId={viewerId} onSelectModel={selectModel}/>
    <section className="t1ViewerSection" ref={viewer} id={viewerId} aria-labelledby={viewerId + "-title"}>
      <div className="t1ViewerHeading">
        <div><p className="eyebrow">Saved execution</p><h3 id={viewerId + "-title"}>Watch the task unfold</h3></div>
        <div className="t1ViewerControls">
          <label>Model<select aria-label="Execution model" value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {t1AgentResults.models.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select></label>
          <label>Layout<select aria-label="Execution layout" value={layoutId} onChange={(event) => setLayoutId(Number(event.target.value))}>
            {t1AgentResults.task.layoutIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select></label>
        </div>
      </div>
      {episode && model ? <T1EpisodeViewer key={episode.id} episode={episode} model={model}/> : <p className="t1Empty" role="status">No saved episode for this selection.</p>}
    </section>
    <details className="t1Details">
      <summary>Metric details &amp; provenance</summary>
      <div className="t1DetailsBody">
        <div className="t1MetricDefinitions">
          <div><h4>Initial VQA</h4><p>Scores are out of 100. Layouts are weighted equally per question, then capability groups and A/B/C are averaged. Initial VQA = (A + B + C) / 3.</p></div>
          <div><h4>A1 · Object facts</h4><p>Mean of bowl count and interior-color scores. A gives equal weight to A1 and A2.</p></div>
          <div><h4>A2 · 3D localization</h4><p>Object centers in meters in the environment_origin frame, with a 2 cm tolerance. Score = correct required objects / (required objects + incorrect extra outputs).</p></div>
          <div><h4>B1 · Task goal</h4><p>The required final relationship between the moved bowl and the other bowls, using the saved semantic scoring policy.</p></div>
          <div><h4>C1 · Complete plan</h4><p>AS-F1 × (0.5 + 0.5 × POA_effective), combining matched action units and their required ordering. Extra action parameters absent from the reference can prevent an action-unit match.</p></div>
          <div><h4>C2 / C3 · Process VQA</h4><p>Completed-subtask and next-action questions use saved execution checkpoints. Their scores are not yet included.</p></div>
        </div>
        <ul>{t1AgentResults.scorer.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <dl className="t1Provenance">
          <div><dt>Result version</dt><dd>{t1AgentResults.resultVersion}</dd></div>
          <div><dt>Scoring policy</dt><dd>{t1AgentResults.scorer.policy}</dd></div>
          <div><dt>Scorer commit</dt><dd><code>{t1AgentResults.scorer.commit}</code></dd></div>
          <div><dt>Score report SHA-256</dt><dd><code>{t1AgentResults.scorer.reportSha256}</code></dd></div>
          {episode && <>
            <div><dt>Selected episode</dt><dd>{episode.id}</dd></div>
            <div><dt>Initial answer source</dt><dd>{episode.provenance.sameEpisode ? "Same episode" : "Earlier sealed episode"}</dd></div>
            <div><dt>Initial source seal</dt><dd><code>{episode.provenance.initialSealSha256}</code></dd></div>
            <div><dt>Execution source seal</dt><dd><code>{episode.provenance.executionSealSha256}</code></dd></div>
            <div><dt>Original video SHA-256</dt><dd><code>{episode.video.sha256}</code></dd></div>
          </>}
        </dl>
      </div>
    </details>
  </div>;
}
