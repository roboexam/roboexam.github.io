"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { BOARD_SCENES, BOARD_TAGS, buildMainBoard, columnRanks, type BoardRow, type BoardTrack } from "../data/main-board";
import { paperResults } from "../data/paper-results";
import { tracks, type TrackId } from "../data/metric-plan";
import { CapabilityIcon, Medal, MethodLogo, TrackIcon } from "./podium";

// Manuscript Table 1 as one leaderboard per track. Every value comes from the manuscript bundle
// through data/main-board.ts; ranks compare models within a track only.

type Measure = "primary" | "secondary";
type Column = { id: string; head: ReactNode; title: string; read: (row: BoardRow, measure: Measure) => number | null };

/** What the rank-by switch offers per track: the headline metric and its companion. */
const MEASURES: Record<TrackId, Record<Measure, { label: string; unit: string; lowerIsBetter: boolean; percent: boolean }>> = {
  T1: { primary: { label: "TSR", unit: "%", lowerIsBetter: false, percent: true }, secondary: { label: "Score", unit: "", lowerIsBetter: false, percent: true } },
  T2: { primary: { label: "Pred.", unit: "", lowerIsBetter: false, percent: true }, secondary: { label: "EE error", unit: "mm", lowerIsBetter: true, percent: false } },
  T3: { primary: { label: "TSR", unit: "%", lowerIsBetter: false, percent: true }, secondary: { label: "Score", unit: "", lowerIsBetter: false, percent: true } },
  T4: { primary: { label: "SR", unit: "%", lowerIsBetter: false, percent: true }, secondary: { label: "Subtask", unit: "%", lowerIsBetter: false, percent: true } },
};

const FOOTNOTE: Record<TrackId, Record<Measure, string>> = {
  T1: { primary: "Task success rate on the 600 shared simulation cases.", secondary: "Score = 0.7 × Subtask + 0.3 × VQA." },
  T2: { primary: "Pred. averages video quality, feature consistency and action following.", secondary: "End-effector position error in mm. Lower is better." },
  T3: { primary: "Task success rate on the 600 shared cases in Isaac Sim.", secondary: "Score = Subtask × (0.50 + 0.25 I + 0.25 K)." },
  T4: { primary: "Success rate on dual Piper arms: 20 ordinary and 3 extra cases per task.", secondary: "Subtask completion on the same cases." },
};

const fmt = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";

/** The hybrid agent runs the same 600 cases but uses its own interface, so it is listed faded and unranked (Sec. 5.4). */
function hybridRows(trackId: TrackId): BoardRow[] {
  const empty = Object.fromEntries(BOARD_TAGS.map((tag) => [tag.id, null])) as BoardRow["tags"];
  return paperResults.hybrid.map((row) => ({
    trackId, id: `hybrid:${row.id}`, label: `Hybrid agent ${row.id === "forecast" ? "+ forecasts" : ""}`.trim(),
    type: "Agent", detail: "", ranked: false, pendingReason: null, scenes: {},
    tags: empty, tagSecondary: empty, overall: row.tsr, overallSecondary: null, cases: 600,
  }));
}

function columnsFor(track: BoardTrack): Column[] {
  const overall: Column = { id: "overall", head: <b>Overall</b>, title: "All cases of the track", read: (row, m) => m === "primary" ? row.overall : row.overallSecondary };
  if (track.realColumns) {
    return [overall, ...track.realColumns.map((column, index): Column => ({
      id: column.id, title: `${column.task} · ${column.scope}`,
      head: <><b>{column.task}</b><span>{column.scope}</span></>,
      read: (row, m) => { const cell = row.real?.[index]; return cell ? (m === "primary" ? cell.value : cell.secondary) : null; },
    }))];
  }
  return [overall, ...BOARD_TAGS.map((tag): Column => ({
    id: tag.id, title: `${tag.label}: ${tag.rule}`,
    head: <><CapabilityIcon tag={tag.id} size={26}/><b>{tag.label}</b></>,
    read: (row, m) => m === "primary" ? row.tags[tag.id] : row.tagSecondary[tag.id],
  }))];
}

