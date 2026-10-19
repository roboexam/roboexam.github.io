"use client";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SynchronizedCameraPlayer } from "./synchronized-camera-player";
import { ReviewNotes } from "./review-notes";
import { reviewCandidates as dataset, type ReviewTask, type ReviewTaskChunk } from "../data/review-candidates";
import { filterReviewEpisodes, reviewLabels, reviewRoleLabels } from "../data/review-filters";
const sceneLabel = (id: string) => reviewLabels[id] ? reviewLabels[id] + " · " + id : id;
const statusLabel = (v: boolean | null) => v === true ? "通过" : v === false ? "未通过，保留诊断" : "未建立资格";
function ReviewTaskWorkspace({ task }: { task: ReviewTask }) {
  const [chunk, setChunk] = useState<ReviewTaskChunk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batch, setBatch] = useState(""); const [role, setRole] = useState("");
  const [family, setFamily] = useState(""); const [machine, setMachine] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(task.dataUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("候选索引暂时无法读取");
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const actual = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2,"0")).join("");
        if (actual !== task.sha256) throw new Error("候选索引哈希校验失败");
        const value: ReviewTaskChunk = JSON.parse(new TextDecoder().decode(bytes));
        if (value.schemaVersion !== "unibench.review-candidate-task.v1" || value.snapshotId !== dataset.snapshotId ||
          value.taskId !== task.id || value.episodes.length !== task.count ||
          value.reviewStatus !== "pending_human_video_review" || value.admissionStatus !== "not_authorized_not_admitted")
          throw new Error("候选索引合同不一致");
        if (!controller.signal.aborted) {
          setChunk(value);
          const wanted = new URL(location.href).searchParams.get("episode");
          setSelectedId(value.episodes.some(row => row.id === wanted) ? wanted : null);
        }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败"); }
    }
    void load(); return () => controller.abort();
  }, [task,retry]);
  if (error) return <div className="reviewError" role="alert">{error}。<button onClick={() => {
    setError(null); setRetry(v => v + 1); }}>重新加载</button></div>;
  if (!chunk) return <div className="reviewLoading"><LoaderCircle className="curatedSpin"/>正在读取候选索引…</div>;
  if (!chunk.episodes.length) return <div className="reviewLoading">{task.id === "match_and_pick_from_conveyor"
    ? "此任务优先复用官方100条，官方来源与新增自采分账。本页尚无已发布的新增自采候选。"
    : "暂无满足发布条件的完整候选。在途任务、短诊断及缺少验收凭证的数据不会计为合格。"}</div>;
  const memberships = chunk.episodes.flatMap(row => row.memberships ?? []);
  const batches = [...new Set(memberships.map(m => m.batch))].sort();
  const families = [...new Set(memberships.map(m => m.family))].sort();
  const roles = [...new Set(memberships.map(m => m.role))].sort();
  const rows = filterReviewEpisodes(chunk.episodes, {batch,role,family,machine});
  const episode = rows.find(row => row.id === selectedId) ?? rows[0];
  const index = episode ? rows.indexOf(episode) : -1;
  function choose(next: number) {
    const value = rows[next]; if (!value) return; setSelectedId(value.id);
    const url = new URL(location.href); url.searchParams.set("task",task.id); url.searchParams.set("episode",value.id);
    history.replaceState(null,"",url);
  }
  return <section className="reviewWorkspace" aria-label={task.id + " 待审核候选"}>
    <div className="reviewFilters">
      <label>批次<select value={batch} onChange={e => setBatch(e.target.value)}><option value="">全部批次</option>
        {batches.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>来源<select value={role} onChange={e => setRole(e.target.value)}><option value="">全部来源</option>
        {roles.map(k => <option key={k} value={k}>{reviewRoleLabels[k]}</option>)}</select></label>
      <label>路线<select value={family} onChange={e => setFamily(e.target.value)}><option value="">全部路线</option>
        {families.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>机器验收<select value={machine} onChange={e => setMachine(e.target.value)}><option value="">全部状态</option>
        <option value="clean_selected">clean用途通过</option><option value="technical_pass_purpose_pending">工程闭环通过，用途待补</option></select></label>
    </div>
    {!episode ? <div className="reviewLoading">当前筛选下没有候选。</div> : <div className="reviewEpisode" key={episode.id + episode.manifestSha256}>
      <div className="reviewEpisodeControls"><label><span>选择候选 <small>{index + 1} / {rows.length}</small></span>
        <select value={episode.id} onChange={e => choose(rows.findIndex(row => row.id === e.target.value))}>
          {rows.map((row,i) => <option value={row.id} key={row.id}>{i + 1}. seed {row.seed} · {
            [...new Set((row.memberships ?? []).map(m => m.program).filter(Boolean))].join(" / ") || row.attempt}</option>)}</select></label>
        <div><button aria-label="上一条候选" disabled={index <= 0} onClick={() => choose(index - 1)}><ChevronLeft size={17}/></button>
          <button aria-label="下一条候选" disabled={index >= rows.length - 1} onClick={() => choose(index + 1)}><ChevronRight size={17}/></button></div></div>
      <div className="reviewMemberships">{(episode.memberships ?? []).map((m,i) => <span key={m.batch + m.role + i}>
        {reviewRoleLabels[m.role]} · {m.family}{m.program ? " · " + m.program : ""} · {m.batch}</span>)}</div>
      <p className="reviewInstruction">{episode.instruction}</p>
      <SynchronizedCameraPlayer key={episode.id + episode.manifestSha256} media={episode.media} title={task.id + " seed " + episode.seed}/>
      <div className="reviewEvidence">
        <span><ShieldCheck size={15}/>{episode.qualification.clean === true ? "clean用途验收通过" : "工程闭环通过，clean用途待补"}</span>
        <span>任务功能：{statusLabel(episode.qualification.functional)}</span>
        <span>强保真：{statusLabel(episode.qualification.strongFidelity)}</span>
        <span>正式时间：{episode.qualification.time.passed === true ? "通过" : episode.qualification.time.passed === false ? "未通过" : "资格待定"}</span>
        <span>seed {episode.seed}</span>
      </div>
      <details><summary>身份与验收凭证</summary><dl>
        <dt>候选身份</dt><dd>{episode.id}</dd><dt>原始episode身份</dt><dd>{episode.originalEpisodeId ?? episode.id}</dd>
        <dt>Attempt</dt><dd>{episode.attempt}</dd><dt>Manifest SHA-256</dt><dd>{episode.manifestSha256}</dd>
        <dt>验收凭证 SHA-256</dt><dd>{episode.selectionReportSha256}</dd><dt>候选身份键 SHA-256</dt><dd>{episode.finalCountKeySha256}</dd>
        <dt>用途合同</dt><dd>{episode.contractId}</dd><dt>采集源码</dt><dd>{episode.sourceCommit ?? "见原始验收凭证"}</dd>
        <dt>当前状态</dt><dd>待人工审核，候选未自动入库；原始PASS/REJECTED保留</dd>
      </dl></details>
      <ReviewNotes key={episode.id + episode.manifestSha256} episode={episode} taskId={task.id}/>
    </div>}
  </section>;
}
export function ReviewCandidateBoard() {
  const [taskId,setTaskId] = useState(dataset.tasks[0]?.id ?? ""); const [query,setQuery] = useState("");
  useEffect(() => { const frame = requestAnimationFrame(() => {
    const wanted = new URL(location.href).searchParams.get("task");
    if (dataset.tasks.some(row => row.id === wanted)) setTaskId(wanted ?? "");
  }); return () => cancelAnimationFrame(frame); },[]);
  const filtered = dataset.tasks.filter(task => sceneLabel(task.id).toLowerCase().includes(query.trim().toLowerCase()));
  const task = filtered.find(candidate => candidate.id === taskId) ?? filtered[0] ?? null;
  return <div className="reviewBoard"><section className="reviewHero"><div>
    <div className="reviewEyebrow"><ClipboardCheck size={16}/>原有17项＋新增7项 · HUMAN REVIEW</div><h2>数据质检：新增构造候选</h2>
    <p>按场景、采集批次、程序和来源查看三路原始视频。ID、语义 OOD、视觉 OOD 和恢复路线独立筛选；clean用途通过与工程闭环待用途验收分别标明；
      ID／OOD表示输入分布，clean表示用途验收状态，两者独立。功能、强保真、正式时间及人工审核独立记录。同一轨迹的重复验收不重复计数。</p>
    <span><AlertTriangle size={15}/>只读审核 · 原始结果保留 · 不自动入库</span>
  </div><div className="reviewStats">
    <div><strong>{dataset.tasks.length}</strong><small>任务范围</small></div>
    <div><strong>{dataset.candidateCount.toLocaleString()}</strong><small>去重候选</small></div>
    <div><strong>{dataset.cleanCandidateCount ?? dataset.candidateCount}</strong><small>clean用途通过</small></div>
    <div><strong>{dataset.technicalCandidateCount ?? 0}</strong><small>工程闭环待用途</small></div>
    <div><strong>{dataset.mediaCount.toLocaleString()}</strong><small>三路视频引用</small></div>
  </div></section>
  <section className="reviewToolbar"><label><Search size={17}/><span className="curatedSrOnly">搜索任务</span>
    <input type="search" placeholder="搜索任务…" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <select aria-label="选择待审核任务" value={task?.id ?? ""} onChange={e => {
      setTaskId(e.target.value); const url = new URL(location.href); url.searchParams.set("task",e.target.value);
      url.searchParams.delete("episode"); history.replaceState(null,"",url);
    }}>{filtered.map((row,i) => <option key={row.id} value={row.id}>{i + 1}. {sceneLabel(row.id)} · {row.count} 条</option>)}</select>
  </section>
  {task ? <><div className="reviewTaskHeading"><div><span>场景候选</span><h3>{sceneLabel(task.id)}</h3></div>
    <strong>{task.count}<small>条待审核</small></strong></div><ReviewTaskWorkspace key={dataset.snapshotId + task.id} task={task}/></>
    : <div className="reviewLoading">没有匹配的任务。</div>}
  <details className="reviewSource"><summary>快照与边界</summary><p>快照：<code>{dataset.snapshotId}</code></p>
    <p>候选清单 SHA-256：<code>{dataset.candidateInventorySha256}</code></p>
    <p>B09旧批备选100条按用户要求不在本次展示，原始数据与历史裁决保留。快照只包含完整凭证可核对的候选。空场景不代表任务失败；在途、短诊断和证据待补数据另存。
      人工意见保存在当前浏览器，可导出汇总，不改写机器裁决或正式数据集。</p></details>
  </div>;
}
