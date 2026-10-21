"use client";

import { Activity, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { validateActionTrace, type ActionTrace, type ActionTraceSource } from "../data/action-trace";

const jointColors = ["#5f8fe5", "#64c5bc", "#9e7bd5", "#e1a255", "#dc7181", "#7792aa"];
const xyzColors = ["#dc7181", "#64b98b", "#5f8fe5"];

export function ActionTracePanel({ episodeId, currentTime, source }: { episodeId: string; currentTime: number; source?: ActionTraceSource }) {
  const [loaded, setLoaded] = useState<{ key: string; trace: ActionTrace } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = episodeId.replace(/^episode:/, "");
  const validId = /^[a-f0-9]+$/.test(key);
  const url = source && "url" in source ? source.url : `/curated-traces/${key}.json`;
  const binding = source && "url" in source ? source.bindingSha256 : "";
  const manifest = source && "url" in source ? source.manifestSha256 : "";
  const unavailable = source && "unavailable" in source ? source.unavailable : "";
  const requestKey = `${episodeId}:${url}:${binding}:${manifest}`;
  useEffect(() => {
    const controller = new AbortController();
    if (!validId || unavailable) return () => controller.abort();
    void fetch(url, { signal: controller.signal, ...(binding ? { cache: "no-store" as const } : {}) })
      .then(async response => {
        if (!response.ok) throw new Error("trace unavailable");
        const body = await response.json();
        if (binding && body.status !== "available") throw new Error("trace unavailable");
        const trace = validateActionTrace(binding ? body.trace : body, episodeId,
          binding ? { url, bindingSha256: binding, manifestSha256: manifest } : undefined);
        if (!controller.signal.aborted) setLoaded({ key: requestKey, trace });
      })
      .catch(() => { if (!controller.signal.aborted) setFailedKey(requestKey); });
    return () => controller.abort();
  }, [episodeId, url, binding, manifest, requestKey, validId, unavailable, retry]);

  if (!validId || unavailable || failedKey === requestKey) return <section className="actionTracePanel traceUnavailable">
    <Activity size={18}/><div><strong>Action telemetry unavailable</strong>
      <span>此样本缺少可验证的同步关节/末端记录，保留视频与评论；不合成曲线。</span>
      {!unavailable && source && <button type="button" onClick={() => { setFailedKey(null); setRetry(value => value + 1); }}>重试读取轨迹</button>}
    </div>
  </section>;
  if (!loaded || loaded.key !== requestKey) return <section className="actionTracePanel traceLoading">
    <LoaderCircle className="curatedSpin" size={18}/>Loading synchronized action telemetry…
  </section>;
  const trace = loaded.trace;

  return <section className="actionTracePanel" aria-label="Synchronized joint and end-effector traces">
    <header><div><p className="eyebrow">Action replay</p><h5>Joint and end-effector trajectories</h5></div>
      <span>{trace.clock.sourceFrames.toLocaleString()} source frames → {trace.clock.samples} plotted samples · {trace.clock.label ?? "video PTS clock"}</span></header>
    <div className="traceGroups">
      <TraceGroup title="Joint position" unit={trace.jointPosition.unit} labels={["J1","J2","J3","J4","J5","J6"]}
        colors={jointColors} left={trace.jointPosition.left} right={trace.jointPosition.right}
        time={trace.t} currentTime={currentTime}/>
      <TraceGroup title="End-effector position" unit={`${trace.endEffectorPosition.unit} · ${trace.endEffectorPosition.frame} frame`}
        labels={["X","Y","Z"]} colors={xyzColors} left={trace.endEffectorPosition.left}
        right={trace.endEffectorPosition.right} time={trace.t} currentTime={currentTime}/>
    </div>
    <footer>{trace.provenance.bindingMethod === "raw_file_identity" ? <>
      原始轨迹只读抽样 · 元数据 <code>{trace.provenance.manifestSha256.slice(0, 12)}</code> · 文件绑定 <code>{trace.provenance.bindingSha256?.slice(0, 12)}</code>
      <span>曲线使用记录的状态；大型轨迹文件未重复做整文件哈希验收。</span>
    </> : <>Source-bound to manifest <code>{trace.provenance.manifestSha256.slice(0, 12)}</code> and trajectory <code>{trace.provenance.trajectorySha256?.slice(0, 12) ?? "hash unavailable"}</code>.</>}</footer>
  </section>;
}

function TraceGroup({ title, unit, labels, colors, left, right, time, currentTime }: {
  title: string;
  unit: string;
  labels: string[];
  colors: string[];
  left: number[][] | null;
  right: number[][] | null;
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
  values: number[][] | null;
  time: number[];
  labels: string[];
  colors: string[];
  currentTime: number;
}) {
  if (!values) return <figure className="traceChart traceMissing"><figcaption><strong>{title}</strong></figcaption>
    <p>{labels[0] === "J1" ? "此来源未记录关节角度" : "此来源未记录末端位置"}</p></figure>;
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
