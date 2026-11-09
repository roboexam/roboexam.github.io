"use client";

import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { T1UnibenchView } from "./t1/t1-unibench-view";
import { evidenceLabels, facetsFor, initialMetricFilters, matchesMetric, protocolLabels, type MetricFilters } from "../data/metric-facets";
import { tracks, type TrackId } from "../data/metric-plan";
import { scenarioPlan, scenarioTags, tagsForScenario, type ScenarioTag } from "../data/scenario-plan";
import { admittedSettingScores, calculateOverallScore, type OverallScorecard } from "../data/overall-score";
import { metricsFor, readResult, type MetricSelection, type ReportMode, type ReportResult } from "../data/track-results";
import { policyTaskIds } from "../data/policy-baselines";
import { BaselineRunPlan } from "./baseline-run-plan";
import { STATIC_SITE } from "../static-site";
import { MainBoard } from "./main-board";
import { CapabilityIcon, TrackIcon } from "./podium";
import { SnowflakeBoard } from "./snowflake-board";
import { TrackSubtables } from "./track-subtables";

type Props = { initialTrack: TrackId; onMetric: (selection: MetricSelection) => void };
type EvalSetting = "id" | "visual" | "semantic" | "behavioral" | "recovery";

const settings: { id: EvalSetting; short: string; label: string }[] = [
  { id: "id", short: "ID", label: "In-distribution" },
  { id: "visual", short: "V-OOD", label: "Visual OOD" },
  { id: "semantic", short: "S-OOD", label: "Semantic OOD" },
  { id: "behavioral", short: "B-OOD", label: "Behavioral OOD" },
  { id: "recovery", short: "Recovery", label: "Failure recovery" },
];

const defaultMode: ReportMode = "plan";
const CurrentAcwmResults = lazy(() => import('./acwm600-results').then(module => ({ default: module.Acwm600Results })));

function reportedScenario(trackId: TrackId, mode: ReportMode) {
  return (trackId === "T2" && mode === "history") || trackId === "T3"
    ? "stack_bowls"
    : null;
}

