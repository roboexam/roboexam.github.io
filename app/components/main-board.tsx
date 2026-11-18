"use client";

import { ArrowDownRight, ChevronDown, Info } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { BOARD_SCENES, BOARD_TAGS, buildMainBoard, columnRanks, type BoardRow, type BoardTrack } from "../data/main-board";
import { paperResults } from "../data/paper-results";
import type { TrackId } from "../data/metric-plan";
import type { ScenarioTag } from "../data/scenario-plan";
import { RevealWords } from "./fx";
import { CapabilityIcon, capabilityIconSrc, TrackIcon } from "./podium";

const RADAR_COLORS = ["#4a56c0", "#e07d73", "#a94b9c"] as const;
const MAX_COMPARE = 3;
const hasTags = (track: BoardTrack) => track.rows.some((row) => BOARD_TAGS.some((tag) => row.tags[tag.id] !== null));

const fmt = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

function rankedRows(track: BoardTrack) {
  return [...track.rows].sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return (b.overall ?? -Infinity) - (a.overall ?? -Infinity);
  });
}

export function MainBoard({ onBreakdown }: { onBreakdown: (track: TrackId) => void }) {
  const board = useMemo(() => buildMainBoard(), []);
  const [radarTrack, setRadarTrack] = useState<TrackId>("T1");
  const [compare, setCompare] = useState<Record<string, string[]>>(() => Object.fromEntries(board.map((track) =>
    [track.id, hasTags(track) ? rankedRows(track).filter((row) => row.ranked && row.overall !== null).slice(0, 2).map((row) => row.id) : []])));
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggleCompare(track: TrackId, id: string) {
    setRadarTrack(track);
    setCompare((current) => {
      const list = current[track] ?? [];
      const next = list.includes(id) ? list.filter((value) => value !== id) : [...list, id].slice(-MAX_COMPARE);
      return { ...current, [track]: next };
    });
  }

  const radar = board.find((track) => track.id === radarTrack)!;

  return <section className="mainBoard" aria-labelledby="main-board-title">
    <div className="boardHeader">
      <div>
        <p className="eyebrow">Main table · by capability tag</p>
        <h2 id="main-board-title"><RevealWords text="One exam, four tracks"/></h2>
        <p>Manuscript Table 1. Each tag column aggregates the 600 shared simulation cases (24 tasks × 5 conditions × 5) whose task carries that requirement; T4 reports its three real-robot tasks instead. Large numbers are the headline metric, small numbers the second metric of each cell. Ranks and highlights compare models <strong>within a track only</strong>.</p>
      </div>
      <dl className="tagLegend" aria-label="Capability tags">
        {BOARD_TAGS.map((tag) => <div key={tag.id} title={tag.rule} data-spotlight><dt><CapabilityIcon tag={tag.id} size={30}/></dt><dd>{tag.label}<small>{tag.scenes.length} scenes</small></dd></div>)}
      </dl>
    </div>

    <div className="boardLayout">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="boardTableWrap" role="region" tabIndex={0} aria-label="Main leaderboard by capability tag, horizontally scrollable">
        <table className="boardTable">
          <thead>
            <tr>
              <th scope="col" className="boardModelHead">Model</th>
              <th scope="col" className="boardOverallHead" title="All 600 simulation cases (T4: all 69 real-robot cases)">Overall<small>all cases</small></th>
              {BOARD_TAGS.map((tag) => <th scope="col" key={tag.id} title={`${tag.label}: ${tag.rule}`}><span className="tagCode"><CapabilityIcon tag={tag.id} size={28}/></span><small>{tag.label}</small></th>)}
              <th scope="col" className="boardCasesHead">Cases</th>
            </tr>
          </thead>
          {board.map((track) => <TrackBand key={track.id} track={track} compare={compare[track.id] ?? []}
            expanded={expanded} onExpand={(id) => setExpanded(expanded === id ? null : id)}
            onCompare={(id) => toggleCompare(track.id, id)} onBreakdown={() => onBreakdown(track.id)}/>)}
          <HybridBand colSpan={BOARD_TAGS.length + 3}/>
        </table>
      </div>

      <aside className="radarPanel" aria-label="Capability radar">
        <div className="radarHead">
          <strong>Capability profile</strong>
          <div className="radarTracks" role="group" aria-label="Radar track">
            {board.filter((track) => hasTags(track) && track.rows.some((row) => row.ranked)).map((track) =>
              <button type="button" key={track.id} aria-pressed={radarTrack === track.id} className={`track-${track.id}`}
                onClick={() => setRadarTrack(track.id)}>{track.id}</button>)}
          </div>
        </div>
        <Radar track={radar} ids={compare[radar.id] ?? []}/>
        <p className="radarHint">Tick up to {MAX_COMPARE} models in the table to compare. Axes share one scale per track ({radar.metric}).</p>
      </aside>
    </div>
  </section>;
}

