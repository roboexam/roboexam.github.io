"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SynchronizedCameraPlayer } from "./synchronized-camera-player";
import { ReviewNotes } from "./review-notes";
import {
  reviewCandidates as dataset,
  type ReviewTask,
  type ReviewTaskChunk,
} from "../data/review-candidates";

function ReviewTaskWorkspace({ task }: { task: ReviewTask }) {
  const [chunk, setChunk] = useState<ReviewTaskChunk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(task.dataUrl, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("候选索引暂时无法读取");
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const actual = Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        if (actual !== task.sha256) throw new Error("候选索引哈希校验失败");
        const value: ReviewTaskChunk = JSON.parse(
          new TextDecoder().decode(bytes),
        );
        if (
          value.schemaVersion !== "unibench.review-candidate-task.v1" ||
          value.snapshotId !== dataset.snapshotId ||
          value.taskId !== task.id ||
          value.episodes.length !== task.count ||
          value.reviewStatus !== "pending_human_video_review" ||
          value.admissionStatus !== "not_authorized_not_admitted"
        ) {
          throw new Error("候选索引合同不一致");
        }
        if (!controller.signal.aborted) {
          setChunk(value);
          const wanted = new URL(location.href).searchParams.get("episode");
          setSelectedId(value.episodes.some(row => row.id === wanted) ? wanted : null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [task, retry]);

  if (error) {
    return (
      <div className="reviewError" role="alert">
        {error}。
        <button onClick={() => {
          setError(null);
          setRetry((value) => value + 1);
        }}>重新加载</button>
      </div>
    );
  }
  if (!chunk) {
    return (
      <div className="reviewLoading">
        <LoaderCircle className="curatedSpin" />
        正在读取候选索引…
      </div>
    );
  }

  const episode =
    chunk.episodes.find((row) => row.id === selectedId) ?? chunk.episodes[0];
  const index = chunk.episodes.indexOf(episode);
  function choose(next: number) {
    const value = chunk?.episodes[next];
    if (!value) return;
    setSelectedId(value.id);
    const url = new URL(location.href); url.searchParams.set("task", task.id);
    url.searchParams.set("episode", value.id); history.replaceState(null, "", url);
  }

  return (
    <section className="reviewWorkspace" aria-label={`${task.id} 待审核候选`}>
      <div className="reviewEpisodeControls">
        <label>
          <span>
            选择候选 <small>{index + 1} / {chunk.episodes.length}</small>
          </span>
          <select
            value={episode.id}
            onChange={(event) => {
              choose(chunk.episodes.findIndex(row => row.id === event.target.value));
            }}
          >
            {chunk.episodes.map((row, position) => (
              <option value={row.id} key={row.id}>
                {position + 1}. seed {row.seed} · {row.attempt}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            aria-label="上一条候选"
            disabled={index <= 0}
            onClick={() => choose(index - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            aria-label="下一条候选"
            disabled={index >= chunk.episodes.length - 1}
            onClick={() => choose(index + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <p className="reviewInstruction">{episode.instruction}</p>
      <SynchronizedCameraPlayer key={episode.id} media={episode.media} title={task.id + " seed " + episode.seed}/>
      <div className="reviewEvidence">
        <span><ShieldCheck size={15} />clean 用途验收通过</span>
        <span>任务功能：{episode.qualification.functional ? "通过" : "未通过"}</span>
        <span>强保真：{episode.qualification.strongFidelity ? "通过" : "未通过，保留诊断"}</span>
        <span>正式时间：{episode.qualification.time.passed === true ? "通过" : episode.qualification.time.passed === false ? "未通过" : "预算待定"}</span>
        <span>seed {episode.seed}</span>
        <span>{episode.id}</span>
      </div>
      <details>
        <summary>证据哈希</summary>
        <dl>
          <dt>Attempt</dt><dd>{episode.attempt}</dd>
          <dt>Manifest SHA-256</dt><dd>{episode.manifestSha256}</dd>
          <dt>Selection report SHA-256</dt>
          <dd>{episode.selectionReportSha256}</dd>
          <dt>质检身份键 SHA-256（episode＋manifest）</dt>
          <dd>{episode.finalCountKeySha256}</dd>
          <dt>clean 合同</dt><dd>{episode.contractId}</dd>
          <dt>采集源码</dt><dd>{episode.sourceCommit ?? "见原始验收凭证"}</dd>
          <dt>当前状态</dt><dd>等待人工三路视频审核，尚未正式入库</dd>
        </dl>
      </details>
      <ReviewNotes key={episode.id + episode.manifestSha256} episode={episode} taskId={task.id}/>
    </section>
  );
}

export function ReviewCandidateBoard() {
  const [taskId, setTaskId] = useState(dataset.tasks[0]?.id ?? "");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const wanted = new URL(location.href).searchParams.get("task");
      if (dataset.tasks.some(row => row.id === wanted)) setTaskId(wanted ?? "");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const filtered = dataset.tasks.filter((task) =>
    task.id.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const task =
    filtered.find((candidate) => candidate.id === taskId) ?? filtered[0] ?? null;

  return (
    <div className="reviewBoard">
      <section className="reviewHero">
        <div>
          <div className="reviewEyebrow">
            <ClipboardCheck size={16} /> ID CLEAN · HUMAN REVIEW
          </div>
          <h2>数据质检：已验收 clean 候选</h2>
          <p>
            本轮 400 条 ID clean 采集的已完成部分：每条已通过独立验收及 clean selector。
            三路原始视频同步播放；任务功能、强保真和正式时间资格分别展示。
          </p>
          <span><AlertTriangle size={15} />待人工质检 · 保留在 staging，尚未正式入库</span>
        </div>
        <div className="reviewStats">
          <div><strong>{dataset.tasks.length}</strong><small>任务</small></div>
          <div>
            <strong>{dataset.candidateCount.toLocaleString()}</strong>
            <small>候选</small>
          </div>
          <div>
            <strong>{dataset.mediaCount.toLocaleString()}</strong>
            <small>视频</small>
          </div>
        </div>
      </section>
      <section className="reviewToolbar">
        <label>
          <Search size={17} />
          <span className="curatedSrOnly">搜索任务</span>
          <input
            type="search"
            placeholder="搜索任务…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="选择待审核任务"
          value={task?.id ?? ""}
          onChange={(event) => {
            setTaskId(event.target.value);
            const url = new URL(location.href); url.searchParams.set("task", event.target.value);
            url.searchParams.delete("episode"); history.replaceState(null, "", url);
          }}
        >
          {filtered.map((row, index) => (
            <option key={row.id} value={row.id}>
              {index + 1}. {row.id} · {row.count} 条
            </option>
          ))}
        </select>
      </section>
      {task ? (
        <>
          <div className="reviewTaskHeading">
            <div><span>当前任务</span><h3>{task.id}</h3></div>
            <strong>{task.count}<small>条待审核</small></strong>
          </div>
          <ReviewTaskWorkspace key={task.id} task={task} />
        </>
      ) : (
        <div className="reviewLoading">没有匹配的任务。</div>
      )}
      <details className="reviewSource">
        <summary>快照与边界</summary>
        <p>快照：<code>{dataset.snapshotId}</code></p>
        <p>候选清单 SHA-256：<code>{dataset.candidateInventorySha256}</code></p>
        <p>
          看板只读展示冻结候选；本机质检记录可导出汇总。人工意见不改写原始 PASS/REJECTED，正式入库另行审核。
        </p>
      </details>
    </div>
  );
}
