"use client";

import { Activity, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type Trace = {
  schemaVersion: "roboexam.action-trace.v1";
  episodeId: string;
  clock: { dataset: string; unit: "seconds"; sourceFrames: number; samples: number };
  t: number[];
  jointPosition: { unit: "rad"; left: number[][]; right: number[][] };
  endEffectorPosition: { unit: "m"; frame: "world"; left: number[][]; right: number[][] };
  provenance: { manifestSha256: string; trajectorySha256: string | null; datasets: string[] };
};

const jointColors = ["#5f8fe5", "#64c5bc", "#9e7bd5", "#e1a255", "#dc7181", "#7792aa"];
const xyzColors = ["#dc7181", "#64b98b", "#5f8fe5"];

export function ActionTracePanel({ episodeId, currentTime }: { episodeId: string; currentTime: number }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const key = episodeId.replace(/^episode:/, "");
  const validId = /^[a-f0-9]+$/.test(key);
  useEffect(() => {
    const controller = new AbortController();
    if (!validId) return () => controller.abort();
    void fetch(`/curated-traces/${key}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("trace unavailable");
        return response.json() as Promise<Trace>;
      })
      .then((value) => {
        if (value.schemaVersion !== "roboexam.action-trace.v1" || value.episodeId !== episodeId) throw new Error("trace identity mismatch");
        if (!controller.signal.aborted) setTrace(value);
      })
      .catch(() => { if (!controller.signal.aborted) setFailedId(episodeId); });
    return () => controller.abort();
  }, [episodeId, key, validId]);

  if (!validId || failedId === episodeId) return <section className="actionTracePanel traceUnavailable">
    <Activity size={18}/><div><strong>Action telemetry unavailable</strong>
      <span>No joint or end-effector curve is synthesized for this episode.</span></div>
  </section>;
  if (!trace || trace.episodeId !== episodeId) return <section className="actionTracePanel traceLoading">
    <LoaderCircle className="curatedSpin" size={18}/>Loading synchronized action telemetry…
  </section>;

  return <section className="actionTracePanel" aria-label="Synchronized joint and end-effector traces">
    <header><div><p className="eyebrow">Action replay</p><h5>Joint and end-effector trajectories</h5></div>
      <span>{trace.clock.sourceFrames.toLocaleString()} source frames → {trace.clock.samples} plotted samples · video PTS clock</span></header>
    <div className="traceGroups">
      <TraceGroup title="Joint position" unit={trace.jointPosition.unit} labels={["J1","J2","J3","J4","J5","J6"]}
        colors={jointColors} left={trace.jointPosition.left} right={trace.jointPosition.right}
        time={trace.t} currentTime={currentTime}/>
      <TraceGroup title="End-effector position" unit={`${trace.endEffectorPosition.unit} · ${trace.endEffectorPosition.frame} frame`}
        labels={["X","Y","Z"]} colors={xyzColors} left={trace.endEffectorPosition.left}
        right={trace.endEffectorPosition.right} time={trace.t} currentTime={currentTime}/>
    </div>
    <footer>Source-bound to manifest <code>{trace.provenance.manifestSha256.slice(0, 12)}</code> and trajectory <code>{trace.provenance.trajectorySha256?.slice(0, 12) ?? "hash unavailable"}</code>.</footer>
  </section>;
}

function TraceGroup({ title, unit, labels, colors, left, right, time, currentTime }: {
  title: string;
  unit: string;
  labels: string[];
  colors: string[];
  left: number[][];
  right: number[][];
  time: number[];
  currentTime: number;
}) {
  return <section className="traceGroup">
    <header><strong>{title}</strong><span>{unit}</span></header>
    <div className="traceCharts">
      <TraceChart title="Left arm" values={left} time={time} labels={labels} colors={colors} currentTime={currentTime}/>
      <TraceChart title="Right arm" values={right} time={time} labels={labels} colors={colors} currentTime={currentTime}/>
    </div>
  </section>;
}

function TraceChart({ title, values, time, labels, colors, currentTime }: {
  title: string;
  values: number[][];
  time: number[];
  labels: string[];
  colors: string[];
  currentTime: number;
}) {
  const width = 640, height = 150, top = 14, bottom = 22;
  const flat = values.flat();
  const rawMin = Math.min(...flat), rawMax = Math.max(...flat);
  const padding = Math.max((rawMax - rawMin) * .08, .001);
  const min = rawMin - padding, max = rawMax + padding;
  const duration = time.at(-1) ?? 1;
  const x = (value: number) => duration > 0 ? value / duration * width : 0;
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  const cursor = Math.max(0, Math.min(width, x(currentTime)));
  const series = labels.map((_, dimension) => values.map((sample, index) => `${x(time[index]).toFixed(1)},${y(sample[dimension]).toFixed(1)}`).join(" "));
  return <figure className="traceChart">
    <figcaption><strong>{title}</strong><span>{labels.map((label, index) =>
      <i key={label}><b style={{ background: colors[index] }}/>{label}</i>)}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title} ${labels.join(", ")} over video time`}>
      <path className="traceGridline" d={`M0 ${top}H${width}M0 ${(height - bottom + top) / 2}H${width}M0 ${height - bottom}H${width}`}/>
      {series.map((points, index) => <polyline key={labels[index]} points={points} stroke={colors[index]}/>)}
      <line className="traceCursor" x1={cursor} x2={cursor} y1={top} y2={height - bottom}/>
      <text x="4" y={height - 5}>0:00</text><text x={width - 4} y={height - 5} textAnchor="end">{duration.toFixed(1)}s</text>
    </svg>
  </figure>;
}