function TrackBand({ track, compare, expanded, onExpand, onCompare, onBreakdown }: {
  track: BoardTrack; compare: string[]; expanded: string | null;
  onExpand: (id: string) => void; onCompare: (id: string) => void; onBreakdown: () => void;
}) {
  const rows = rankedRows(track);
  const ranked = rows.some((row) => row.ranked);
  const overallRanks = columnRanks(rows, (row) => row.overall);
  const tagRanks = Object.fromEntries(BOARD_TAGS.map((tag) => [tag.id, columnRanks(rows, (row) => row.tags[tag.id])])) as Record<ScenarioTag, Map<string, number>>;
  const realRanks = (track.realColumns ?? []).map((_, index) => columnRanks(rows, (row) => row.real?.[index]?.value ?? null));
  const colSpan = BOARD_TAGS.length + 3;
  return <tbody className={`boardBand track-${track.id}`}>
    <tr className="bandRow">
      <th colSpan={colSpan} scope="colgroup">
        <div className="bandInner">
          <span className="bandBadge"><TrackIcon track={track.id} size={26}/>{track.id}</span>
          <div className="bandTitle"><strong>{track.title}</strong><span>{track.subtitle}</span></div>
          <div className="bandMetric" title={track.definition}><b>{track.metric}</b><span>{track.definition}</span></div>
          {ranked && <button type="button" className="bandLink" onClick={onBreakdown}>Breakdown <ArrowDownRight size={15}/></button>}
        </div>
      </th>
    </tr>
    {track.realColumns && ranked && <tr className="realHeadRow">
      <th scope="row"><span>Real-robot task</span></th>
      <td className="realOverallHead">69 cases</td>
      {track.realColumns.map((column) => <th scope="col" key={column.id} title={`${column.task} · ${column.scope}`}><b>{column.task}</b><small>{column.scope} · {column.scope === "Ordinary" ? 20 : 3}</small></th>)}
      <td/>
    </tr>}
    {ranked ? <>
      {rows.map((row) => {
        const rank = overallRanks.get(row.id);
        const open = expanded === row.id;
        const inRadar = compare.includes(row.id);
        const hasScenes = Object.keys(row.scenes).length > 0;
        const radarable = row.ranked && hasTags(track);
        return <Fragment key={row.id}>
          <tr className={`boardRow ${row.ranked ? "" : "unranked"} ${open ? "open" : ""}`}>
            <th scope="row">
              <div className="boardModel">
                <span className={`rankBadge rank-${rank ?? "none"}`} aria-label={rank ? `Rank ${rank}` : "Not ranked"}>{rank ?? "–"}</span>
                <div>
                  <strong>{row.label}</strong>
                  <span><i className="typePill">{row.type}</i>{row.pendingReason ?? row.detail}</span>
                </div>
                <label className={`compareToggle ${inRadar ? "on" : ""}`} title={radarable ? "Show on radar" : "Real-robot tasks are not tag-scored"}>
                  <input type="checkbox" checked={inRadar} disabled={!radarable} onChange={() => onCompare(row.id)} aria-label={`Compare ${row.label} on the radar`}/>
                  <span aria-hidden="true"/>
                </label>
                <button type="button" className="expandRow" aria-expanded={open} aria-label={`Per-task scores for ${row.label}`} title={hasScenes ? "Per-task scores" : "Per-task values are not published for this track"} onClick={() => onExpand(row.id)} disabled={!row.ranked || !hasScenes}>
                  <ChevronDown size={17}/>
                </button>
              </div>
            </th>
            <ScoreCell value={row.overall} secondary={row.overallSecondary} rank={rank} overall/>
            {row.real ? row.real.map((cell, index) => <ScoreCell key={cell.id} value={cell.value} secondary={cell.secondary} rank={realRanks[index].get(row.id)}
              title={`${cell.successes}/${cell.n} successes · Subtask ${fmt(cell.secondary, 2)}`}/>)
              : BOARD_TAGS.map((tag) => <ScoreCell key={tag.id} value={row.tags[tag.id]} secondary={row.tagSecondary[tag.id]} rank={tagRanks[tag.id].get(row.id)}/>)}
            <td className="casesCell">{row.cases ? row.cases.toLocaleString() : "—"}</td>
          </tr>
          {open && <tr className="sceneRow"><td colSpan={colSpan}><SceneStrip track={track} row={row}/></td></tr>}
        </Fragment>;
      })}
    </> : <tr className="plannedRow"><td colSpan={colSpan}>
      <div className="plannedInner">
        <Info size={16}/><span>No formal hardware score yet.{track.rows.length > 0 && " Planned baselines:"}</span>
        {track.rows.length > 0 && <ul>{track.rows.map((row) => <li key={row.id} title={row.detail}><b>{row.label}</b><small>{row.type} · {row.detail}</small></li>)}</ul>}
      </div>
    </td></tr>}
  </tbody>;
}

