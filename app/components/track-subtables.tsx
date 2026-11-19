"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { AXES, axisLowerIsBetter, axisRows, columnRanks, metricTable, type AxisRow, type MetricColumn, type MetricRow } from "../data/main-board";
import type { TrackId } from "../data/metric-plan";
import { MethodLogo } from "./podium";

type View = "axis" | "metric";

const fmt = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

const AXIS_SECONDARY: Record<TrackId, string> = { T1: "Subtask %", T2: "M-MSE", T3: "Subtask %", T4: "" };
const AXIS_METRIC: Record<TrackId, string> = { T1: "Task success rate (%)", T2: "End-effector error in mm, lower is better", T3: "Task success rate (%)", T4: "Success rate (%) over the three real-robot tasks" };
const AXIS_NOTE: Record<TrackId, string> = {
  T1: "Overall covers all 600 cases.",
  T2: "Overall covers all 600 cases; a positive Δ means a larger error out of distribution.",
  T3: "Overall covers all 600 cases.",
  T4: "Recovery is the continuation cases of towel folding and puzzle insertion. Overall covers all 69 cases.",
};

export function TrackSubtables({ trackId }: { trackId: TrackId }) {
  const [view, setView] = useState<View>("axis");
  return <section className="subtables" aria-label={`${trackId} sub-tables`}>
    <div className="subtableBar">
      <div className="viewSwitch" role="group" aria-label="Sub-table view">
        <button type="button" aria-pressed={view === "axis"} onClick={() => setView("axis")}>By evaluation axis</button>
        <button type="button" aria-pressed={view === "metric"} onClick={() => setView("metric")}>By metric</button>
      </div>
      <p>{view === "axis" ? "One column per evaluation condition." : "Each column pools all tasks and conditions."}</p>
    </div>
    {view === "axis" ? <AxisTable key={trackId} trackId={trackId}/> : <MetricBreakdown key={trackId} trackId={trackId}/>}
  </section>;
}

function AxisTable({ trackId }: { trackId: TrackId }) {
  const rows = useMemo(() => axisRows(trackId), [trackId]);
  const higher = !axisLowerIsBetter(trackId);
  const columns: { id: string; label: string; title: string; read: (row: AxisRow) => number | null; higher: boolean }[] = [
    { id: "overall", label: "Overall", title: "Official overall for the full cohort", read: (row) => row.overall, higher },
    ...AXES.map((axis) => ({ id: axis.id, label: axis.short, title: axis.label, read: (row: AxisRow) => row.axes[axis.id].value, higher })),
    { id: "ood", label: "OOD avg", title: "Mean of V-, S- and B-OOD", read: (row) => row.oodMean, higher },
  ];
  const ranks = Object.fromEntries(columns.map((column) => [column.id, columnRanks(rows, column.read, column.higher)]));
  const sorted = [...rows].sort((a, b) => (a.ranked === b.ranked ? (higher ? 1 : -1) * ((b.overall ?? -1) - (a.overall ?? -1)) : a.ranked ? -1 : 1));
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable
  return <div className="subtableWrap" role="region" tabIndex={0} aria-label={`${trackId} results by evaluation axis`}>
    <table className="subTable">
      <thead><tr>
        <th scope="col">Model</th>
        {columns.map((column) => <th scope="col" key={column.id} title={column.title} className={column.id === "overall" ? "overallHead" : ""}>{column.label}</th>)}
        <th scope="col" title="OOD average minus ID. Negative means the model loses ground out of distribution.">Δ OOD − ID</th>
      </tr></thead>
      <tbody>{sorted.map((row) => <tr key={row.id} className={row.ranked ? "" : "unranked"}>
        <th scope="row" title={row.note ?? undefined}><span className="subModel"><MethodLogo label={row.label} size={26}/><strong>{row.label}</strong></span></th>
        {columns.map((column) => {
          const rank = ranks[column.id].get(row.id);
          const axis = AXES.find((item) => item.id === column.id);
          const cell = axis ? row.axes[axis.id] : null;
          const placed = (column.read(row) ?? 0) > 0;
          return <td key={column.id} className={`${placed && rank === 1 ? "best" : placed && rank === 2 ? "second" : ""} ${column.id === "overall" ? "overallCell" : ""}`}>
            <b title={cell && cell.n > 0 ? `${cell.secondary != null ? `${AXIS_SECONDARY[trackId]} ${fmt(cell.secondary, trackId === "T2" ? 4 : 1)} · ` : ""}${cell.n} cases` : undefined}>{fmt(column.read(row))}</b>
          </td>;
        })}
        <td className={`deltaCell ${row.oodDrop == null ? "" : (higher ? row.oodDrop < 0 : row.oodDrop > 0) ? "down" : "up"}`}>
          <b>{row.oodDrop == null ? "—" : `${row.oodDrop > 0 ? "+" : ""}${row.oodDrop.toFixed(1)}`}</b>
        </td>
      </tr>)}</tbody>
    </table>
    <p className="subtableCaption">{AXIS_METRIC[trackId]}{rows[0] ? `, ${rows[0].axes.ID.n} cases per condition` : ""}. {AXIS_NOTE[trackId]}</p>
  </div>;
}

