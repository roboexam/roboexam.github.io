"use client";
import { useEffect, useState } from "react";
type ReviewIdentity = { id: string; manifestSha256: string; seed: number | null; reviewVersion?: string };

const PREFIX = "roboexam-human-review-v1:";
type Entry = { schemaVersion: string; episodeId: string; manifestSha256: string;
  task: string; seed: number | null; reviewer: string; decision: string; notes: string; updatedAt: string };
export function ReviewNotes({ episode, taskId }: { episode: ReviewIdentity; taskId: string }) {
  const key = PREFIX + episode.id + ":" + (episode.reviewVersion ?? episode.manifestSha256);
  const [reviewer, setReviewer] = useState("");
  const [decision, setDecision] = useState("pending");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setReviewer(""); setDecision("pending"); setNotes(""); setMessage("");
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const entry: Entry = JSON.parse(raw);
          if (entry.episodeId === episode.id && entry.manifestSha256 === episode.manifestSha256) {
            setReviewer(entry.reviewer); setDecision(entry.decision); setNotes(entry.notes);
          }
        }
      } catch { setMessage("无法读取本机质检记录。"); }
    });
    return () => cancelAnimationFrame(frame);
  }, [key, episode.id, episode.manifestSha256]);
  function save() {
    const entry: Entry = { schemaVersion:"roboexam.human-review.v1", episodeId:episode.id,
      manifestSha256:episode.manifestSha256, task:taskId, seed:episode.seed, reviewer, decision, notes, updatedAt:new Date().toISOString() };
    try { localStorage.setItem(key, JSON.stringify(entry)); setMessage("已保存到当前浏览器，可导出汇总。"); }
    catch { setMessage("本机保存失败，请先复制质检意见。"); }
  }
  function download() {
    try {
      const entries: Entry[] = [];
      for (let i=0; i<localStorage.length; i++) {
        const name = localStorage.key(i);
        if (name?.startsWith(PREFIX)) entries.push(JSON.parse(localStorage.getItem(name) ?? "{}"));
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion:"roboexam.human-review-export.v1",
        exportedAt:new Date().toISOString(), reviews:entries },null,2)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="roboexam-human-review.json";link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { setMessage("导出失败，请复制质检意见。"); }
  }
  return <section className="reviewNotes" aria-label="人工质检记录">
    <h3>人工质检记录</h3>
    <p>记录保存在当前浏览器，保存后可导出 JSON 汇总；其他人不会自动看到，不会改变原始验收或数据准入。</p>
    <div><label>质检人<input value={reviewer} onChange={e=>setReviewer(e.target.value)} maxLength={100}/></label>
      <label>人工结论<select value={decision} onChange={e=>setDecision(e.target.value)}>
        <option value="pending">待审核</option><option value="acceptable">人工查看可接受</option>
        <option value="issue">发现问题</option><option value="uncertain">需要复核</option>
      </select></label></div>
    <label>问题与时间点<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} maxLength={10000}
      placeholder="例如：头部视频 12.4 秒，抓持滑动；请注明视角和时间点。"/></label>
    <div><button type="button" onClick={save}>保存本条记录</button>
      <button type="button" onClick={download}>导出本机全部质检记录</button>
      <button type="button" onClick={()=>{
        const url=new URL(location.href);url.searchParams.set("task",taskId);url.searchParams.set("episode",episode.id);
        void navigator.clipboard.writeText(url.href).then(()=>setMessage("本条链接已复制。")).catch(()=>setMessage("复制失败，请复制地址栏。"));
      }}>复制本条链接</button></div>
    <span role="status">{message}</span>
  </section>;
}
