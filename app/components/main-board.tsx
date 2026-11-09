"use client";

import { ArrowDownRight, ChevronDown, Info } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { BOARD_SCENES, BOARD_TAGS, buildMainBoard, columnRanks, type BoardRow, type BoardTrack } from "../data/main-board";
import type { TrackId } from "../data/metric-plan";
import type { ScenarioTag } from "../data/scenario-plan";
import { RevealWords } from "./fx";
import { CapabilityIcon, capabilityIconSrc, TrackIcon } from "./podium";

const RADAR_COLORS = ["#4a56c0", "#e07d73", "#a94b9c"] as const;
const MAX_COMPARE = 3;

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
    [track.id, rankedRows(track).filter((row) => row.ranked && row.overall !== null).slice(0, 2).map((row) => row.id)])));
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
        <p>Each column averages a track&apos;s per-scene score over the simulation scenes that carry that capability tag (24 shared scenes, 25 cases each across ID, three OOD settings and failure recovery). Ranks and highlights compare models <strong>within a track only</strong>.</p>
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
              <th scope="col" className="boardOverallHead" title="Mean over all 24 scenes (scene-macro)">Overall<small>24 scenes</small></th>
              {BOARD_TAGS.map((tag) => <th scope="col" key={tag.id} title={`${tag.label}: ${tag.rule}`}><span className="tagCode"><CapabilityIcon tag={tag.id} size={28}/></span><small>{tag.label}</small></th>)}
              <th scope="col" className="boardCasesHead">Cases</th>
            </tr>
          </thead>
          {board.map((track) => <TrackBand key={track.id} track={track} compare={compare[track.id] ?? []}
            expanded={expanded} onExpand={(id) => setExpanded(expanded === id ? null : id)}
            onCompare={(id) => toggleCompare(track.id, id)} onBreakdown={() => onBreakdown(track.id)}/>)}
        </table>
      </div>

      <aside className="radarPanel" aria-label="Capability radar">
        <div className="radarHead">
          <strong>Capability profile</strong>
          <div className="radarTracks" role="group" aria-label="Radar track">
            {board.filter((track) => track.rows.some((row) => row.ranked)).map((track) =>
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
    {ranked ? <>
      {rows.map((row) => {
        const rank = overallRanks.get(row.id);
        const open = expanded === row.id;
        const inRadar = compare.includes(row.id);
        return <Fragment key={row.id}>
          <tr className={`boardRow ${row.ranked ? "" : "unranked"} ${open ? "open" : ""}`}>
            <th scope="row">
              <div className="boardModel">
                <span className={`rankBadge rank-${rank ?? "none"}`} aria-label={rank ? `Rank ${rank}` : "Not ranked"}>{rank ?? "–"}</span>
                <div>
                  <strong>{row.label}</strong>
                  <span><i className="typePill">{row.type}</i>{row.pendingReason ?? row.detail}</span>
                </div>
                <label className={`compareToggle ${inRadar ? "on" : ""}`} title={row.ranked ? "Show on radar" : "Not enough settings for the radar"}>
                  <input type="checkbox" checked={inRadar} disabled={!row.ranked} onChange={() => onCompare(row.id)} aria-label={`Compare ${row.label} on the radar`}/>
                  <span aria-hidden="true"/>
                </label>
                <button type="button" className="expandRow" aria-expanded={open} aria-label={`Per-scene scores for ${row.label}`} onClick={() => onExpand(row.id)} disabled={!row.ranked}>
                  <ChevronDown size={17}/>
                </button>
              </div>
            </th>
            <ScoreCell value={row.overall} rank={rank} overall/>
            {BOARD_TAGS.map((tag) => <ScoreCell key={tag.id} value={row.tags[tag.id]} rank={tagRanks[tag.id].get(row.id)}/>)}
            <td className="casesCell">{row.cases ? row.cases.toLocaleString() : "—"}</td>
          </tr>
          {open && <tr className="sceneRow"><td colSpan={colSpan}><SceneStrip track={track} row={row}/></td></tr>}
        </Fragment>;
      })}
      <OursRow colSpan={colSpan}/>
    </> : <tr className="plannedRow"><td colSpan={colSpan}>
      <div className="plannedInner">
        <Info size={16}/><span>No formal hardware score yet. Planned baselines:</span>
        <ul>{track.rows.map((row) => <li key={row.id} title={row.detail}><b>{row.label}</b><small>{row.type} · {row.detail}</small></li>)}</ul>
      </div>
    </td></tr>}
  </tbody>;
}

function ScoreCell({ value, rank, overall = false }: { value: number | null; rank?: number; overall?: boolean }) {
  // rounded: the browser normalises long percentages, which would not match the server HTML
  const width = value === null ? 0 : Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
  return <td className={`scoreCell ${overall ? "overallCell" : ""} ${rank === 1 ? "best" : rank === 2 ? "second" : ""}`}>
    <span className="scoreValue">{fmt(value)}</span>
    <span className="scoreBar" aria-hidden="true"><i style={{ width: `${width}%` }}/></span>
  </td>;
}

function OursRow({ colSpan }: { colSpan: number }) {
  return <tr className="oursRow"><th scope="row"><div className="boardModel">
    <span className="rankBadge rank-ours" aria-hidden="true">★</span>
    <div><strong>Ours · unified system</strong><span><i className="typePill">RoboExam</i>Harness + VLM + ACWM + policy · in development</span></div>
  </div></th><td colSpan={colSpan - 1} className="oursPending">Not yet evaluated — results appear here once the shared protocol run is admitted.</td></tr>;
}

function SceneStrip({ track, row }: { track: BoardTrack; row: BoardRow }) {
  const values = BOARD_SCENES.map((scene) => row.scenes[scene.id]?.value).filter((value): value is number => typeof value === "number");
  const max = Math.max(1, ...values);
  return <div className="sceneStrip">
    <p><strong>{row.label}</strong> · per-scene {track.metric.toLowerCase()}{track.secondaryLabel ? ` (small: ${track.secondaryLabel})` : ""}</p>
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