function MetricBreakdown({ trackId }: { trackId: TrackId }) {
  const table = useMemo(() => metricTable(trackId), [trackId]);
  const [sort, setSort] = useState<string>(table.columns[0]?.id ?? "");
  const groups = table.columns.reduce<{ name: string; span: number }[]>((list, column) => {
    const last = list[list.length - 1];
    if (last && last.name === column.group) last.span += 1; else list.push({ name: column.group, span: 1 });
    return list;
  }, []);
  const ranks = Object.fromEntries(table.columns.map((column) => [column.id, rankMetric(table.rows, column)]));
  const sortColumn = table.columns.find((column) => column.id === sort);
  const sorted = [...table.rows].sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    if (!sortColumn) return 0;
    return (ranks[sortColumn.id].get(a.id) ?? 99) - (ranks[sortColumn.id].get(b.id) ?? 99);
  });
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable
  return <div className="subtableWrap" role="region" tabIndex={0} aria-label={`${trackId} results by metric`}>
    <table className="subTable metricTable">
      <thead>
        <tr className="groupRow"><th scope="col" rowSpan={2}>Model</th>{groups.map((group, index) =>
          <th scope="colgroup" colSpan={group.span} key={`${group.name}:${index}`}>{group.name}</th>)}</tr>
        <tr>{table.columns.map((column) => <th scope="col" key={column.id} title={`${column.label}${column.unit ? ` (${column.unit})` : ""} · ${column.direction === "→0" ? "closer to 0 is better" : column.direction === "↑" ? "higher is better" : "lower is better"}`}
          className={column.pending ? "pendingHead" : ""} aria-sort={sort === column.id ? "ascending" : undefined}>
          {column.pending ? <span>{column.short}<i>{column.direction}</i></span> :
            <button type="button" onClick={() => setSort(column.id)} aria-label={`Rank by ${column.label}`}>
              {column.short}{column.unit ? ` (${column.unit})` : ""}<i>{column.direction}</i>{sort === column.id ? (column.direction === "↓" ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13}/>}
            </button>}
        </th>)}</tr>
      </thead>
      <tbody>{sorted.map((row) => <tr key={row.id} className={row.ranked ? "" : "unranked"}>
        <th scope="row" title={row.note ?? undefined}><span className="subModel"><MethodLogo label={row.label} size={26}/><strong>{row.label}</strong></span></th>
        {table.columns.map((column) => {
          const rank = ranks[column.id].get(row.id);
          return <Fragment key={column.id}>{column.pending
            ? <td className="pendingCell"><span>{column.pending}</span></td>
            : <td className={`${(row.values[column.id] ?? 0) !== 0 && rank === 1 ? "best" : (row.values[column.id] ?? 0) !== 0 && rank === 2 ? "second" : ""} ${sort === column.id ? "sorted" : ""}`}>
              <b>{fmt(row.values[column.id], column.digits)}</b>
            </td>}</Fragment>;
        })}
      </tr>)}</tbody>
    </table>
    <p className="subtableCaption">{table.caption} Click a column to rank by it.</p>
  </div>;
}

function rankMetric(rows: MetricRow[], column: MetricColumn) {
  if (column.pending) return new Map<string, number>();
  const read = (row: MetricRow) => {
    const value = row.values[column.id];
    if (value == null) return null;
    return column.direction === "→0" ? -Math.abs(value) : value;
  };
  return columnRanks(rows, read, column.direction !== "↓");
}
