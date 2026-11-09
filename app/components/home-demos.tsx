"use client";

import { useEffect, useRef, useState } from "react";
import { demoMediaUrl, homeDemos, rigFor, taskFor, type DemoClip } from "../data/home-demos";
import { CountUp, RevealWords } from "./fx";

const number = new Intl.NumberFormat("en-US");

/** Plays a muted loop only while it is on screen. */
function useVisiblePlayback() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting && !reduce) {
          if (video.preload === "none") video.preload = "auto";
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      }
    }, { threshold: 0.35 });
    root.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function HomeDemos() {
  const { totals, featured, strip } = homeDemos;
  const [active, setActive] = useState(0);
  const clip = featured[active];
  const rig = rigFor(clip.rig);
  const containerRef = useVisiblePlayback();
  return <section className="homeDemos" aria-labelledby="home-demos-title">
    <div className="demoHeading">
      <div>
        <p className="eyebrow">Real-world data · collected on our rigs</p>
        <h2 id="home-demos-title"><RevealWords text="The exam scenes, on real robots."/></h2>
      </div>
      <p>{number.format(totals.episodes)} teleoperated episodes across {totals.datasets} task variants on {totals.rigs} dual-arm rigs, each recorded from a head camera and two wrist cameras.</p>
    </div>

    <div className="demoStage" ref={containerRef}>
      <div className="demoFeature">
        <div className="demoTabs" role="tablist" aria-label="Featured task">
          {featured.map((item, index) => <button type="button" role="tab" key={item.video.sha256} aria-selected={index === active}
            onClick={() => setActive(index)}>{taskFor(item.task)?.label ?? item.task}</button>)}
        </div>
        <figure className="demoPlayer" role="tabpanel">
          <video key={clip.video.sha256} src={demoMediaUrl(clip.video)} poster={demoMediaUrl(clip.poster)}
            width={clip.width} height={clip.height} muted loop playsInline autoPlay preload="metadata"
            aria-label={`${taskFor(clip.task)?.label}: head and both wrist cameras, ${clip.speed}× speed`}/>
          <span className="demoView demoViewHead">Head</span>
          <span className="demoView demoViewLeft">Left wrist</span>
          <span className="demoView demoViewRight">Right wrist</span>
          <span className="demoSpeed">{clip.speed}× speed</span>
        </figure>
        <div className="demoCaption">
          <div><strong>{taskFor(clip.task)?.label}</strong><span>{rig?.label} {rig?.unit} · variant ID{clip.variant} · episode {clip.episode}</span></div>
          <q>{clip.instruction}</q>
        </div>
      </div>

      <dl className="demoStats">
        <div data-spotlight><dt>Dual-arm rigs</dt><dd><CountUp value={totals.rigs}/></dd><small>{homeDemos.rigs.map((item) => `${item.label} ${item.unit}`).join(" · ")}</small></div>
        <div data-spotlight><dt>Task variants</dt><dd><CountUp value={totals.datasets}/></dd><small>{homeDemos.tasks.map((task) => `${task.label} ×${task.variants}`).join(" · ")}</small></div>
        <div data-spotlight><dt>Episodes</dt><dd><CountUp value={totals.episodes} duration={1700}/></dd><small>{number.format(totals.frames)} frames at {totals.fps.join("/")} fps</small></div>
        <div data-spotlight><dt>Cameras per frame</dt><dd><CountUp value={totals.cameras}/></dd><small>Head + left wrist + right wrist, 720p</small></div>
      </dl>

      <div className="demoStripHead">
        <strong>{strip.length} clips · head camera</strong>
        <span className="demoSoon"><i/>Policy rollouts on these rigs arrive next week</span>
      </div>
      <div className="demoStrip">
        <div className="demoTrack">
          {[...strip, ...strip].map((item, index) => <DemoCard key={`${item.video.sha256}:${index}`} clip={item} hidden={index >= strip.length}/>)}
        </div>
      </div>
    </div>
  </section>;
}

function DemoCard({ clip, hidden }: { clip: DemoClip; hidden: boolean }) {
  const rig = rigFor(clip.rig);
  const task = taskFor(clip.task);
  return <figure className="demoCard" aria-hidden={hidden || undefined}>
    <video src={demoMediaUrl(clip.video)} poster={demoMediaUrl(clip.poster)} width={clip.width} height={clip.height}
      muted loop playsInline preload="none" tabIndex={-1} aria-label={hidden ? undefined : `${task?.label} on ${rig?.label} ${rig?.unit}`}/>
    <span className="demoSpeed">{clip.speed}×</span>
    <figcaption><strong>{task?.label}</strong><span>{rig?.label} {rig?.unit} · ID{clip.variant}</span></figcaption>
  </figure>;
}
