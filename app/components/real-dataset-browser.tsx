"use client";

import { Camera, ChevronLeft, ChevronRight, Pause, Play, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  RealDatasetCatalog,
  RealDatasetEpisode,
  RealDatasetSummary,
  RealEpisodeEntry,
  SimulationSplitId,
  SimulationTaskSplit,
  SimulationTaskSummary,
} from "../data/real-datasets";
import { secondsLabel } from "../data/curated-dataset";
import { ActionTracePanel } from "./action-trace-panel";

type DatasetEntries = { dataset: RealDatasetSummary; version: string; episodes: RealEpisodeEntry[] };
type BrowserMode = "real" | "simulation";

async function read<T>(apiPrefix: string, query: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${apiPrefix}${query}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 503 ? "数据源暂时不可读，请稍后重试。" : "无法读取数据，请刷新重试。");
  return response.json();
}

function EpisodePlayer({ episode, title }: { episode: RealDatasetEpisode; title: string }) {
  const videos = useRef<Record<string, HTMLVideoElement | null>>({});
  const [ready, setReady] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const media = episode.media;
  const master = media[0];
  const duration = media.length ? Math.min(...media.map(view => view.durationSeconds)) : 0;
  const canPlay = !!master && ready.includes(master.id) && !failed.includes(master.id) && media.every(view => ready.includes(view.id) || failed.includes(view.id));

  function seek(seconds: number) {
    const relative = Math.max(0, Math.min(seconds, duration));
    for (const view of media) {
      const video = videos.current[view.id];
      if (video && ready.includes(view.id) && !failed.includes(view.id)) video.currentTime = view.startSeconds + relative;
    }
    setTime(relative);
  }
  function pause() {
    for (const video of Object.values(videos.current)) video?.pause();
    setPlaying(false);
  }
  function changeRate(next: number) {
    for (const video of Object.values(videos.current)) if (video) video.playbackRate = next;
    setRate(next);
  }
  async function toggle() {
    if (playing) { pause(); return; }
    seek(time >= duration - .05 ? 0 : time);
    const outcomes = media.filter(view => ready.includes(view.id) && !failed.includes(view.id)).map(view => {
      const video = videos.current[view.id];
      if (video) video.playbackRate = rate;
      return video?.play();
    });
    await Promise.allSettled(outcomes);
    setPlaying(Boolean(master && !videos.current[master.id]?.paused));
  }
  function update(id: string) {
    if (id !== master?.id) return;
    const current = videos.current[id];
    if (!current) return;
    const relative = Math.max(0, current.currentTime - master.startSeconds);
    if (relative >= duration || current.currentTime >= master.endSeconds) { pause(); seek(duration); return; }
    setTime(relative);
    if (playing) for (const view of media) {
      const video = videos.current[view.id];
      if (video && view.id !== id && ready.includes(view.id) && !failed.includes(view.id) && Math.abs(video.currentTime - view.startSeconds - relative) > .15) {
        video.currentTime = view.startSeconds + relative;
      }
    }
  }
  if (!media.length) return <p className="reviewLoading">此样本暂无可播放视频。</p>;
  return <div className="realPlayer" data-episode-id={episode.id}>
    <div className="realReplayLayout">
      <div className="realMediaPanel">
        <div className="realCameraGrid">{media.map(view => <figure key={view.id}>
          <figcaption><Camera size={15}/>{view.label}</figcaption>
          <video ref={node => { videos.current[view.id] = node; }} src={`${view.url}#t=${view.startSeconds},${view.endSeconds}`}
            preload="metadata" muted playsInline aria-label={`${title} · ${view.label}`}
            onLoadedMetadata={() => {
              const video = videos.current[view.id];
              if (video) { video.currentTime = view.startSeconds + Math.min(time, duration); video.playbackRate = rate; }
            }}
            onCanPlay={() => setReady(current => current.includes(view.id) ? current : [...current, view.id])}
            onTimeUpdate={() => update(view.id)} onEnded={pause}
            onError={() => { pause(); setFailed(current => current.includes(view.id) ? current : [...current, view.id]); }}>
            <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/>
          </video>
          {failed.includes(view.id) ? <p role="status">视频暂时不可用</p> : !ready.includes(view.id) && <p role="status">正在加载视频…</p>}
        </figure>)}</div>
        <div className="realPlaybackControls">
          <button type="button" disabled={!canPlay} onClick={() => { void toggle(); }} aria-label={playing ? "暂停所有相机" : "播放所有相机"}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
          <input type="range" min={0} max={duration} step={.02} value={Math.min(time, duration)} disabled={!canPlay} aria-label="样本播放进度" onChange={event => seek(Number(event.target.value))}/>
          <span>{secondsLabel(time)} / {secondsLabel(duration)}</span>
          <label><span>Speed · 倍速</span><select aria-label="样本播放速度" value={rate} onChange={event => changeRate(Number(event.target.value))}>
            {[.5, 1, 1.5, 2].map(value => <option value={value} key={value}>{value}×</option>)}
          </select></label>
        </div>
      </div>
      <ActionTracePanel episodeId={episode.id} currentTime={time} source={episode.trace}/>
    </div>
  </div>;
}

