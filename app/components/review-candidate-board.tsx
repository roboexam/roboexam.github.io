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
import { useEffect, useRef, useState } from "react";
import { cameraLabels, secondsLabel } from "../data/curated-dataset";
import {
  reviewCandidates as dataset,
  type ReviewCamera,
  type ReviewMedia,
  type ReviewTask,
  type ReviewTaskChunk,
} from "../data/review-candidates";

function ReviewPlayer({
  media,
  title,
}: {
  media: ReviewMedia;
  title: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div className="curatedVideoStage">
        <video
          ref={video}
          src={media.url}
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={title}
          onLoadedMetadata={() => setReady(true)}
          onTimeUpdate={() => setTime(video.current?.currentTime ?? 0)}
          onError={() => setFailed(true)}
        >
          <track
            kind="captions"
            src="/no-spoken-audio.vtt"
            srcLang="zh"
            label="无语音"
          />
        </video>
        <span className="curatedCameraBadge">
          {cameraLabels[media.camera]}相机
        </span>
        {!ready && !failed && (
          <div className="curatedVideoOverlay">
            <LoaderCircle className="curatedSpin" size={24} />
            <span>加载严格合格原始视频…</span>
          </div>
        )}
        {failed && (
          <div className="curatedVideoOverlay" role="alert">
            <span>视频暂时无法读取</span>
            <button
              onClick={() => {
                setFailed(false);
                setReady(false);
                video.current?.load();
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>
      <div className="reviewTimeline">
        <span>
          {secondsLabel(time)} / {secondsLabel(media.duration)}
        </span>
        <span>
          {media.fps} fps · {media.frames.toLocaleString()} 帧
        </span>
      </div>
    </>
  );
}

function ReviewTaskWorkspace({ task }: { task: ReviewTask }) {
  const [chunk, setChunk] = useState<ReviewTaskChunk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<ReviewCamera>("cam_head");

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
        if (!controller.signal.aborted) setChunk(value);
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
  const media = episode.media.find((item) => item.camera === camera);
  function choose(next: number) {
    const value = chunk?.episodes[next];
    if (!value) return;
    setSelectedId(value.id);
    setCamera("cam_head");
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
              setSelectedId(event.target.value);
              setCamera("cam_head");
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
      {media && (
        <>
          <ReviewPlayer
            key={`${episode.id}-${camera}`}
            media={media}
            title={`${task.id} seed ${episode.seed} ${cameraLabels[camera]}相机`}
          />
          <div className="curatedCameras" role="group" aria-label="候选相机视角">
            {episode.media.map((item) => (
              <button
                key={item.camera}
                aria-pressed={camera === item.camera}
                onClick={() => setCamera(item.camera)}
              >
                {cameraLabels[item.camera]}相机
              </button>
            ))}
          </div>
        </>
      )}
      <div className="reviewEvidence">
        <span><ShieldCheck size={15} />严格选择通过</span>
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
          <dt>Final-count key SHA-256</dt>
          <dd>{episode.finalCountKeySha256}</dd>
          <dt>当前状态</dt><dd>等待人工三路视频审核，尚未正式入库</dd>
        </dl>
      </details>
    </section>
  );
}

export function ReviewCandidateBoard() {
  const [taskId, setTaskId] = useState(dataset.tasks[0]?.id ?? "");
  const [query, setQuery] = useState("");
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
            <ClipboardCheck size={16} /> STRICT-CLEAN REVIEW QUEUE
          </div>
          <h2>严格合格候选审核看板</h2>
          <p>
            每条候选已通过独立严格选择、去重、三路视频哈希校验和完整解码；
            当前仍需人工观看，不等同于正式 curated 入库。
          </p>
          <span><AlertTriangle size={15} />待人工审核 · 不计入正式 1,422 条</span>
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
          onChange={(event) => setTaskId(event.target.value)}
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
          看板只读展示冻结候选；人工接受决定和正式入库是后续独立事务。
        </p>
      </details>
    </div>
  );
}