function ScoreCell({ value, secondary = null, rank, overall = false, title }: { value: number | null; secondary?: number | null; rank?: number; overall?: boolean; title?: string }) {
  // rounded: the browser normalises long percentages, which would not match the server HTML
  const width = value === null ? 0 : Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
  // a shared zero is not a placing: only non-zero values earn the best/second highlight
  const placed = value !== null && value > 0;
  return <td className={`scoreCell ${overall ? "overallCell" : ""} ${placed && rank === 1 ? "best" : placed && rank === 2 ? "second" : ""}`} title={title}>
    <span className="scoreValue">{fmt(value)}</span>
    {secondary !== null && <small className="scoreSecondary">{fmt(secondary)}</small>}
    <span className="scoreBar" aria-hidden="true"><i style={{ width: `${width}%` }}/></span>
  </td>;
}

/** The hybrid agent runs on the same 600 cases but is reported apart from the track rankings (manuscript Sec. 5.4). */
function HybridBand({ colSpan }: { colSpan: number }) {
  return <tbody className="boardBand track-hybrid">
    <tr className="bandRow"><th colSpan={colSpan} scope="colgroup"><div className="bandInner">
      <span className="bandBadge">★</span>
      <div className="bandTitle"><strong>Hybrid agent</strong><span>PyRUA-Lean + DeepSeek-V4.1 Flash, with an optional LingBot-VA forecasting tool</span></div>
      <div className="bandMetric"><b>Task success rate</b><span>Same 600 cases, success checkers and budgets; reported separately from track rankings because its interface differs. Small: Subtask.</span></div>
    </div></th></tr>
    {paperResults.hybrid.map((row) => <tr className="oursRow" key={row.id}>
      <th scope="row"><div className="boardModel">
        <span className="rankBadge rank-ours" aria-hidden="true">★</span>
        <div><strong>{row.label}</strong><span><i className="typePill">Hybrid</i>{row.id === "forecast" ? "Up to 16 ACWM forecasts per episode" : "Direct execution, no forecasts"}</span></div>
      </div></th>
      <ScoreCell value={row.tsr} secondary={row.subtask} overall/>
      <td colSpan={colSpan - 2} className="oursPending">ID {row.settings.ID.toFixed(1)} · V-OOD {row.settings.V.toFixed(1)} · S-OOD {row.settings.S.toFixed(1)} · B-OOD {row.settings.B.toFixed(1)} · Recovery {row.settings.REC.toFixed(1)} (TSR %)</td>
    </tr>)}
  </tbody>;
}

