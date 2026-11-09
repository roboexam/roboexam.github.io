"use client";

import { useEffect, useState } from "react";
import {
  policySampleDisplay,
  policyTaskFor,
  type PolicyBaselineModel,
  type PolicySetting,
} from "../data/policy-baselines";
import { dataUrl, mediaUrl } from "../static-site";
import { MediaUnavailable } from "./static-media";

type PolicySample = {
  id: string;
  sourceEpisode: string;
  layoutId: number;
  status: string;
  success: boolean;
  score: number | null;
  metricsAvailable: boolean;
  values: Record<string, number | null>;
  units: Record<string, string>;
  videos: { camera: string; url: string; sha256: string; size: number }[];
  reportSha256: string;
  prompt: string | null;
  sourceKind: string;
};

const cameraLabels: Record<string, string> = {
  cam_head: "Head camera",
  cam_left_wrist: "Left wrist",
  cam_right_wrist: "Right wrist",
};

export function PolicyBaselineEvidence({ model, taskId, metricId, formula, setting = "id" }: {
  model: PolicyBaselineModel;
  taskId: string;
  metricId: string;
  formula: string;
  setting?: PolicySetting;
}) {
  const [sampleId, setSampleId] = useState("");
  const [camera, setCamera] = useState("cam_head");
  const [samples, setSamples] = useState<PolicySample[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl(`/api/policy-baseline-results/${encodeURIComponent(model)}/${encodeURIComponent(taskId)}?setting=${encodeURIComponent(setting)}`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Missing policy-baseline cohort");
        return response.json();
      })
      .then((data) => setSamples(data.samples))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [model, taskId, setting]);

  const task = policyTaskFor(model, taskId, setting);
  if (!task) return null;
  if (!samples?.length) {
    return <section className="metricSample"><p>{error
      ? `${model} sample evidence could not be loaded.`
      : `Loading ${model} episode evidence…`}</p></section>;
  }
  // open on a sample whose clip is carried (all of them on the server; the curated few on the static site)
  const playable = (item: PolicySample) => item.videos.some((entry) => mediaUrl(entry.url));
  const sample = samples.find((item) => item.id === sampleId) ?? samples.find(playable) ?? samples[0];
  const video = sample.videos.find((item) => item.camera === camera && mediaUrl(item.url))
    ?? sample.videos.find((item) => mediaUrl(item.url)) ?? sample.videos.find((item) => item.camera === camera) ?? sample.videos[0];
  const videoSrc = mediaUrl(video.url);
  const metric = task.values[metricId];
  const settingLabel = setting === "id" ? "ID" : `${setting.toUpperCase()} OOD`;

  return <>
    <section className="metricSample vlaSample">
      <div className="sampleHeading">
        <div>
          <span>{model} {settingLabel} EPISODE WALKTHROUGH</span>
          <h3>{model} · {taskId}</h3>
          <p>{sample.sourceEpisode} · layout {sample.layoutId} · {sample.success ? "success" : "failure"}</p>
        </div>
        <div className="sampleTools">
          <label className="episodeSelect"><span>Choose {setting === "id" ? "ID" : "OOD"} sample</span>
            <select aria-label={`${model} sample`} value={sample.id} onChange={(event) => setSampleId(event.target.value)}>
              {samples.map((item) => <option key={item.id} value={item.id}>
                {item.sourceEpisode} · layout {item.layoutId} · {item.success ? "success" : "failure"}
              </option>)}
            </select>
          </label>
          <label className="episodeSelect"><span>Camera</span>
            <select aria-label={`${model} camera`} value={video.camera} onChange={(event) => setCamera(event.target.value)}>
              {sample.videos.map((item) => <option key={item.camera} value={item.camera}>{cameraLabels[item.camera]}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="sampleBody vlaSampleBody">
        <div className="sampleVideo">
          {videoSrc ? <video key={video.sha256} controls muted playsInline preload="metadata" src={videoSrc}/> : <MediaUnavailable/>}
          <div><b>{cameraLabels[video.camera]}</b><span>{(video.size / 1024 / 1024).toFixed(1)} MiB · SHA {video.sha256.slice(0, 12)}</span></div>
        </div>
        <div className="sampleCalculation">
          <div className="calculationSteps">
            <article><span>Sample</span><strong>{sample.sourceEpisode}</strong><p>layout {sample.layoutId} · {sample.status}</p></article>
            <article><span>Source</span><strong>{sample.sourceKind}</strong><p>{task.sourceBatch}</p></article>
            {sample.prompt && <article><span>Instruction</span><p>{sample.prompt}</p></article>}
            <article><span>Scoring rule</span><p>{formula}</p></article>
            <article><span>{settingLabel} result</span><strong>{policySampleDisplay(sample.values[metricId], sample.units[metricId])}</strong><p>{metric?.detail ?? "Metric not available for this sample."}</p></article>
            <article><span>Evidence</span><p>Report SHA {sample.reportSha256.slice(0, 12)}</p></article>
          </div>
        </div>
      </div>
    </section>
    <section className="formalEvidence">
      <div className="formalEvidenceHeader">
        <div><span>FORMAL AGGREGATE EVIDENCE</span><h3>{model} · {taskId} · {settingLabel}</h3><p>{task.resultVersion}</p></div>
        <div className={metric?.available ? "formalEvidenceValue" : "formalEvidenceValue unavailable"}>
          <strong>{metric?.primary ?? "N/A"}</strong>
          <span>N = {metric?.n ?? 0}{metric?.coverage == null ? "" : ` · coverage ${(metric.coverage * 100).toFixed(1)}%`}</span>
        </div>
      </div>
      <div className="formalEvidenceFacts">
        <article><span>Cohort</span><strong>{task.episodes} / {task.expectedEpisodes} episodes</strong><p>{task.incompleteEpisodes} incomplete</p></article>
        <article><span>Success</span><strong>{task.successes} / {task.episodes}</strong></article>
        <article><span>Protocol</span><p>{task.protocol}</p></article>
        <article><span>Source</span><strong>prompt {task.promptVersion}</strong><p>{task.sourceBatch}</p></article>
      </div>
    </section>
  </>;
}
