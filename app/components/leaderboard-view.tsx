"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { T1UnibenchView } from "./t1/t1-unibench-view";
import { tracks, type MetricDefinition, type TrackId } from "../data/metric-plan";
import { scenarioPlan } from "../data/scenario-plan";
import { metricsFor, readResult, type MetricSelection, type ReportMode, type ReportResult } from "../data/track-results";
import { policyTaskIds } from "../data/policy-baselines";

type Props = { initialTrack: TrackId; onMetric: (selection: MetricSelection) => void };
type EvalSetting = "id" | "visual" | "semantic" | "behavioral";

const settings: { id: EvalSetting; short: string; label: string }[] = [
  { id: "id", short: "ID", label: "In-distribution" },
  { id: "visual", short: "V-OOD", label: "Visual OOD" },
  { id: "semantic", short: "S-OOD", label: "Semantic OOD" },
  { id: "behavioral", short: "B-OOD", label: "Behavioral OOD" },
];

function defaultModeFor(trackId: TrackId): ReportMode {
  return trackId === "T2" ? "history" : "plan";
}

function preferredMetric(trackId: TrackId, metrics: MetricDefinition[]) {
  const id = trackId === "T2" ? "PSNR" : "TSR";
  return metrics.find((metric) => metric.id === id) ?? metrics[0];
}