function SceneStrip({ track, row }: { track: BoardTrack; row: BoardRow }) {
  const values = BOARD_SCENES.map((scene) => row.scenes[scene.id]?.value).filter((value): value is number => typeof value === "number");
  const max = Math.max(1, ...values);
  return <div className="sceneStrip">
    <p><strong>{row.label}</strong> · per-task {track.metric.toLowerCase()} pooled over the five conditions (small: Subtask)</p>
    <ol>{BOARD_SCENES.map((scene) => {
      const score = row.scenes[scene.id];
      const intensity = score?.value == null ? 0 : score.value / max;
      return <li key={scene.id} style={{ ["--heat" as string]: intensity.toFixed(3) }} title={`${scene.name} · ${scene.tags.join(" ")} · n=${score?.n ?? 0}`}>
        <span>{scene.name}</span>
        <b>{fmt(score?.value)}</b>
        <small>{scene.tags.join("")}{score?.secondary != null ? ` · ${fmt(score.secondary)}` : ""}</small>
      </li>;
    })}</ol>
  </div>;
}

function niceMax(value: number) {
  for (const step of [10, 25, 50, 75, 100]) if (value <= step) return step;
  return Math.ceil(value / 50) * 50;
}

function Radar({ track, ids }: { track: BoardTrack; ids: string[] }) {
  const rows = ids.map((id) => track.rows.find((row) => row.id === id)).filter((row): row is BoardRow => Boolean(row));
  const all = track.rows.flatMap((row) => BOARD_TAGS.map((tag) => row.tags[tag.id])).filter((value): value is number => typeof value === "number");
  const scale = niceMax(Math.max(1, ...all));
  const size = 300;
  const center = size / 2;
  const radius = 108;
  const angle = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / BOARD_TAGS.length;
  const point = (index: number, value: number) => {
    const r = (Math.max(0, value) / scale) * radius;
    return [center + r * Math.cos(angle(index)), center + r * Math.sin(angle(index))] as const;
  };
  return <figure className="radarFigure">
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${track.id} capability radar for ${rows.map((row) => row.label).join(", ") || "no selected model"}`}>
      {[0.25, 0.5, 0.75, 1].map((ring) => <polygon key={ring} className="radarRing"
        points={BOARD_TAGS.map((_, index) => point(index, ring * scale).join(",")).join(" ")}/>)}
      {BOARD_TAGS.map((tag, index) => {
        const [x, y] = point(index, scale);
        const [lx, ly] = point(index, scale * 1.17);
        return <g key={tag.id}>
          <line className="radarSpoke" x1={center} y1={center} x2={x} y2={y}/>
          <image className="radarLabel" href={capabilityIconSrc(tag.id)} x={lx - 13} y={ly - 13} width={26} height={26}><title>{tag.label}</title></image>
        </g>;
      })}
      <text className="radarScale" x={center + 4} y={center - radius - 4}>{scale}</text>
      {rows.map((row, rowIndex) => {
        const points = BOARD_TAGS.map((tag, index) => point(index, row.tags[tag.id] ?? 0).join(",")).join(" ");
        return <polygon key={row.id} className="radarShape" points={points}
          style={{ stroke: RADAR_COLORS[rowIndex], fill: RADAR_COLORS[rowIndex] }}/>;
      })}
    </svg>
    <figcaption>{rows.length ? rows.map((row, index) => <span key={row.id}><i style={{ background: RADAR_COLORS[index] }}/>{row.label}<b>{fmt(row.overall)}</b></span>)
      : <span className="radarEmpty">Select models in the {track.id} band.</span>}</figcaption>
  </figure>;
}