function Episode({ id, dataset, apiPrefix }: { id: string; dataset: RealDatasetSummary; apiPrefix: string }) {
  const [episode, setEpisode] = useState<RealDatasetEpisode | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void read<RealDatasetEpisode>(apiPrefix, `?episode=${encodeURIComponent(id)}`, controller.signal).then(value => {
      if (value.id !== id || value.datasetId !== dataset.id) throw new Error("样本身份不一致，请刷新目录。");
      if (!controller.signal.aborted) setEpisode(value);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取样本。"); });
    return () => controller.abort();
  }, [apiPrefix, id, dataset.id]);
  if (error) return <p className="reviewError" role="alert">{error}</p>;
  if (!episode) return <p className="reviewLoading">正在读取样本与相机…</p>;
  return <article className="realEpisode">
    <div className="episodeInstruction"><span>Instruction · 任务指令</span><p className="reviewInstruction">{episode.instruction || "未记录任务指令"}</p></div>
    <EpisodePlayer key={`${dataset.id}:${episode.id}:${episode.metadataSha256}`} episode={episode} title={`${dataset.name} ${episode.name}`}/>
    <div className="realEpisodeFacts"><span>{episode.frames.toLocaleString()} 帧</span><span>{secondsLabel(episode.durationSeconds)}</span><span>{dataset.fps} FPS</span><span>{episode.media.length} 路相机</span></div>
    {!!episode.warnings.length && <ul className="rawReviewWarnings">{episode.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    <details className="rawReviewDetails"><summary>样本与来源身份</summary><dl><dt>Dataset / schema</dt><dd>{dataset.id} · roboexam.{apiPrefix === "simulation-datasets" ? "simulation" : "real"}-datasets.v1</dd><dt>原始 episode</dt><dd>{episode.originalEpisodeId ?? "未记录"}</dd><dt>元数据 SHA-256</dt><dd>{episode.metadataSha256}</dd><dt>Camera views</dt><dd>{episode.media.map(view => `${view.label} (${view.id})`).join(" · ") || "未提供"}</dd></dl></details>
  </article>;
}

const simulationSplits: { id: SimulationSplitId; label: string; detail: string }[] = [
  { id: "training", label: "Training", detail: "训练集 · Policy + ACWM" },
  { id: "id", label: "ID", detail: "同分布评测" },
  { id: "visual", label: "Visual OOD", detail: "视觉域外" },
  { id: "semantic", label: "Semantic OOD", detail: "语义域外" },
  { id: "behavioral", label: "Behavioral OOD", detail: "行为域外" },
  { id: "failure", label: "Failure recovery", detail: "失败恢复" },
];

function splitDefinition(id: SimulationSplitId) {
  return simulationSplits.find(split => split.id === id)!;
}

function DatasetWorkspace({ dataset, revision, apiPrefix, mode, simulation }: {
  dataset: RealDatasetSummary; revision: number; apiPrefix: string; mode: BrowserMode;
  simulation?: { task: SimulationTaskSummary; split: SimulationTaskSplit };
}) {
  const [data, setData] = useState<DatasetEntries | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const simulationTaskId = simulation?.task.id ?? "";
  useEffect(() => {
    const controller = new AbortController();
    const task = simulationTaskId ? `&task=${encodeURIComponent(simulationTaskId)}` : "";
    void read<DatasetEntries>(apiPrefix, `?dataset=${encodeURIComponent(dataset.id)}${task}`, controller.signal).then(value => {
      if (value.dataset.id !== dataset.id) throw new Error("数据集身份不一致，请刷新目录。");
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取数据集。"); });
    return () => controller.abort();
  }, [apiPrefix, dataset.id, revision, simulationTaskId]);
  if (error) return <p className="reviewError" role="alert">{error}</p>;
  const episodes = data?.episodes.filter(row => `${row.name} ${row.instruction} ${row.originalEpisodeId ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const episode = episodes.find(row => row.id === selectedId) ?? episodes[0];
  const index = episode ? episodes.indexOf(episode) : -1;
  const split = simulation ? splitDefinition(simulation.split.id) : null;
  const visibleFrames = data?.episodes.reduce((sum, row) => sum + row.frames, 0);
  const visibleEpisodes = data?.episodes.length ?? simulation?.split.episodeCount ?? dataset.episodeCount;
  return <section className="rawReviewPanel realDatasetPanel" aria-label={mode === "simulation" ? "Simulation 样本浏览" : "Real & Ego 样本浏览"}>
    <div className="rawReviewHeading"><h3>{simulation?.task.name ?? dataset.name}</h3><span>{split ? `${split.label} · ${split.detail}` : dataset.kind === "ego" ? "Ego" : "Real robot"} · {dataset.format}</span></div>
    <div className="realDatasetFacts"><span>{mode === "simulation" ? `Robot: ${dataset.robotType || "未记录"}` : `Robot / device: ${dataset.robotType || "未记录"}`}</span>{mode === "real" && <span>{dataset.taskCount.toLocaleString()} 个任务</span>}<span>{visibleEpisodes.toLocaleString()} 个 episode</span><span>{visibleFrames === undefined ? "正在统计帧数" : `${visibleFrames.toLocaleString()} 帧`}</span><span>{dataset.cameras.length} 路相机</span><span>{dataset.fps} FPS</span></div>
    <details className="rawReviewDetails realIdentity"><summary>目录来源与质量状态</summary><dl><dt>Dataset ID</dt><dd>{dataset.id}</dd><dt>Format / schema</dt><dd>{dataset.format} · {mode === "simulation" ? "roboexam.simulation-datasets.v1" : "roboexam.real-datasets.v1"}</dd><dt>可读性</dt><dd>{dataset.availability === "available" ? "Available" : "Unavailable"}</dd><dt>QC</dt><dd>未提供独立审核状态{dataset.warnings.length ? ` · ${dataset.warnings.length} 条目录提示` : ""}</dd></dl></details>
    {!!dataset.warnings.length && <ul className="rawReviewWarnings">{dataset.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    <label className="realSearch"><Search size={17}/><span className="curatedSrOnly">搜索样本或任务指令</span><input type="search" placeholder="搜索样本或任务指令…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {!data ? <p className="reviewLoading">正在读取数据集…</p> : !episode ? <p className="reviewLoading">没有匹配的样本。</p> : <>
      <div className="reviewEpisodeControls"><label>选择样本 <small>{index + 1} / {episodes.length}</small><select value={episode.id} onChange={event => setSelectedId(event.target.value)}>{episodes.map(row => <option key={row.id} value={row.id}>{row.name} · {row.instruction}</option>)}</select></label>
        <div><button type="button" disabled={index <= 0} aria-label={`上一条 ${mode === "simulation" ? "Simulation" : "Real & Ego"} 样本`} onClick={() => setSelectedId(episodes[index - 1].id)}><ChevronLeft size={18}/></button><button type="button" disabled={index >= episodes.length - 1} aria-label={`下一条 ${mode === "simulation" ? "Simulation" : "Real & Ego"} 样本`} onClick={() => setSelectedId(episodes[index + 1].id)}><ChevronRight size={18}/></button></div>
      </div>
      <Episode key={`${dataset.id}:${episode.id}:${data.version}`} id={episode.id} dataset={dataset} apiPrefix={apiPrefix}/>
    </>}
  </section>;
}

function DatasetBrowser({ embedded = false, mode }: {
  embedded?: boolean; mode: BrowserMode;
}) {
  const apiPrefix = mode === "simulation" ? "simulation-datasets" : "real-datasets";
  const [catalog, setCatalog] = useState<RealDatasetCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<"all" | "robot" | "ego">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(() =>
    typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("task") ?? "");
  const [splitId, setSplitId] = useState<SimulationSplitId>("training");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update(force = false) {
      setLoading(true);
      let delay = 30000;
      try {
        const value = await read<RealDatasetCatalog>(apiPrefix, force ? "?refresh=1" : "", controller.signal);
        const expectedSchema = mode === "simulation" ? "roboexam.simulation-datasets.v1" : "roboexam.real-datasets.v1";
        if (value.schemaVersion !== expectedSchema) throw new Error("数据目录版本不一致。");
        if (mode === "simulation" && !Array.isArray(value.simulationTasks)) throw new Error("Simulation 任务目录版本不一致。");
        if (controller.signal.aborted) return;
        delay = Math.max(1000, value.refreshSeconds * 1000) + 100;
        setCatalog(value); setError(""); setRevision(current => current + 1);
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取目录。"); }
      finally { if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => { void update(); }, delay); } }
    }
    void update(request > 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [apiPrefix, mode, request]);
  const allDatasets = catalog?.datasets ?? [];
  const simulationTasks = catalog?.simulationTasks ?? [];
  const filteredTasks = simulationTasks.filter(task =>
    `${task.name} ${task.id}`.toLowerCase().includes(taskQuery.trim().toLowerCase()));
  const activeTask = simulationTasks.find(task => task.id === selectedTaskId) ?? simulationTasks[0];
  const activeSplit = activeTask?.splits.find(split => split.id === splitId) ?? activeTask?.splits[0];
  const datasets = allDatasets.filter(row => (kind === "all" || row.kind === kind) &&
      `${row.name} ${row.robotType}`.toLowerCase().includes(query.trim().toLowerCase()));
  const dataset = mode === "simulation"
    ? allDatasets.find(row => row.id === activeSplit?.datasetId)
    : datasets.find(row => row.id === selectedId) ?? datasets[0];
  const episodeCount = allDatasets.reduce((sum, row) => sum + row.episodeCount, 0);
  function chooseTask(taskId: string) {
    setSelectedTaskId(taskId);
    const url = new URL(window.location.href);
    url.searchParams.set("task", taskId);
    url.searchParams.delete("episode");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return <div className={`reviewBoard realDatasetBrowser${mode === "simulation" ? " simulationDatasetBrowser" : ""}${embedded ? " datasetEmbedded" : ""}`}>
    {!embedded && <section className="reviewHero"><div><div className="reviewEyebrow"><Camera size={16}/>{mode === "simulation" ? "SIMULATION · TASK-FIRST" : "REAL ROBOT · EGOCENTRIC"}</div><h2>{mode === "simulation" ? "Simulation 数据" : "Real & Ego 数据"}</h2><p>{mode === "simulation" ? "按任务浏览 Training、ID、三类 OOD 与失败恢复样本，同步回放三路相机和机器人动作。" : "浏览真实机器人示范与第一视角记录，查看任务指令、样本时长和已有相机画面。"}</p><span>{mode === "simulation" ? "24 tasks · 100 training + 25 evaluation episodes per task" : "Real robot demonstrations · Egocentric recordings"}</span></div>
      <div className="reviewStats"><div><strong>{mode === "simulation" ? catalog?.simulationTasks?.length ?? "—" : catalog?.datasets.length ?? "—"}</strong><small>{mode === "simulation" ? "任务" : "数据集"}</small></div><div><strong>{catalog ? episodeCount.toLocaleString() : "—"}</strong><small>样本</small></div></div>
    </section>}
    {embedded ? <section className="datasetSummaryStrip" aria-label={mode === "simulation" ? "Simulation catalog summary" : "Real and ego catalog summary"}>
      <div><strong>{mode === "simulation" ? catalog?.simulationTasks?.length ?? 24 : catalog?.datasets.length ?? "—"}</strong><span>{mode === "simulation" ? "Tasks" : "Datasets"}</span></div><div><strong>{catalog ? episodeCount.toLocaleString() : mode === "simulation" ? "3,000" : "—"}</strong><span>Episodes</span></div>
      <div className="datasetSummaryAction"><span role="status">{error || (catalog ? `${mode === "simulation" ? "125 episodes / task · " : ""}扫描于 ${new Date(catalog.scannedAt).toLocaleString()}` : `正在读取 ${mode === "simulation" ? "Simulation" : "Real & Ego"} 目录…`)}</span><button type="button" disabled={loading} onClick={() => setRequest(current => current + 1)}><RefreshCw size={15}/>{loading ? "扫描中…" : "刷新"}</button></div>
    </section> : <div className="rawReviewRefresh"><span role="status">{error || (catalog ? `最近扫描：${new Date(catalog.scannedAt).toLocaleString()}` : `正在读取 ${mode === "simulation" ? "Simulation" : "Real & Ego"} 目录…`)}</span><button type="button" disabled={loading} onClick={() => setRequest(current => current + 1)}><RefreshCw size={15}/>{loading ? "扫描中…" : "刷新"}</button></div>}
    {mode === "real" && <div className="realDatasetFilters"><div className="reportSwitch" aria-label="数据类型筛选">{([["all", "全部"], ["robot", "Real robot"], ["ego", "Ego"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div><label className="realSearch"><Search size={17}/><span className="curatedSrOnly">搜索 Real & Ego 数据集</span><input type="search" placeholder="搜索数据集…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>}
    {error ? <p className="reviewError" role="alert">{error}</p> : mode === "simulation" ? <div className="simulationTaskWorkspace">
      <aside className="simulationTaskRail">
        <div className="simulationTaskRailHeading"><span>Task · 任务</span><strong>{simulationTasks.length || 24}</strong></div>
        <label className="realSearch"><Search size={16}/><span className="curatedSrOnly">搜索 Simulation 任务</span><input type="search" placeholder="搜索任务…" value={taskQuery} onChange={event => setTaskQuery(event.target.value)}/></label>
        <nav aria-label="Simulation tasks">{filteredTasks.map(task => <button type="button" key={task.id} aria-pressed={activeTask?.id === task.id} onClick={() => chooseTask(task.id)}><b>{String(task.sceneId + 1).padStart(2, "0")}</b><span><strong>{task.name}</strong><small>{task.episodeCount} episodes</small></span></button>)}</nav>
        {catalog && filteredTasks.length === 0 && <p>没有匹配的任务。</p>}
      </aside>
      <div className="simulationTaskStage">
        {activeTask && <header className="simulationTaskHeader"><div><span>Task {activeTask.sceneId + 1} / {simulationTasks.length}</span><h3>{activeTask.name}</h3></div><strong>{activeTask.episodeCount}<small>episodes</small></strong></header>}
        {activeTask && <nav className="simulationSplitRail" aria-label={`${activeTask.name} data groups`}>{simulationSplits.map(definition => {
          const split = activeTask.splits.find(candidate => candidate.id === definition.id);
          return <button type="button" key={definition.id} disabled={!split} aria-pressed={activeSplit?.id === definition.id} onClick={() => setSplitId(definition.id)}><span><strong>{definition.label}</strong><small>{definition.detail}</small></span><b>{split?.episodeCount ?? "—"}</b></button>;
        })}</nav>}
        {dataset && activeTask && activeSplit ? dataset.availability === "available"
          ? <DatasetWorkspace key={`${dataset.id}:${activeTask.id}:${activeSplit.id}`} dataset={dataset} revision={revision} apiPrefix={apiPrefix} mode={mode} simulation={{ task: activeTask, split: activeSplit }}/>
          : <p className="reviewLoading">此数据分组暂时不可读，请稍后刷新。{dataset.warnings.join(" ")}</p>
          : <p className="reviewLoading">{catalog ? "正在建立任务分组…" : "正在读取目录…"}</p>}
      </div>
    </div> : <div className="realDatasetWorkspace">
      <nav className="realDatasetList" aria-label="Real & Ego 数据集">{datasets.map(row => <button type="button" key={row.id} aria-pressed={dataset?.id === row.id} onClick={() => setSelectedId(row.id)}><strong>{row.name}</strong><span>{row.kind === "ego" ? "Ego" : "Real robot"} · {row.episodeCount.toLocaleString()} 个样本</span><small>{row.format} · {row.cameras.length} 路相机{row.availability === "unavailable" ? " · 暂不可读" : ""}</small></button>)}</nav>
      {dataset ? dataset.availability === "available" ? <DatasetWorkspace key={dataset.id} dataset={dataset} revision={revision} apiPrefix={apiPrefix} mode={mode}/> : <p className="reviewLoading">此数据集暂时不可读，请稍后刷新。{dataset.warnings.join(" ")}</p> : <p className="reviewLoading">{catalog ? "没有匹配的数据集。" : "正在读取目录…"}</p>}
    </div>}
    {!!catalog?.warnings.length && <details className="rawReviewWarnings"><summary>目录提示（{catalog.warnings.length}）</summary><ul>{catalog.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
  </div>;
}

export function RealDatasetBrowser({ embedded = false }: { embedded?: boolean }) {
  return <DatasetBrowser embedded={embedded} mode="real"/>;
}

export function SimulationDatasetBrowser({ embedded = false }: { embedded?: boolean }) {
  return <DatasetBrowser embedded={embedded} mode="simulation"/>;
}