export function LeaderboardView({ initialTrack, onMetric }: Props) {
  const [trackId, setTrackId] = useState<TrackId>(initialTrack);
  const [mode, setMode] = useState<ReportMode>(defaultMode);
  const [latestT2, setLatestT2] = useState(true);
  const [family, setFamily] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [filters, setFilters] = useState<MetricFilters>(initialMetricFilters);
  const [advanced, setAdvanced] = useState(false);
  const [selectedSceneTags, setSelectedSceneTags] = useState<ScenarioTag[]>([]);
  const [sceneId, setSceneId] = useState("all");

  const track = tracks.find((item) => item.id === trackId)!;
  const scoreGuide = track.scoreGuide;
  const metrics = metricsFor(trackId, mode);
  const entries = metrics.map((metric) => ({ metric, facets: facetsFor(trackId, metric, mode) }));
  const families = [...new Set(track.models.map((model) => model.family))];
  const sceneTagEntries = Object.entries(scenarioTags) as [ScenarioTag, (typeof scenarioTags)[ScenarioTag]][];
  const availableScenes = trackId === "T3"
    ? scenarioPlan.filter((scene) => policyTaskIds.includes(scene.id))
    : scenarioPlan;
  const scenes = availableScenes.filter((scene) =>
    selectedSceneTags.every((tag) => tagsForScenario(scene).includes(tag)));
  const selectedScenes = scenes.filter((scene) => sceneId === "all" || scene.id === sceneId);
  const selectedSceneIds = new Set(selectedScenes.map((scene) => scene.id));
  const sourceScene = reportedScenario(trackId, mode);
  const sourceSelected = trackId === "T3" ? sceneId === "all" || selectedSceneIds.has(sceneId) : sourceScene !== null && selectedSceneIds.has(sourceScene);
  const dimensions = [...new Set(entries.map((entry) => entry.facets.dimension))];
  const groups = [...new Set(entries
    .filter((entry) => filters.dimension === "all" || entry.facets.dimension === filters.dimension)
    .map((entry) => entry.facets.group))];
  const evidence = [...new Set(entries.flatMap((entry) => entry.facets.evidence))];
  const protocols = [...new Set(entries.map((entry) => entry.facets.protocol))];
  const models = track.models.filter((model) => family === "all" || family === model.family);
  const overallScorecards = Object.fromEntries(
    models.map((model) => [
      model.id,
      calculateOverallScore({
        trackId,
        reportMode: mode,
        modelId: model.id,
        sceneIds: selectedScenes.map((scene) => scene.id),
        records: admittedSettingScores,
      }),
    ]),
  ) as Record<string, OverallScorecard>;
  function resultFor(modelId: string, metricId: string, setting: EvalSetting): ReportResult {
    if (!sourceSelected) {
      return {
        primary: "—",
        detail: "No validated result for the selected scene scope.",
        status: "Pending",
        available: false,
      };
    }
    return readResult({ trackId, mode, modelId, metricId, setting, ...(trackId === "T3" ? {taskId: sceneId} : {}) });
  }

  const visible = entries.filter(({ metric, facets }) => {
    if (!matchesMetric(metric, facets, filters)) return false;
    const reported = models.some((model) =>
      settings.some((setting) => resultFor(model.id, metric.id, setting.id).available));
    return availability === "all" || (availability === "reported" ? reported : !reported);
  });
  const advancedCount = [filters.group, filters.evidence, filters.protocol, family, availability]
    .filter((value) => value !== "all").length;

  function updateFilter<K extends keyof MetricFilters>(key: K, value: MetricFilters[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "dimension" ? { group: "all" } : {}),
    }));
  }
  function reset() {
    setFilters({ ...initialMetricFilters });
    setFamily("all");
    setAvailability("all");
  }
  const selectMetric = (metricId: string, modelId = models[0]?.id ?? track.models[0]?.id ?? "", setting: EvalSetting = "id") =>
    onMetric({ trackId, mode, metricId, modelId, setting, ...(trackId === "T3" ? {taskId: sceneId} : {}) });
  function selectTrack(next: TrackId) {
    setTrackId(next);
    setSceneId("all");
    setMode(defaultMode);
    setLatestT2(true);
    reset();
  }
  function showBreakdown(next: TrackId) {
    selectTrack(next);
    requestAnimationFrame(() => document.getElementById("track-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function toggleSceneTag(tag: ScenarioTag) {
    setSelectedSceneTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]);
    setSceneId("all");
  }

  return <div className="content trackLeaderboard">
    <div className="pageHeading boardPageHeading">
      <p className="eyebrow">RoboExam leaderboard</p>
      <h1>Leaderboards</h1>
      <p>Validated results only; unavailable settings stay blank and are never counted as zero. / 仅显示已验证结果，未完成设定保持为空，不按 0 计。</p>
    </div>
    <SnowflakeBoard onBreakdown={showBreakdown}/>
    <MainBoard onBreakdown={showBreakdown}/>
    <div className="breakdownHeading" id="track-breakdown">
      <p className="eyebrow">Sub-tables · per track</p>
      <h2>Track breakdown</h2>
    </div>
    <nav className="trackTabs" aria-label="Four benchmark tracks">
      {tracks.map((item) => <button key={item.id} type="button"
        aria-current={item.id === trackId ? "page" : undefined}
        className={item.id === trackId ? "selected" : ""}
        onClick={() => selectTrack(item.id)}>
        <span><TrackIcon track={item.id} size={24}/>{item.id}</span><strong>{item.title}</strong>
      </button>)}
    </nav>
    <TrackSubtables trackId={trackId}/>
    <div className="breakdownHeading evidenceHeading">
      <p className="eyebrow">{trackId} · {track.title}</p>
      <h2>Full results &amp; evidence</h2>
    </div>
    {!(trackId === "T2" && latestT2) && <section className="trackScoreGuide" aria-label={`${track.id} score guide`}>
      <strong>Score guide · 分数说明</strong>
      <p lang="en">{scoreGuide.en}</p><p lang="zh-CN">{scoreGuide.zh}</p>
    </section>}
    {!STATIC_SITE && trackId !== "T2" && <BaselineRunPlan key={trackId} initialTrack={trackId === "T1" ? "ALL" : trackId}/>}
    {trackId === "T2" && <div className="trackSectionTitle">
      <h2>{track.title}</h2>
      <div className="reportSwitch" aria-label="Result protocol">
        <button type="button" aria-pressed={latestT2} onClick={() => { setLatestT2(true); reset(); }}>Current results</button>
        {(STATIC_SITE ? ["history"] as const : ["plan", "history"] as const).map(value => <button key={value} type="button"
          aria-pressed={!latestT2 && mode === value} onClick={() => { setLatestT2(false); setMode(value); reset(); }}>
          {value === "plan" ? "Current plan" : "Historical runs"}
        </button>)}
      </div>
    </div>}
    {trackId === "T1" ? <section className="trackWorkspace" aria-label="T1 current results">
      <T1UnibenchView/>
    </section> : trackId === "T2" && latestT2 ? <section className="trackWorkspace" aria-label="T2 current results">
      <Suspense fallback={<p role="status">Loading results…</p>}><CurrentAcwmResults/></Suspense>
    </section> : STATIC_SITE && trackId === "T4" ? <section className="trackWorkspace" aria-label="T4 results">
      <p className="staticEmpty">No formal hardware results are published yet.</p>
    </section> : <section className="trackWorkspace" aria-label={`${track.id} ${track.title}`}>
      {trackId !== "T2" && <div className="trackSectionTitle">
        <h2>{track.title}</h2>
      </div>}
      <div className="leaderboardSceneFilters">
        <div className="leaderboardTagFilter"><span>Capability tags</span><div>
          {sceneTagEntries.map(([tag, definition]) => <button type="button" key={tag}
            aria-pressed={selectedSceneTags.includes(tag)} onClick={() => toggleSceneTag(tag)}>
            <CapabilityIcon tag={tag} size={20}/>{definition.label}
          </button>)}
        </div></div>
        <label>Scenario<select aria-label="Leaderboard scenario" value={sceneId}
          onChange={(event) => setSceneId(event.target.value)}>
          <option value="all">{trackId === "T3" ? "all_scenario (24)" : "All scenarios"}</option>
          {scenes.map((scene) => <option value={scene.id} key={scene.id}>{scene.name}</option>)}
        </select></label>
      </div>

      <div className="trackFilters">
        <label>Dimension<select aria-label="Dimension" value={filters.dimension}
          onChange={(event) => updateFilter("dimension", event.target.value)}>
          <option value="all">All dimensions</option>{dimensions.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label className="searchField">Search<span className="metricSearch"><Search size={18}/>
          <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="Metric name or keyword" aria-label="Find a metric"/>
        </span></label>
        <button className="moreFilters" type="button" aria-expanded={advanced}
          aria-controls="advanced-metric-filters" onClick={() => setAdvanced(!advanced)}>
          <SlidersHorizontal size={18}/>More filters{advancedCount > 0 && ` (${advancedCount})`}
        </button>
      </div>
      {advanced && <div className="advancedFilters" id="advanced-metric-filters">
        <label>Subdimension<select aria-label="Subdimension" value={filters.group}
          onChange={(event) => updateFilter("group", event.target.value)}>
          <option value="all">All subdimensions</option>{groups.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>Required evidence<select aria-label="Required evidence" value={filters.evidence}
          onChange={(event) => updateFilter("evidence", event.target.value)}>
          <option value="all">Any evidence type</option>
          {evidence.map((value) => <option key={value} value={value}>{evidenceLabels[value]}</option>)}
        </select></label>
        <label>Protocol status<select aria-label="Protocol status" value={filters.protocol}
          onChange={(event) => updateFilter("protocol", event.target.value)}>
          <option value="all">All protocol states</option>
          {protocols.map((value) => <option key={value} value={value}>{protocolLabels[value]}</option>)}
        </select></label>
        <label>Model family<select aria-label="Model family" value={family}
          onChange={(event) => setFamily(event.target.value)}>
          <option value="all">All families</option>{families.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>Results<select aria-label="Results" value={availability}
          onChange={(event) => setAvailability(event.target.value)}>
          <option value="all">All entries</option>
          <option value="reported">Reported in selected scenes</option>
          <option value="missing">No result in selected scenes</option>
        </select></label>
      </div>}

      <div className="tableHint">
        <span aria-live="polite">{models.length} methods · {visible.length} / {metrics.length} metrics</span>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="trackMetricTableWrap" tabIndex={0} role="region"
        aria-label={`${track.id} method leaderboard, horizontally scrollable`}>
        <table className="trackMetricTable methodLeaderboard">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Method</th>
              <th className="overallScoreHead" scope="col" rowSpan={2}>
                <span>Overall</span>
                <small>{admittedSettingScores.length ? "5 × 20%" : "5 settings pending"}</small>
              </th>
              {visible.map(({ metric, facets }) => {
                const marker = facets.protocol === "alternative" || facets.protocol === "pending"
                  ? protocolLabels[facets.protocol]
                  : null;
                return <th className="metricGroupHead" key={metric.id} scope="colgroup" colSpan={settings.length}>
                  <button type="button" onClick={() => selectMetric(metric.id)} aria-label={`Define ${metric.label}`}>
                    <strong>{metric.label} <i>{metric.direction}</i></strong>
                    {marker && <span>{marker}</span>}<ArrowUpRight size={15}/>
                  </button>
                </th>;
              })}
            </tr>
            <tr>{visible.flatMap(({ metric }) => settings.map((setting) =>
              <th className={`settingHead setting-${setting.id}`} key={`${metric.id}:${setting.id}`}
                scope="col" title={setting.label}>{setting.short}</th>))}</tr>
          </thead>
          <tbody>{models.map((model) => {
            const scorecard = overallScorecards[model.id];
            return <tr key={model.id}>
            <th scope="row"><strong>{model.id}</strong><span>{model.family} · {model.status}</span></th>
            <td className="overallScoreCell" title="ID, V-OOD, S-OOD, B-OOD, and Recovery must all be complete.">
              <strong>{scorecard.overall === null ? "—" : scorecard.overall.toFixed(2)}</strong>
              <span aria-label={`${Object.values(scorecard.settingScores).filter((value) => value !== null).length} of 5 settings available`}>
                {settings.map((setting) => <i
                  className={scorecard.settingScores[setting.id] === null ? "" : "is-available"}
                  key={setting.id}
                />)}
              </span>
            </td>
            {visible.flatMap(({ metric }) => settings.map((setting) => {
              const result = resultFor(model.id, metric.id, setting.id);
              return <td data-setting={setting.id} key={`${metric.id}:${setting.id}`}>
                <button type="button" className={`trackMetricCell ${result.available ? "" : "pending"}`}
                  onClick={() => selectMetric(metric.id, model.id, setting.id)}
                  aria-label={`${model.id}, ${metric.label}, ${setting.label}: ${result.available ? result.primary : result.status}`}
                  title={`${result.detail}${result.version ? ` Version ${result.version}.` : ""}${result.protocol ? ` Protocol ${result.protocol}.` : ""}`}>
                  <strong>{result.primary}</strong>{result.available && result.sampleCount != null &&
                    <small>N={result.sampleCount}{result.cohort ? ` · ${result.cohort}` : ""}</small>}
                </button>
              </td>;
            }))}
          </tr>;
          })}</tbody>
        </table>
        {visible.length === 0 && <div className="emptyMetrics"><p>No metrics match these filters.</p>
          <button type="button" onClick={() => reset()}>Clear filters</button>
        </div>}
      </div>
    </section>}
    {!STATIC_SITE && trackId === "T2" && <details><summary>Training and evaluation registry · historical snapshot</summary><BaselineRunPlan initialTrack="T2"/></details>}
  </div>;
}