function numericResult(result: ReportResult) {
  if (!result.available) return null;
  const value = Number.parseFloat(result.primary.replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function concisePrimary(result: ReportResult) {
  if (!/^-?\d+(?:\.\d+)?$/.test(result.primary)) return result.primary;
  const value = Number(result.primary);
  if (!Number.isFinite(value)) return result.primary;
  if (Math.abs(value) >= 1) return value.toFixed(3).replace(/\.?0+$/, "");
  return value.toPrecision(4).replace(/\.?0+$/, "");
}

export function LeaderboardView({ initialTrack, onMetric }: Props) {
  const [trackId, setTrackId] = useState<TrackId>(initialTrack);
  const [mode, setMode] = useState<ReportMode>(defaultModeFor(initialTrack));
  const [family, setFamily] = useState("all");
  const [sceneId, setSceneId] = useState("all");
  const [metricId, setMetricId] = useState("");

  useEffect(() => {
    function syncTrackFromUrl() {
      const requested = new URLSearchParams(window.location.search).get("track") as TrackId | null;
      if (!requested || !tracks.some((track) => track.id === requested)) return;
      setTrackId(requested);
      setMode(defaultModeFor(requested));
      setFamily("all");
      setSceneId("all");
      setMetricId("");
    }
    syncTrackFromUrl();
    window.addEventListener("popstate", syncTrackFromUrl);
    return () => window.removeEventListener("popstate", syncTrackFromUrl);
  }, []);

  const track = tracks.find((item) => item.id === trackId)!;
  const rawMetrics = metricsFor(trackId, mode);
  const activeSettings = trackId === "T2" ? settings.slice(0, 1) : settings;
  const availableScenes = trackId === "T2"
    ? scenarioPlan.filter((scene) => scene.id === "stack_bowls")
    : trackId === "T3"
      ? scenarioPlan.filter((scene) => policyTaskIds.includes(scene.id))
      : [];
  const models = track.models.filter((model) => family === "all" || model.family === family);
  const families = [...new Set(track.models.map((model) => model.family))];
  const sourceSelected = trackId === "T2"
    ? availableScenes.some((scene) => scene.id === "stack_bowls") && (sceneId === "all" || sceneId === "stack_bowls")
    : trackId === "T3" && (sceneId === "all" || availableScenes.some((scene) => scene.id === sceneId));

  function resultFor(modelId: string, selectedMetricId: string, setting: EvalSetting): ReportResult {
    if (!sourceSelected) {
      return {
        primary: "—",
        detail: "No validated result for the selected task scope.",
        status: "Unavailable",
        available: false,
      };
    }
    return readResult({
      trackId,
      mode,
      modelId,
      metricId: selectedMetricId,
      setting,
      ...(trackId === "T3" ? { taskId: sceneId } : {}),
    });
  }

  const publishedMetrics = rawMetrics.filter((metric) =>
    track.models.some((model) =>
      activeSettings.some((setting) => resultFor(model.id, metric.id, setting.id).available)));
  const selectedMetric = publishedMetrics.find((metric) => metric.id === metricId)
    ?? preferredMetric(trackId, publishedMetrics);
  const rankingSetting = activeSettings[0];
  const rankedModels = [...models].sort((left, right) => {
    if (!selectedMetric || !rankingSetting) return 0;
    const leftValue = numericResult(resultFor(left.id, selectedMetric.id, rankingSetting.id));
    const rightValue = numericResult(resultFor(right.id, selectedMetric.id, rankingSetting.id));
    if (leftValue === null) return rightValue === null ? 0 : 1;
    if (rightValue === null) return -1;
    return selectedMetric.direction === "↓" ? leftValue - rightValue : rightValue - leftValue;
  });

  function switchTrack(next: TrackId) {
    setTrackId(next);
    setMode(defaultModeFor(next));
    setFamily("all");
    setSceneId("all");
    setMetricId("");
    const url = new URL(window.location.href);
    url.searchParams.set("track", next);
    url.hash = "";
    window.history.pushState(null, "", url);
  }

  function selectMetric(modelId?: string, setting: EvalSetting = "id") {
    const resolvedModel = modelId ?? rankedModels[0]?.id;
    if (!selectedMetric || !resolvedModel) return;
    onMetric({
      trackId,
      mode,
      metricId: selectedMetric.id,
      modelId: resolvedModel,
      setting,
      ...(trackId === "T3" ? { taskId: sceneId } : {}),
    });
  }

  return <div className="content trackLeaderboard">
    <div className="pageHeading">
      <p className="eyebrow">EmbodiVSI · RoboExam improvement challenge</p>
      <h1>Challenge Leaderboards</h1>
      <p>{trackId === "T1"
        ? "The workshop's shared challenge connects scene understanding and robot execution through a common evidence harness."
        : "Validated results only; unavailable settings remain blank. / 仅显示已验证结果，未完成设定保持为空。"}</p>
    </div>

    <nav className="trackTabs" aria-label="Four benchmark tracks">
      {tracks.map((item) => <button key={item.id} type="button"
        aria-current={item.id === trackId ? "page" : undefined}
        className={item.id === trackId ? "selected" : ""}
        onClick={() => switchTrack(item.id)}>
        <span>{item.id}</span><strong>{item.title}</strong>
      </button>)}
    </nav>

    <section className="trackScoreGuide" aria-label={`${track.id} score guide`}>
      <strong>Score guide · 分数说明</strong>
      <p lang="en">{track.scoreGuide.en}</p>
      <p lang="zh-CN">{track.scoreGuide.zh}</p>
    </section>

    {trackId === "T1" ? <section className="trackWorkspace" aria-label="T1 current results">
      <T1UnibenchView showEpisodeEvidence={false}/>
    </section> : <section className="trackWorkspace" aria-label={`${track.id} ${track.title}`}>
      <div className="trackSectionTitle">
        <div><h2>{track.title}</h2><p>{track.question}</p></div>
      </div>

      {track.models.length === 0 ? <div className="emptyMetrics publicBoardEmpty">
        <strong>No validated public results are available for this track yet.</strong>
        <p>The protocol remains visible; no rank is assigned. / 当前暂无已验证的公开结果，保留评测协议但不分配排名。</p>
      </div> : selectedMetric ? <>
        <div className="trackFilters publicLeaderboardFilters">
          <label>Task<select aria-label="Leaderboard task" value={sceneId}
            onChange={(event) => setSceneId(event.target.value)}>
            <option value="all">All published tasks ({availableScenes.length})</option>
            {availableScenes.map((scene) => <option value={scene.id} key={scene.id}>{scene.name}</option>)}
          </select></label>
          <label>Metric<select aria-label="Ranking metric" value={selectedMetric.id}
            onChange={(event) => setMetricId(event.target.value)}>
            {publishedMetrics.map((metric) =>
              <option value={metric.id} key={metric.id}>{metric.label} {metric.direction}</option>)}
          </select></label>
          <label>Model family<select aria-label="Model family" value={family}
            onChange={(event) => setFamily(event.target.value)}>
            <option value="all">All families</option>
            {families.map((value) => <option key={value}>{value}</option>)}
          </select></label>
        </div>

        <div className="tableHint">
          <span aria-live="polite">{rankedModels.length} methods · ranked by {selectedMetric.label} ({rankingSetting.short})</span>
          <button type="button" onClick={() => selectMetric()} aria-label={`Define ${selectedMetric.label}`}>
            Metric definition <ArrowUpRight size={15}/>
          </button>
        </div>

        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="trackMetricTableWrap" tabIndex={0} role="region"
          aria-label={`${track.id} ${selectedMetric.label} leaderboard, horizontally scrollable`}>
          <table className="trackMetricTable methodLeaderboard compactLeaderboard">
            <caption className="srOnly">Methods ranked by {selectedMetric.label} for the selected task scope.</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>Method</th>
                <th className="metricGroupHead" scope="colgroup" colSpan={activeSettings.length}>
                  <button type="button" onClick={() => selectMetric()} aria-label={`Define ${selectedMetric.label}`}>
                    <strong>{selectedMetric.label} <i>{selectedMetric.direction}</i></strong>
                    <ArrowUpRight size={15}/>
                  </button>
                </th>
              </tr>
              <tr>{activeSettings.map((setting) =>
                <th className={`settingHead setting-${setting.id}`} key={setting.id}
                  scope="col" title={setting.label}>{setting.short}</th>)}</tr>
            </thead>
            <tbody>{rankedModels.map((model) => <tr key={model.id}>
              <th scope="row"><strong>{model.id}</strong><span>{model.family} · {model.status}</span></th>
              {activeSettings.map((setting) => {
                const result = resultFor(model.id, selectedMetric.id, setting.id);
                return <td data-setting={setting.id} key={`${model.id}:${setting.id}`}>
                  <button type="button" className={`trackMetricCell ${result.available ? "" : "pending"}`}
                    onClick={() => selectMetric(model.id, setting.id)}
                    aria-label={`${model.id}, ${selectedMetric.label}, ${setting.label}: ${result.available ? result.primary : result.status}`}
                    title={`${result.detail}${result.version ? ` Version ${result.version}.` : ""}${result.protocol ? ` Protocol ${result.protocol}.` : ""}`}>
                    <strong>{concisePrimary(result)}</strong>
                    {result.available && result.sampleCount != null &&
                      <small>N={result.sampleCount}{result.cohort ? ` · ${result.cohort}` : ""}</small>}
                  </button>
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </> : <div className="emptyMetrics publicBoardEmpty">
        <strong>No validated result matches this task scope.</strong>
        <p>Select another task to view published metrics.</p>
      </div>}
    </section>}
  </div>;
}
