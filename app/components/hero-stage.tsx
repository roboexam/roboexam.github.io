"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { demoMediaUrl, heroWall } from "../data/home-demos";
import { HERO_TOUCH_EVENT, HeroHands3D } from "./hero-hands-3d";
import { TrackIcon } from "./podium";
import { tracks, type TrackId } from "../data/metric-plan";
import { STATIC_SITE } from "../static-site";

type Props = { onLeaderboards: (track?: TrackId) => void; onDatasets: () => void };

export function HeroStage({ onLeaderboards, onDatasets }: Props) {
  return <section className="heroStage" aria-labelledby="hero-title">
    <div className="heroField" aria-hidden="true">
      <HeroWall/>
      <RippleRing/>
      <img className="heroHand heroHandHuman" src="/brand/hand-human.webp" alt="" width={1536} height={500} decoding="async"/>
      <img className="heroHand heroHandRobot" src="/brand/hand-robot.webp" alt="" width={1536} height={500} decoding="async"/>
      <HeroHands3D/>
    </div>
    <div className="heroTitle">
      <p className="heroBadge"><span/><b className="fxShiny">{STATIC_SITE ? "Physical AI Benchmark" : "Planned CVPR 2027 Workshop"}</b></p>
      <h1 id="hero-title">RoboExam</h1>
      <p className="heroSubtitle"><span className="srOnly">The final exam for Physical AI</span><span aria-hidden="true"><span className="heroMuted">The final exam</span> for Physical AI</span></p>
    </div>
    <div className="heroFoot">
      <div className="heroIntro">
        <p className="eyebrow">Seven capabilities · four exams</p>
        <p>Evaluating VLM agents, world models and robot policies on one shared set of scenes — from reasoning to real-robot execution.</p>
        <div className="heroCtas">
          <button type="button" className="heroPrimary" onClick={() => onLeaderboards()}>Explore leaderboards <ArrowRight size={17}/></button>
          <button type="button" className="heroSecondary" onClick={onDatasets}>Datasets <ArrowUpRight size={16}/></button>
        </div>
      </div>
      <nav className="heroTracks" aria-label="Jump to a track">
        {tracks.map((track) => <button type="button" key={track.id} data-spotlight onClick={() => onLeaderboards(track.id)}>
          <b><TrackIcon track={track.id} size={30}/></b><span>{track.title}<small>{track.id}</small></span>
        </button>)}
      </nav>
    </div>
    <blockquote className="heroQuote">
      <p>{"“You just can't differentiate between a robot and the very best of humans.”"}</p>
      <cite>Isaac Asimov（艾萨克·阿西莫夫）· I, Robot（《我，机器人》）· 1950</cite>
    </blockquote>
  </section>;
}

/**
 * Four evaluation-video columns behind the hero, one per track, tinted from pale
 * (T1) to deep (T4). Each column is a single pre-rendered scrolling video; they
 * play only while the hero is on screen and stay on their posters under
 * prefers-reduced-motion.
 */
function HeroWall() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const videos = [...root.querySelectorAll("video")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videos.forEach((video) => video.pause());
      return;
    }
    let visible = false;
    const sync = () => videos.forEach((video) => visible ? void video.play().catch(() => undefined) : video.pause());
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.05 });
    observer.observe(root);
    // the first intersection can fire before the media is ready
    videos.forEach((video) => video.addEventListener("canplay", sync));
    return () => {
      observer.disconnect();
      videos.forEach((video) => video.removeEventListener("canplay", sync));
    };
  }, []);
  return <div className="heroWall" ref={ref}>
    {heroWall.columns.map((column) => <div key={column.track} className={`wallColumn wall-${column.track}`}>
      <video src={demoMediaUrl(column.video)} poster={demoMediaUrl(column.poster)} width={column.width} height={column.height}
        muted loop playsInline preload="auto"/>
      <span className="wallTint"/>
      <span className="wallLabel"><b>{column.track}</b>{column.label}</span>
    </div>)}
    <span className="wallVeil"/>
  </div>;
}

// Brand palette sampled from the RoboExam logo: indigo → violet → magenta → coral,
// with the amber flag and the robot's cyan eyes as highlights.
const RING_STOPS: [number, string][] = [
  [0, "rgba(74,86,192,1)"],
  [0.12, "rgba(118,80,180,0.92)"],
  [0.23, "rgba(236,228,255,0.3)"],
  [0.35, "rgba(169,75,156,0.95)"],
  [0.47, "rgba(224,125,115,1)"],
  [0.57, "rgba(240,162,74,0.9)"],
  [0.67, "rgba(255,243,226,0.28)"],
  [0.79, "rgba(83,223,228,0.85)"],
  [0.9, "rgba(96,116,226,0.95)"],
  [1, "rgba(74,86,192,1)"],
];

/**
 * A soft iridescent ring whose outline keeps undulating, with ripples that
 * travel outward. The pointer swells the wave locally; a click sends an extra
 * ripple. Static under prefers-reduced-motion and paused off-screen.
 */
