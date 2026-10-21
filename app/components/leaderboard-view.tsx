"use client";

import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { T1BenchmarkView } from "./t1/t1-benchmark-view";
import { evidenceLabels, facetsFor, initialMetricFilters, matchesMetric, protocolLabels, type MetricFilters } from "../data/metric-facets";
import { tracks, type TrackId } from "../data/metric-plan";
import { scenarioPlan, scenarioTags, tagsForScenario, type ScenarioTag } from "../data/scenario-plan";
import { admittedSettingScores, calculateOverallScore, type OverallScorecard } from "../data/overall-score";
import { metricsFor, readResult, type MetricSelection, type ReportMode, type ReportResult } from "../data/track-results";

type Props = { initialTrack: TrackId; onMetric: (selection: MetricSelection) => void };
type EvalSetting = "id" | "visual" | "semantic" | "behavioral" | "recovery";
type SettingResult = ReportResult & { coverage: string };

const settings: { id: EvalSetting; short: string; label: string }[] = [
  { id: "id", short: "ID", label: "In-distribution" },
  { id: "visual", short: "V-OOD", label: "Visual OOD" },
  { id: "semantic", short: "S-OOD", label: "Semantic OOD" },
  { id: "behavioral", short: "B-OOD", label: "Behavioral OOD" },
  { id: "recovery", short: "Recovery", label: "Failure recovery" },
];

const defaultMode: ReportMode = "plan";

function reportedScenario(trackId: TrackId, mode: ReportMode) {
  return ((trackId === "T1" || trackId === "T2") && mode === "history") || trackId === "T3"
    ? "stack_bowls"
    : null;
}

export function LeaderboardView({ initialTrack, onMetric }: Props) {
  const [trackId, setTrackId] = useState<TrackId>(initialTrack);
  const [mode, setMode] = useState<ReportMode>(defaultMode);
  const [previousT1Protocols, setPreviousT1Protocols] = useState(false);
  const [family, setFamily] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [filters, setFilters] = useState<MetricFilters>(initialMetricFilters);
  const [advanced, setAdvanced] = useState(false);
  const [selectedSceneTags, setSelectedSceneTags] = useState<ScenarioTag[]>([]);
  const [sceneId, setSceneId] = useState(initialTrack === "T3" ? "stack_bowls" : "all");

  const track = tracks.find((item) => item.id === trackId)!;
  const metrics = metricsFor(trackId, mode);
  const entries = metrics.map((metric) => ({ metric, facets: facetsFor(trackId, metric, mode) }));
  const families = [...new Set(track.models.map((model) => model.family))];
  const sceneTagEntries = Object.entries(scenarioTags) as [ScenarioTag, (typeof scenarioTags)[ScenarioTag]][];
  const scenes = scenarioPlan.filter((scene) =>
    selectedSceneTags.every((tag) => tagsForScenario(scene).includes(tag)));
  const selectedScenes = scenes.filter((scene) => sceneId === "all" || scene.id === sceneId);
  const selectedSceneIds = new Set(selectedScenes.map((scene) => scene.id));
  const sourceScene = reportedScenario(trackId, mode);
  const sourceSelected = trackId === "T3" ? sceneId !== "all" && selectedSceneIds.has(sceneId) : sourceScene !== null && selectedSceneIds.has(sourceScene);
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
  function resultFor(modelId: string, metricId: string, setting: EvalSetting): SettingResult {
    const denominator = selectedScenes.length;
    if (setting !== "id" || !sourceSelected) {
      const label = settings.find((item) => item.id === setting)!.label;
      return {
        primary: "—",
        detail: setting === "id"
          ? "No validated result for the selected scene scope."
          : `No ${label} result is connected to this metric yet.`,
        status: "Pending",
        available: false,
        coverage: `0/${denominator}`,
      };
    }
    const result = readResult({ trackId, mode, modelId, metricId, ...(trackId === "T3" ? {taskId: sceneId} : {}) });
    return { ...result, coverage: `${result.available ? 1 : 0}/${denominator}` };
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
  const selectMetric = (metricId: string, modelId = models[0]?.id ?? track.models[0].id, setting: EvalSetting = "id") =>
    onMetric({ trackId, mode, metricId, modelId, setting, ...(trackId === "T3" ? {taskId: sceneId} : {}) });
  function toggleSceneTag(tag: ScenarioTag) {
    setSelectedSceneTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]);
    setSceneId("all");
  }

  return <div className="content trackLeaderboard">
    <div className="pageHeading">
      <h1>Leaderboards</h1>
      <p>{trackId === "T1" && !previousT1Protocols ? "Scene understanding and robot execution through a shared harness." : "Methods are rows. Every metric is resolved across ID, three OOD regimes, and failure recovery."}</p>
    </div>
    <nav className="trackTabs" aria-label="Four benchmark tracks">
      {tracks.map((item) => <button key={item.id} type="button"
        aria-current={item.id === trackId ? "page" : undefined}
        className={item.id === trackId ? "selected" : ""}
        onClick={() => {
          const nextMode = defaultMode;
          setTrackId(item.id);
          setPreviousT1Protocols(false);
          setSceneId(item.id === "T3" ? "stack_bowls" : "all");
          setMode(nextMode);
          reset();
        }}>
        <span>{item.id}</span><strong>{item.title}</strong>
      </button>)}
    </nav>
    {trackId === "T1" && !previousT1Protocols ? <section className="trackWorkspace" aria-label="T1 current results">
      <div className="t1CurrentBar"><span>{track.title}</span>
        <button type="button" className="t1ProtocolLink" onClick={() => setPreviousT1Protocols(true)}>Previous protocols</button>
      </div>
      <T1BenchmarkView/>
    </section> : <section className="trackWorkspace" aria-label={`${track.id} ${track.title}`}>
      <div className="trackSectionTitle">
        <h2>{track.title}</h2>
        {trackId === "T1" && <button type="button" className="t1ProtocolLink" onClick={() => setPreviousT1Protocols(false)}>Current results</button>}
        {(trackId === "T1" || trackId === "T2") && <div className="reportSwitch" aria-label="Result protocol">
          {(["plan", "history"] as const).map((value) => <button key={value} type="button"
            aria-pressed={mode === value} onClick={() => { setMode(value); reset(); }}>
            {value === "plan" ? "Current plan" : "Historical runs"}
          </button>)}
        </div>}
      </div>
      <div className="leaderboardSceneFilters">
        <div className="leaderboardTagFilter"><span>Capability tags</span><div>
          {sceneTagEntries.map(([tag, definition]) => <button type="button" key={tag}
            aria-pressed={selectedSceneTags.includes(tag)} onClick={() => toggleSceneTag(tag)}>
            <b>{tag}</b>{definition.label}
          </button>)}
        </div></div>
        <label>Scenario<select aria-label="Leaderboard scenario" value={sceneId}
          onChange={(event) => setSceneId(event.target.value)}>
          <option value="all">All scenarios ({scenes.length})</option>
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
                <small>5 × 20%</small>
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
                  title={`${result.detail} Coverage ${result.coverage} selected scenes.`}>
                  <strong>{result.primary}</strong><small>{result.coverage}</small>
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
  </div>;
}
