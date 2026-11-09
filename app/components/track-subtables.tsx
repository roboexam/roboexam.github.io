"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { AXES, axisRows, columnRanks, metricTable, type AxisRow, type MetricColumn, type MetricRow } from "../data/main-board";
import type { TrackId } from "../data/metric-plan";

type View = "axis" | "metric";

const fmt = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

const AXIS_SECONDARY: Partial<Record<TrackId, string>> = { T1: "Subtask", T2: "PSNR dB", T3: "Subtask %" };
const AXIS_METRIC: Partial<Record<TrackId, string>> = { T1: "Agent score", T2: "Composite", T3: "Success rate %" };

export function TrackSubtables({ trackId }: { trackId: TrackId }) {
  const [view, setView] = useState<View>("axis");
  if (trackId === "T4") {
    return <div className="subtableEmpty"><strong>Real-robot sub-tables are not published yet.</strong>
      <p>Task success on standardized hardware trials will fill the same ID / OOD / Failure and metric layouts once the first admitted runs land.</p></div>;
  }
  return <section className="subtables" aria-label={`${trackId} sub-tables`}>
    <div className="subtableBar">
      <div className="viewSwitch" role="group" aria-label="Sub-table view">
        <button type="button" aria-pressed={view === "axis"} onClick={() => setView("axis")}>By evaluation axis</button>
        <button type="button" aria-pressed={view === "metric"} onClick={() => setView("metric")}>By metric</button>
      </div>
      <p>{view === "axis"
        ? "Each column pools one setting across the shared scenes; n is the number of evaluated cases."
        : "Each column pools all scenes and all five settings."}</p>
    </div>
    {view === "axis" ? <AxisTable key={trackId} trackId={trackId}/> : <MetricBreakdown key={trackId} trackId={trackId}/>}
  </section>;
}

function AxisTable({ trackId }: { trackId: TrackId }) {
  const rows = useMemo(() => axisRows(trackId), [trackId]);
  const columns: { id: string; label: string; title: string; read: (row: AxisRow) => number | null; higher: boolean }[] = [
    { id: "overall", label: "Overall", title: "Official overall for the full cohort", read: (row) => row.overall, higher: true },
    ...AXES.map((axis) => ({ id: axis.id, label: axis.short, title: axis.label, read: (row: AxisRow) => row.axes[axis.id].value, higher: true })),
    { id: "ood", label: "OOD avg", title: "Mean of V-, S- and B-OOD", read: (row) => row.oodMean, higher: true },
  ];
  const ranks = Object.fromEntries(columns.map((column) => [column.id, columnRanks(rows, column.read, column.higher)]));
  const sorted = [...rows].sort((a, b) => (a.ranked === b.ranked ? (b.overall ?? -1) - (a.overall ?? -1) : a.ranked ? -1 : 1));
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable
  return <div className="subtableWrap" role="region" tabIndex={0} aria-label={`${trackId} results by evaluation axis`}>
    <table className="subTable">
      <thead><tr>
        <th scope="col">Model</th>
        {columns.map((column) => <th scope="col" key={column.id} title={column.title} className={column.id === "overall" ? "overallHead" : ""}>{column.label}</th>)}
        <th scope="col" title="OOD average minus ID. Negative means the model loses ground out of distribution.">Δ OOD − ID</th>
      </tr></thead>
      <tbody>{sorted.map((row) => <tr key={row.id} className={row.ranked ? "" : "unranked"}>
        <th scope="row"><strong>{row.label}</strong><span><i className="typePill">{row.type}</i>{row.note ?? ""}</span></th>
        {columns.map((column) => {
          const rank = ranks[column.id].get(row.id);
          const axis = AXES.find((item) => item.id === column.id);
          const cell = axis ? row.axes[axis.id] : null;
          return <td key={column.id} className={`${rank === 1 ? "best" : rank === 2 ? "second" : ""} ${column.id === "overall" ? "overallCell" : ""}`}>
            <b>{fmt(column.read(row))}</b>
            {cell && cell.n > 0 && <small>{cell.secondary != null ? `${fmt(cell.secondary)} · ` : ""}n={cell.n}</small>}
          </td>;
        })}
        <td className={`deltaCell ${row.oodDrop == null ? "" : row.oodDrop < 0 ? "down" : "up"}`}>
          <b>{row.oodDrop == null ? "—" : `${row.oodDrop > 0 ? "+" : ""}${row.oodDrop.toFixed(1)}`}</b>
        </td>
      </tr>)}</tbody>
    </table>
    <p className="subtableCaption">Main value: {AXIS_METRIC[trackId]}. Small text: {AXIS_SECONDARY[trackId]} · cases. {trackId === "T2" ? "Composite is cohort-relative (50 = cohort geometric mean) and recomputed per setting." : ""}{trackId === "T1" ? "Overall is the official T1 formula (70% Subtask over five settings + 30% VQA over four)." : ""}</p>
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
              {column.short}<i>{column.direction}</i>{sort === column.id ? (column.direction === "↓" ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13}/>}
            </button>}
        </th>)}</tr>
      </thead>
      <tbody>{sorted.map((row) => <tr key={row.id} className={row.ranked ? "" : "unranked"}>
        <th scope="row"><strong>{row.label}</strong><span><i className="typePill">{row.type}</i>{row.note ?? ""}</span></th>
        {table.columns.map((column) => {
          const rank = ranks[column.id].get(row.id);
          return <Fragment key={column.id}>{column.pending
            ? <td className="pendingCell"><span>{column.pending}</span></td>
            : <td className={`${rank === 1 ? "best" : rank === 2 ? "second" : ""} ${sort === column.id ? "sorted" : ""}`}>
              <b>{fmt(row.values[column.id], column.digits)}</b>{column.unit && row.values[column.id] != null && <small>{column.unit}</small>}
            </td>}</Fragment>;
        })}
      </tr>)}</tbody>
    </table>
    <p className="subtableCaption">{table.caption} Click a column to rank by it; arrows show the better direction.</p>
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