function RippleRing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsFilter = typeof ctx.filter === "string";
    let width = 0;
    let dpr = 1;
    let frame = 0;
    let visible = true;
    const pointer = { x: 0, y: 0, strength: 0, target: 0 };
    const bursts: number[] = [];
    const start = performance.now();

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(width * dpr);
    }

    function gradient(cx: number, cy: number, rotation: number) {
      if (typeof ctx!.createConicGradient === "function") {
        const g = ctx!.createConicGradient(rotation, cx, cy);
        for (const [stop, color] of RING_STOPS) g.addColorStop(stop, color);
        return g;
      }
      const g = ctx!.createLinearGradient(0, 0, width * dpr, width * dpr);
      for (const [stop, color] of RING_STOPS) g.addColorStop(stop, color);
      return g;
    }

    function ringPath(cx: number, cy: number, radius: number, t: number, amp: number) {
      ctx!.beginPath();
      const steps = 180;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const px = Math.cos(theta);
        const py = Math.sin(theta);
        // local swell towards the pointer
        const near = pointer.strength * Math.max(0, px * pointer.x + py * pointer.y) ** 3;
        const wave = 0.022 * Math.sin(3 * theta + 1.1 * t) + 0.016 * Math.sin(5 * theta - 1.6 * t + 1.3)
          + 0.009 * Math.sin(9 * theta + 2.4 * t) + near * 0.05 * Math.sin(12 * theta - 4 * t);
        const r = radius * (1 + amp * wave);
        if (i === 0) ctx!.moveTo(cx + r * px, cy + r * py); else ctx!.lineTo(cx + r * px, cy + r * py);
      }
      ctx!.closePath();
    }

    function draw(now: number) {
      const t = (now - start) / 1000;
      const size = width * dpr;
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.32;
      pointer.strength += (pointer.target - pointer.strength) * 0.06;
      ctx!.clearRect(0, 0, size, size);

      const halo = ctx!.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.05);
      halo.addColorStop(0, "rgba(255,255,255,0.75)");
      halo.addColorStop(0.85, "rgba(255,255,255,0.35)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx!.fillStyle = halo;
      ctx!.beginPath(); ctx!.arc(cx, cy, radius * 1.05, 0, Math.PI * 2); ctx!.fill();

      const rotation = t * 0.12;
      const layers = [
        { blur: 34, line: 0.24, alpha: 0.75, amp: 1.25 },
        { blur: 12, line: 0.09, alpha: 0.95, amp: 1 },
        { blur: 2, line: 0.012, alpha: 0.7, amp: 0.9 },
      ];
      for (const layer of layers) {
        ctx!.save();
        // blur scales with the ring so small screens never clip the glow at the canvas edge
        if (supportsFilter) ctx!.filter = layer.blur ? `blur(${(layer.blur * size) / 700}px)` : "none";
        ctx!.globalAlpha = layer.alpha;
        ctx!.lineWidth = Math.max(1, radius * layer.line);
        ctx!.strokeStyle = gradient(cx, cy, rotation);
        ringPath(cx, cy, radius, t, layer.amp);
        ctx!.stroke();
        ctx!.restore();
      }

      // outward ripples: one every 3.6 s plus click bursts
      const waves = [((t % 3.6) / 3.6), (((t + 1.8) % 3.6) / 3.6), ...bursts.map((b) => (t - b) / 2.4)];
      for (const progress of waves) {
        if (progress < 0 || progress > 1) continue;
        ctx!.save();
        ctx!.globalAlpha = (1 - progress) ** 2 * 0.6;
        ctx!.lineWidth = Math.max(1, dpr * (1.6 - progress));
        ctx!.strokeStyle = gradient(cx, cy, rotation + progress);
        ringPath(cx, cy, radius * (1.04 + progress * 0.34), t + progress * 2, 0.8);
        ctx!.stroke();
        ctx!.restore();
      }
      while (bursts.length && t - bursts[0] > 2.4) bursts.shift();
    }

    function loop(now: number) {
      draw(now);
      if (visible) frame = requestAnimationFrame(loop);
    }

    function onMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      pointer.x = dx / dist;
      pointer.y = dy / dist;
      pointer.target = Math.max(0, 1 - dist / (rect.width * 0.75));
    }
    function onLeave() { pointer.target = 0; }
    function onClick(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      bursts.push((performance.now() - start) / 1000);
    }

    resize();
    const resizeObserver = new ResizeObserver(() => { resize(); if (reduce) draw(start); });
    resizeObserver.observe(canvas);
    if (reduce) {
      draw(start);
      return () => resizeObserver.disconnect();
    }
    const stage = canvas.closest(".heroStage") ?? window;
    const onTouch = () => bursts.push((performance.now() - start) / 1000);
    stage.addEventListener("pointermove", onMove as EventListener);
    stage.addEventListener("pointerleave", onLeave);
    stage.addEventListener("pointerdown", onClick as EventListener);
    window.addEventListener(HERO_TOUCH_EVENT, onTouch);
    const io = new IntersectionObserver(([entry]) => {
      const next = entry.isIntersecting;
      if (next && !visible) { visible = true; frame = requestAnimationFrame(loop); }
      if (!next) { visible = false; cancelAnimationFrame(frame); }
    });
    io.observe(canvas);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      resizeObserver.disconnect();
      stage.removeEventListener("pointermove", onMove as EventListener);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointerdown", onClick as EventListener);
      window.removeEventListener(HERO_TOUCH_EVENT, onTouch);
    };
  }, []);
  return <canvas ref={canvasRef} className="heroRipple"/>;
}
