"use client";

import { useEffect, useState } from "react";
import { xvla24Id, xvlaSampleDisplay, type XvlaSample } from "../data/xvla-24id";

const cameraLabels: Record<string, string> = {
  cam_head: "Head camera",
  cam_left_wrist: "Left wrist",
  cam_right_wrist: "Right wrist",
};

export function Xvla24IdEvidence({
  taskId,
  metricId,
  formula,
}: {
  taskId: string;
  metricId: string;
  formula: string;
}) {
  const [sampleId, setSampleId] = useState("");
  const [camera, setCamera] = useState("cam_head");
  const [samples, setSamples] = useState<XvlaSample[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/xvla-24id-results/${encodeURIComponent(taskId)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Missing XVLA cohort");
        return response.json();
      })
      .then((data) => setSamples(data.samples))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [taskId]);

  const task = xvla24Id[taskId];
  if (!task) return null;
  if (!samples?.length) {
    return <section className="metricSample"><p>{error
      ? "XVLA sample evidence could not be loaded."
      : "Loading XVLA episode evidence…"}</p></section>;
  }
  const sample = samples.find((item) => item.id === sampleId) ?? samples[0];
  const video = sample.videos.find((item) => item.camera === camera) ?? sample.videos[0];
  const metric = task.values[metricId];

  return <>
    <section className="metricSample vlaSample">
      <div className="sampleHeading">
        <div>
          <span>XVLA ID EPISODE WALKTHROUGH</span>
          <h3>XVLA · {taskId}</h3>
          <p>{sample.sourceEpisode} · layout {sample.layoutId} · {sample.metricsAvailable ? (sample.success ? "success" : "failure") : "incomplete"}</p>
        </div>
        <div className="sampleTools">
          <label className="episodeSelect"><span>Choose ID sample</span>
            <select aria-label="XVLA ID sample" value={sample.id} onChange={(event) => setSampleId(event.target.value)}>
              {samples.map((item) => <option key={item.id} value={item.id}>
                {item.sourceEpisode} · layout {item.layoutId} · {item.metricsAvailable ? (item.success ? "success" : "failure") : "incomplete"}
              </option>)}
            </select>
          </label>
          {sample.videos.length > 0 && <label className="episodeSelect"><span>Camera</span>
            <select aria-label="XVLA camera" value={video.camera} onChange={(event) => setCamera(event.target.value)}>
              {sample.videos.map((item) => <option key={item.camera} value={item.camera}>{cameraLabels[item.camera]}</option>)}
            </select>
          </label>}
        </div>
      </div>
      <div className="sampleBody vlaSampleBody">
        {video ? <div className="sampleVideo">
          <video key={video.sha256} controls muted playsInline preload="metadata" src={video.url}/>
          <div><b>{cameraLabels[video.camera]}</b><span>{video.durationSeconds.toFixed(2)} s · {video.frameCount} frames · web-360p-v1 · SHA {video.sha256.slice(0, 12)}</span></div>
        </div> : <div className="sampleUnavailable"><strong>No finalized video</strong><p>This ID did not produce a complete evaluator result or finalized rollout video.</p></div>}
        <div className="sampleCalculation">
          <div className="calculationSteps">
            <article><span>Sample</span><strong>{sample.sourceEpisode}</strong><p>layout {sample.layoutId} · {sample.status}</p></article>
            <article><span>Scoring rule</span><p>{formula}</p></article>
            <article><span>ID result</span><strong>{xvlaSampleDisplay(sample.values[metricId], sample.units[metricId])}</strong><p>{metric?.detail ?? "Metric not available for this ID."}</p></article>
            <article><span>Evidence</span><p>{sample.reportSha256 ? `Report SHA ${sample.reportSha256.slice(0, 12)}` : "No completed metric report"}</p></article>
          </div>
        </div>
      </div>
    </section>
    <section className="formalEvidence">
      <div className="formalEvidenceHeader">
        <div><span>FORMAL AGGREGATE EVIDENCE</span><h3>XVLA · {taskId} · ID</h3><p>{task.resultVersion}</p></div>
        <div className={metric?.available ? "formalEvidenceValue" : "formalEvidenceValue unavailable"}>
          <strong>{metric?.primary ?? "N/A"}</strong>
          <span>N = {metric?.n ?? 0}{metric?.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`}</span>
        </div>
      </div>
      <div className="formalEvidenceFacts">
        <article><span>Cohort</span><strong>{task.episodes} / {task.expectedEpisodes} valid IDs</strong><p>{task.incompleteEpisodes} incomplete</p></article>
        <article><span>Success</span><strong>{task.successes} / {task.episodes}</strong></article>
        <article><span>Protocol</span><p>{task.protocol}</p></article>
      </div>
    </section>
  </>;
}
