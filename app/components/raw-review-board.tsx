"use client";
import { ClipboardCheck, Folder, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { RawEpisode, RawTask, RawTaskEntries } from "../data/raw-review";
import { reviewLabels } from "../data/review-filters";
import { SynchronizedCameraPlayer } from "./synchronized-camera-player";
import { ReviewNotes } from "./review-notes";
import { readRaw as read, useRawCatalog, type RawCatalogState } from "./use-raw-catalog";

function link(task: string, folder?: string, episode?: string) {
  const url = new URL(location.href);
  url.searchParams.set("task", task);
  for (const [key, value] of [["folder", folder], ["episode", episode]]) {
    if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!);
  }
  history.replaceState(null, "", url);
}
function Episode({ id, tick, task, review, unavailable }: { id: string; tick: number; task: RawTask; review: boolean; unavailable: boolean }) {
  const [episode, setEpisode] = useState<RawEpisode | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void read<RawEpisode>(`/api/raw-review?episode=${id}`, controller.signal).then(value => {
      if (value.id !== id || value.taskId !== task.id) throw new Error("样本身份不一致");
      setEpisode(old => JSON.stringify(old) === JSON.stringify(value) ? old : value); setError("");
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [id, task.id, tick]);
  if (error && !episode) return <p className="reviewError" role="alert">{error}</p>;
  if (!episode) return <p className="reviewLoading">正在读取样本与相机…</p>;
  return <article className="reviewEpisode">
    <p className="reviewInstruction">{episode.instruction}</p>
    {error || unavailable ? <p className="reviewError" role="alert">{error || "目录暂时不可读"}；视频暂停展示，评论仍可保存。</p> : episode.media.length ? <SynchronizedCameraPlayer media={episode.media} traceId={episode.id} traceSource={episode.trace} title={`${task.name} ${episode.name}`}/> :
      <p className="reviewLoading">此样本没有可播放视频，文件和质检意见仍可查看。</p>}
    <div className="reviewEvidence"><span><ShieldCheck size={15}/>公盘目录记录 · 人工状态独立保存</span>
      <span>seed {episode.seed ?? "未记录"}</span><span>强保真原记录：{episode.strongFidelity === true ? "通过" : episode.strongFidelity === false ? "未通过" : "未提供"}</span>
      <span>目录：{episode.folder}</span></div>
    {episode.warnings.length > 0 && <ul className="rawReviewWarnings">{episode.warnings.map(value => <li key={value}>{value}</li>)}</ul>}
    <details className="rawReviewDetails"><summary>文件与来源身份</summary><dl>
      <dt>原始 episode</dt><dd>{episode.originalEpisodeId ?? "未提供"}</dd>
      <dt>采集源码</dt><dd>{episode.sourceCommit ?? "未提供"}</dd>
      <dt>元数据身份 SHA-256</dt><dd>{episode.manifestSha256}</dd>
      <dt>身份来源</dt><dd>{episode.identityKind === "manifest" ? "episode_manifest.json" : episode.identityKind === "source" ? "SOURCE.json" : "文件清单与文件状态；未提供 manifest"}</dd>
    </dl><ul>{episode.files.map(file => <li key={file.name}>{file.name} · {(file.bytes / 1024 / 1024).toFixed(1)} MiB</li>)}</ul></details>
    <a className="rawReviewCrossLink" href={`${review ? "/datasets" : "/review"}?${new URLSearchParams({ task: task.name, folder: episode.folderId, episode: episode.id })}`}>
      {review ? "在 Datasets 查看此样本 →" : "在 Review 质检此样本 →"}
    </a>
    {review && <ReviewNotes key={episode.id + episode.reviewVersion} episode={episode} taskId={task.name}/>}
  </article>;
}
function Workspace({ task, tick, review, unavailable }: { task: RawTask; tick: number; review: boolean; unavailable: boolean }) {
  const [data, setData] = useState<RawTaskEntries | null>(null);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void read<RawTaskEntries>(`/api/raw-review?task=${task.id}`, controller.signal).then(value => {
      if (value.taskId !== task.id) throw new Error("场景身份不一致");
      setData(value); setError("");
      const url = new URL(location.href);
      const sameTask = url.searchParams.get("task") === task.name;
      const wantedFolder = sameTask ? url.searchParams.get("folder") ?? "" : "";
      const wanted = sameTask ? url.searchParams.get("episode") ?? "" : "";
      setFolderId(old => task.folders.some(row => row.id === (old || wantedFolder)) ? old || wantedFolder : "");
      setSelectedId(old => value.entries.some(row => row.id === (old || wanted)) ? old || wanted : "");
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [task.id, task.name, task.folders, tick]);
  if (error) return <p className="reviewError" role="alert">{error}</p>;
  const folder = task.folders.find(row => row.id === folderId) ?? task.folders.find(row => row.count > 0) ?? task.folders[0];
  const rows = data?.entries.filter(row => row.folderId === folder?.id) ?? [];
  const episode = rows.find(row => row.id === selectedId) ?? rows[0];
  const index = episode ? rows.indexOf(episode) : -1;
  function choose(id: string) { setSelectedId(id); link(task.name, folder?.id, id); }
  return <div className="rawReviewWorkspace">
    <nav className="rawReviewFolders" aria-label="场景数据文件夹">
      {task.folders.map(row => <button type="button" key={row.id} aria-pressed={folder?.id === row.id} onClick={() => {
        setFolderId(row.id); setSelectedId(""); link(task.name, row.id);
      }}><Folder size={17}/><span>{row.path}</span><b>{row.count}</b></button>)}
    </nav>
    <section className="rawReviewPanel" aria-label="样本浏览">
      <div className="rawReviewHeading"><h3>{folder?.path ?? "暂无文件夹"}</h3><span>{rows.length} 条目录记录</span></div>
      {!data ? <p className="reviewLoading">正在读取场景…</p> : !episode ? <p className="reviewLoading">此文件夹暂无样本，新增内容会自动出现。</p> : <>
        <div className="reviewEpisodeControls"><label>选择样本 <small>{index + 1} / {rows.length}</small>
          <select value={episode.id} onChange={event => choose(event.target.value)}>{rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <div><button type="button" aria-label="上一条样本" disabled={index <= 0} onClick={() => choose(rows[index - 1].id)}>←</button>
            <button type="button" aria-label="下一条样本" disabled={index >= rows.length - 1} onClick={() => choose(rows[index + 1].id)}>→</button></div></div>
        <Episode key={task.id + episode.id} id={episode.id} task={task} tick={tick} review={review} unavailable={unavailable}/>
      </>}
    </section>
  </div>;
}
export function RawReviewBoard() {
  const state = useRawCatalog();
  return <RawDataBrowser state={state} review/>;
}

export function RawDataBrowser({ state, review = false, initialTask }: {
  state: RawCatalogState; review?: boolean; initialTask?: string;
}) {
  const { catalog, error, loading, revision: tick, refresh } = state;
  const [taskName, setTaskName] = useState(() => initialTask ||
    (typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("task") || ""));
  const [query, setQuery] = useState("");
  const tasks = catalog?.tasks.filter(row => `${row.name} ${reviewLabels[row.name] ?? ""}`.toLowerCase().includes(query.toLowerCase().trim())) ?? [];
  const task = tasks.find(row => row.name === taskName) ?? tasks[0];
  return <div className="reviewBoard rawReviewBoard">
    <section className="reviewHero"><div><div className="reviewEyebrow"><ClipboardCheck size={16}/>SIMULATION RAW · {review ? "HUMAN REVIEW" : "LIVE DATASET"}</div>
      <h2>{review ? "公盘数据质检" : "Simulation 原始数据"}</h2><p>Datasets 与 Review 共用当前公盘目录，按场景及子文件夹浏览全部样本，三路视频同步查看。每 30 秒检查目录变化，返回页面时也会刷新。
        目录中的 clean、ID、OOD、failure 是组织标签；存在文件不代表通过验收或已获得训练资格。</p>
      <span>数据源：Simulation raw · 实时目录</span></div>
      <div className="reviewStats"><div><strong>{catalog?.tasks.length ?? "—"}</strong><small>场景</small></div>
        <div><strong>{catalog?.count.toLocaleString() ?? "—"}</strong><small>样本目录（非去重轨迹数）</small></div></div></section>
    <div className="rawReviewRefresh"><span role="status">{error || (catalog ? `最近扫描：${new Date(catalog.scannedAt).toLocaleString()}` : "正在扫描公盘目录…")}</span>
      <button type="button" disabled={loading} onClick={refresh}><RefreshCw size={15}/>{loading ? "扫描中…" : "刷新"}</button></div>
    {error && <p className="reviewError" role="alert">{error}；目录统计为上次扫描结果，恢复后自动更新。</p>}<>
      <section className="reviewToolbar"><label><Search size={17}/><span className="curatedSrOnly">搜索场景</span><input type="search" placeholder="搜索场景…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <select aria-label="选择公盘场景" value={task?.name ?? ""} onChange={event => { setTaskName(event.target.value); link(event.target.value); }}>
          {tasks.map(row => <option key={row.id} value={row.name}>{reviewLabels[row.name] ?? row.name} · {row.count} 条</option>)}</select></section>
      {task ? <><div className="reviewTaskHeading"><div><span>场景</span><h3>{reviewLabels[task.name] ?? task.name}</h3><small>{task.name}</small></div><strong>{task.count}<small>条目录记录</small></strong></div>
        <Workspace key={task.id} task={task} tick={tick} review={review} unavailable={!!error}/></> : catalog && <p className="reviewLoading">没有匹配的场景。</p>}
    </>
    {!!catalog?.warnings.length && <details className="rawReviewWarnings"><summary>扫描提示（{catalog.warnings.length}）</summary><ul>{catalog.warnings.map(value => <li key={value}>{value}</li>)}</ul></details>}
    <p className="rawReviewFootnote">{review ? "人工评论按样本及元数据身份保存在当前浏览器，支持 JSON 导出；" : "目录数量是样本位置数，同一轨迹可能出现在不同目录；"}不会改写原始文件、机器裁决或正式数据集。</p>
  </div>;
}