export function MainBoard({ trackId, onTrack }: { trackId: TrackId; onTrack: (track: TrackId) => void }) {
  const board = useMemo(() => buildMainBoard(), []);
  const [measure, setMeasure] = useState<Measure>("primary");
  const [sortId, setSortId] = useState("overall");
  const [showAgents, setShowAgents] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const track = board.find((item) => item.id === trackId)!;
  const meta = MEASURES[trackId][measure];
  const columns = columnsFor(track);
  const sortColumn = columns.find((column) => column.id === sortId) ?? columns[0];
  const agentsApply = trackId === "T1" || trackId === "T3";
  const rows = [...track.rows, ...(agentsApply && showAgents ? hybridRows(trackId) : [])];
  const read = (row: BoardRow) => sortColumn.read(row, measure);
  const ranks = columnRanks(rows, read, !meta.lowerIsBetter);
  const sorted = [...rows].sort((a, b) => {
    const left = read(a), right = read(b);
    if (left === null || right === null) return left === null ? (right === null ? 0 : 1) : -1;
    return meta.lowerIsBetter ? left - right : right - left;
  });
  const best = Object.fromEntries(columns.map((column) => [column.id, columnRanks(rows, (row) => column.read(row, measure), !meta.lowerIsBetter)]));

  function chooseTrack(next: TrackId) {
    onTrack(next); setSortId("overall"); setExpanded(null);
  }

  return <section className="lbSection" id="main-board" aria-labelledby="main-board-title">
    <nav className="lbTracks" aria-label="Benchmark track">
      {tracks.map((item) => <button type="button" key={item.id} className={`track-${item.id}`} aria-pressed={item.id === trackId} onClick={() => chooseTrack(item.id)}>
        <TrackIcon track={item.id} size={30}/><span><b>{item.title}</b><span>{item.id} · {board.find((entry) => entry.id === item.id)?.rows.length ?? 0} methods</span></span>
      </button>)}
    </nav>

    <div className={`lbCard track-${trackId}`}>
      <div className="lbHead">
        <h2 id="main-board-title">{track.title}</h2>
        <p>{`Sorted by ${sortColumn.id === "overall" ? "Overall" : sortColumn.title.split(":")[0]} ${meta.label}`}{meta.lowerIsBetter ? " · lower is better" : " · higher is better"}{agentsApply ? " · the hybrid agent is shown faded and unranked" : ""}</p>
      </div>
      <div className="lbToolbar">
        <div className="lbControl"><span>Rank by</span><div className="lbSwitch" role="group" aria-label="Rank by">
          {(["primary", "secondary"] as const).map((value) => <button type="button" key={value} aria-pressed={measure === value} onClick={() => setMeasure(value)}>{MEASURES[trackId][value].label}</button>)}
        </div></div>
        {agentsApply && <div className="lbControl"><span>Hybrid agent</span><div className="lbSwitch" role="group" aria-label="Hybrid agent rows">
          <button type="button" aria-pressed={showAgents} onClick={() => setShowAgents(true)}>Show</button>
          <button type="button" aria-pressed={!showAgents} onClick={() => setShowAgents(false)}>Hide</button>
        </div></div>}
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable */}
      <div className="lbTableWrap" role="region" tabIndex={0} aria-label={`${track.title} leaderboard`}>
        <table className="lbTable">
          <thead><tr>
            <th scope="col" className="lbRankHead">Rank</th>
            <th scope="col" className="lbModelHead">Model</th>
            <th scope="col" className="lbTypeHead">Type</th>
            {columns.map((column) => <th scope="col" key={column.id} title={column.title}
              className={`lbMetricHead ${column.id === sortColumn.id ? "isSorted" : ""} ${column.id === "overall" ? "isOverall" : ""}`}
              aria-sort={column.id === sortColumn.id ? (meta.lowerIsBetter ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => setSortId(column.id)} aria-label={`Sort by ${column.title}`}>
                {column.head}{column.id === sortColumn.id && <i aria-hidden="true">{meta.lowerIsBetter ? "↑" : "↓"}</i>}
              </button>
            </th>)}
          </tr></thead>
          <tbody>{sorted.map((row) => {
            const rank = row.ranked ? ranks.get(row.id) : undefined;
            const open = expanded === row.id;
            const hasScenes = Object.keys(row.scenes).length > 0;
            return <Fragment key={row.id}>
              <tr className={`lbRow ${row.ranked ? "" : "isGhost"} ${open ? "isOpen" : ""}`}>
                <td className="lbRank">{rank ? <Medal rank={rank} size={22}/> : <span aria-label="Unranked">—</span>}</td>
                <th scope="row" className="lbModel">
                  <span className="lbModelCell">
                    <MethodLogo label={row.label} size={30}/>
                    <strong>{row.label}</strong>
                    {hasScenes && <button type="button" className="lbExpand" aria-expanded={open} aria-label={`Per-task results for ${row.label}`} onClick={() => setExpanded(open ? null : row.id)}><ChevronDown size={18}/></button>}
                  </span>
                </th>
                <td className="lbType"><span className={`lbPill pill-${row.type.split(" ")[0].toLowerCase()}`}>{row.type === "VLM agent" ? "VLM" : row.type}</span></td>
                {columns.map((column) => {
                  const value = column.read(row, measure);
                  const top = row.ranked && value !== null && value > 0 && best[column.id].get(row.id) === 1;
                  return <td key={column.id} className={`lbMetric ${column.id === sortColumn.id ? "isSorted" : ""} ${top ? "isBest" : ""}`}>
                    <span className="lbValue">{fmt(value)}{value !== null && meta.unit === "%" && <i>%</i>}</span>
                  </td>;
                })}
              </tr>
              {open && <tr className="lbSceneRow"><td colSpan={columns.length + 3}><SceneStrip row={row} measure={measure}/></td></tr>}
            </Fragment>;
          })}</tbody>
        </table>
      </div>
      <p className="lbFoot">{FOOTNOTE[trackId][measure]}</p>
    </div>
  </section>;
}

/** T3 only: per-task success pooled over the five conditions, from the frozen episodes. */
function SceneStrip({ row, measure }: { row: BoardRow; measure: Measure }) {
  return <ol className="lbScenes" aria-label={`${row.label} per task`}>
    {BOARD_SCENES.map((scene) => {
      const score = row.scenes[scene.id];
      const value = measure === "primary" ? score?.value : score?.secondary;
      return <li key={scene.id} title={`${scene.name} · ${score?.n ?? 0} episodes`}>
        <span>{scene.name}</span><b>{fmt(value)}</b>
      </li>;
    })}
  </ol>;
}
