"use client";

import { LoaderCircle, Maximize2, Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { cameraLabels, secondsLabel, type Camera } from "../data/curated-dataset";
import type { ActionTraceSource } from "../data/action-trace";
import { ActionTracePanel } from "./action-trace-panel";

type CameraMedia = { camera: Camera; url: string; duration: number; sha256?: string };
type Mark = { label: string; seconds: number };
type Props = { media: CameraMedia[]; title: string; marks?: Mark[]; traceId?: string; traceSource?: ActionTraceSource };
type Quality = "web-360p-v1" | "original";

const cameraOrder: Camera[] = ["cam_head", "cam_left_wrist", "cam_right_wrist"];
const compressedProfile: Quality = "web-360p-v1";
const renditionUrl = (sha256: string) =>
  `/api/video-renditions?source=${sha256}&profile=${compressedProfile}`;

export function SynchronizedCameraPlayer(props: Props) {
  const mediaKey = props.media.map((item) => item.sha256 ?? item.url).join("|");
  return <SynchronizedCameraPlayback key={mediaKey} {...props}/>;
}

function SynchronizedCameraPlayback({ media, title, marks = [], traceId, traceSource }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const videos = useRef<Partial<Record<Camera, HTMLVideoElement | null>>>({});
  const restoreTime = useRef(0);
  const [ready, setReady] = useState<Camera[]>([]);
  const [failed, setFailed] = useState<Camera[]>([]);
  const [time, setTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const views = cameraOrder.map((camera) => media.find((item) => item.camera === camera)).filter(Boolean) as CameraMedia[];
  const supportsCompressed = views.length > 0 && views.every((item) => /^[a-f0-9]{64}$/.test(item.sha256 ?? ""));
  const [quality, setQuality] = useState<Quality>(supportsCompressed ? compressedProfile : "original");
  const mediaKey = views.map((item) => item.sha256 ?? item.url).join("|");
  const master = views.find((item) => item.camera === "cam_head") ?? views[0];
  const duration = master?.duration || loadedDuration;
  const masterReady = master ? ready.includes(master.camera) && !failed.includes(master.camera) : false;

  function eachVideo(callback: (video: HTMLVideoElement, camera: Camera) => void) {
    for (const view of views) {
      const video = videos.current[view.camera];
      if (video && !failed.includes(view.camera)) callback(video, view.camera);
    }
  }
  function seek(value: number) {
    eachVideo((video) => { video.currentTime = Math.min(value, video.duration || value); });
    setTime(value);
  }
  async function togglePlayback() {
    if (playing) {
      eachVideo((video) => video.pause());
      setPlaying(false);
      return;
    }
    const current = videos.current[master?.camera ?? "cam_head"]?.currentTime ?? time;
    eachVideo((video) => {
      if (Math.abs(video.currentTime - current) > .05) video.currentTime = current;
    });
    const attempts: Promise<unknown>[] = [];
    eachVideo((video) => attempts.push(video.play()));
    await Promise.allSettled(attempts);
    setPlaying(Boolean(master && !videos.current[master.camera]?.paused));
  }
  function switchQuality(next: Quality) {
    if (next === quality) return;
    const current = videos.current[master?.camera ?? "cam_head"]?.currentTime ?? time;
    eachVideo((video) => video.pause());
    restoreTime.current = current;
    setTime(current);
    setPlaying(false);
    setReady([]);
    setFailed([]);
    setQuality(next);
  }
  function updateFromMaster(camera: Camera) {
    if (camera !== master?.camera) return;
    const current = videos.current[camera]?.currentTime ?? 0;
    setTime(current);
    if (playing) eachVideo((video, otherCamera) => {
      if (otherCamera !== camera && Math.abs(video.currentTime - current) > .12) video.currentTime = current;
    });
  }

  return <div className={`syncPlayer${traceId ? " syncPlayerWithTrace" : ""}`}>
    <div className="syncMediaPanel">
      <div className="syncStage" ref={stage}>
        {views.map((view) => <figure className={`syncView syncView-${view.camera}`} key={view.camera}>
          <figcaption>{cameraLabels[view.camera]}</figcaption>
          <video key={`${mediaKey}:${view.camera}:${quality}`} ref={(node) => { videos.current[view.camera] = node; }}
            src={quality === compressedProfile && view.sha256 ? renditionUrl(view.sha256) : view.url}
            muted playsInline preload="metadata"
            aria-label={`${title} ${cameraLabels[view.camera]} camera`}
            onLoadedMetadata={() => {
              const video = videos.current[view.camera];
              if (video && view.camera === master?.camera && Number.isFinite(video.duration)) setLoadedDuration(video.duration);
              if (video && restoreTime.current > 0) {
                video.currentTime = Math.min(restoreTime.current, video.duration || restoreTime.current);
              }
              setReady((current) => current.includes(view.camera) ? current : [...current, view.camera]);
            }}
            onTimeUpdate={() => updateFromMaster(view.camera)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              if (quality === compressedProfile) {
                switchQuality("original");
                return;
              }
              setFailed((current) => current.includes(view.camera) ? current : [...current, view.camera]);
            }}>
            <track kind="captions" src="/no-spoken-audio.vtt" srcLang="en" label="No spoken audio"/>
          </video>
          {!ready.includes(view.camera) && !failed.includes(view.camera) && <span className="syncViewStatus"><LoaderCircle className="curatedSpin" size={18}/>Loading…</span>}
          {failed.includes(view.camera) && <span className="syncViewStatus error">Unavailable <button type="button" onClick={() => {
            setFailed((current) => current.filter((camera) => camera !== view.camera));
            setReady((current) => current.filter((camera) => camera !== view.camera));
            videos.current[view.camera]?.load();
          }}>Retry</button></span>}
        </figure>)}
      </div>
      <div className="syncControls">
        <button type="button" className="syncPlay" disabled={!masterReady} onClick={() => { void togglePlayback(); }}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
        <input type="range" aria-label={`${title} synchronized playback progress`} min={0} max={duration || 0}
          step={.02} value={Math.min(time, duration || 0)} disabled={!masterReady} onChange={(event) => seek(Number(event.target.value))}/>
        <span>{secondsLabel(time)} <em>/ {secondsLabel(duration)}</em></span>
        <label className="syncQuality"><span>Resolution</span><select aria-label={`${title} video resolution`}
          value={quality} onChange={(event) => switchQuality(event.target.value as Quality)}>
          {supportsCompressed && <option value={compressedProfile}>360p · Faster</option>}
          <option value="original">480p · Original</option>
        </select></label>
        <button type="button" aria-label={`${title} full screen`} onClick={() => { void stage.current?.requestFullscreen?.().catch(() => {}); }}><Maximize2 size={16}/></button>
      </div>
      {marks.length > 0 && <div className="curatedMarks">{marks.map((mark) =>
        <button type="button" key={`${mark.label}-${mark.seconds}`} disabled={!masterReady} onClick={() => seek(mark.seconds)}>
          {mark.label} <span>{secondsLabel(mark.seconds)}</span>
        </button>)}
        <small>All three cameras and published traces share the video PTS clock; video time is not the simulator clock.</small>
      </div>}
    </div>
    {traceId && <ActionTracePanel episodeId={traceId} currentTime={time} source={traceSource}/>}
  </div>;
}
