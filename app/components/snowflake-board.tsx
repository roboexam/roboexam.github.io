"use client";

import { Maximize2, Minimize2, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildMainBoard } from "../data/main-board";
import type { TrackId } from "../data/metric-plan";
import { CountUp, RevealWords } from "./fx";
import { CapabilityIcon, Medal, MethodLogo, TrackIcon } from "./podium";
import { SnowCrystal3D, type CrystalHover, type Projector } from "./snow-crystal-3d";
import {
  add, buildOverall, buildSnowflake, climbHeight, climbPoint, coinRadius, COLUMN, COLUMN_COIN, columnHeight, CONTOURS, contourRadius, forkPoint, PEAK, polar,
  prongPoint, ridgeHeight, routePoint, SNOW_FORK, SNOW_PLATE, SNOW_SCALE, spotKey, streamX, type Climber, type SnowArm, type SnowProng, type Vec,
} from "../data/snowflake";

const W = 1600;
const H = 1000;
const FOCUS_ANGLE = 90; // close-up: the arm hangs from the top edge; its fork is the summit and the routes fan down from it
const TRACK_COLORS: Record<TrackId, string> = { T1: "#4a56c0", T2: "#7650b4", T3: "#a94b9c", T4: "#e07d73" };
const MOVE_MS = 900;

type Camera = { rot: number; f: Vec; s: number };
type Hover = { arm: SnowArm; prong: SnowProng; climber: Climber } | null;
/** Overlay position of a snowflake point at height z (the 2D fallback ignores height). */
type Screen = (point: Vec, z?: number) => Vec;

function cameraFor(arm: SnowArm, full: boolean, previousRot: number): Camera {
  let rot = FOCUS_ANGLE - arm.angle;
  while (rot - previousRot > 180) rot -= 360;
  while (rot - previousRot < -180) rot += 360;
  return full ? { rot, f: { x: 0, y: 0 }, s: 0.37 } : { rot, f: polar(SNOW_FORK + 195, arm.angle), s: 1.6 };
}

function project(point: Vec, camera: Camera): Vec {
  const r = (camera.rot * Math.PI) / 180;
  const dx = point.x - camera.f.x;
  const dy = point.y - camera.f.y;
  return { x: W / 2 + camera.s * (Math.cos(r) * dx - Math.sin(r) * dy), y: H / 2 + camera.s * (Math.sin(r) * dx + Math.cos(r) * dy) };
}
/** Without WebGL the centre column is drawn flat: x across, height up. */
const flatColumn = (point: Vec) => ({ x: W / 2 + point.x * 0.62, y: H * 0.9 - point.y * 0.7 });

// Overlay coordinates are rounded: server and browser trig can differ in the last digit, which breaks hydration
const round = (value: number) => Math.round(value * 100) / 100;
const pct = (point: Vec) => ({ left: `${round((point.x / W) * 100)}%`, top: `${round((point.y / H) * 100)}%` });
const fmt = (value: number | null) => (value === null ? "—" : value.toFixed(1));
const line = (a: Vec, b: Vec) => ({ x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y) });
const hexagon = (r: number, rotation = -90, center: Vec = { x: 0, y: 0 }) =>
  Array.from({ length: 6 }, (_, i) => add(center, polar(r, rotation + 60 * i))).map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
const shortLabel = (label: string) => label.replace(/\s*\((xhigh|high)\)$/i, "");
const track = (id: TrackId) => ({ ["--track" as string]: TRACK_COLORS[id] });

export function SnowflakeBoard({ onBreakdown }: { onBreakdown: (track: TrackId) => void }) {
  const { arms, overall } = useMemo(() => {
    const board = buildMainBoard();
    return { arms: buildSnowflake(board), overall: buildOverall(board) };
  }, []);
  const CENTRE = arms.length; // focus index of the centre column
  const [focus, setFocus] = useState(0);
  const [full, setFull] = useState(false);
  const [camera, setCamera] = useState<Camera>(() => cameraFor(arms[0], false, 0));
  const [moving, setMoving] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const canvas = useRef<HTMLDivElement>(null);
  const [pixels, setPixels] = useState({ w: 1180, h: 737.5 }); // rendered canvas size, for label sizing
  const [crystal, setCrystal] = useState(false); // 3D crystal took over from the 2D drawing
  const [projector, setProjector] = useState<Projector | null>(null);
  const centre = focus === CENTRE;
  const current = centre ? overall : arms[focus];
  const compact = pixels.w < 640;

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setPixels({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // shareable deep link to the whole crystal
  useEffect(() => {
    const apply = () => {
      if (window.location.hash !== "#snowflake-whole") return;
      setFull(true);
      setCamera((previous) => cameraFor(arms[0], true, previous.rot));
    };
    const frame = requestAnimationFrame(apply);
    window.addEventListener("hashchange", apply);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", apply); };
  }, [arms]);

  function move(nextFocus: number, nextFull: boolean) {
    const index = nextFocus === CENTRE ? CENTRE : (nextFocus + arms.length) % arms.length;
    setFocus(index);
    setFull(nextFull);
    setHover(null);
    // the 2D fallback shows the column over the whole snowflake
    setCamera((previous) => cameraFor(arms[index === CENTRE ? 0 : index], nextFull || index === CENTRE, previous.rot));
    setMoving(true);
    clearTimeout(timer.current);
    // the crystal reports when its camera settles; the 2D fallback uses a fixed duration
    if (!crystal) timer.current = setTimeout(() => setMoving(false), MOVE_MS);
  }
  const rotate = (step: number) => move(centre ? (step > 0 ? 0 : arms.length - 1) : focus + step, full);
  const neighbour = (step: number) => arms[centre ? (step > 0 ? 0 : arms.length - 1) : (focus + step + arms.length) % arms.length];

  const toScreen = useMemo<Screen>(() => (crystal && projector ? projector.plane : (point) => project(point, camera)), [crystal, projector, camera]);
  const toColumn = useMemo<Projector["column"]>(() => (crystal && projector ? projector.column : flatColumn), [crystal, projector]);
  const crystalHover = (value: CrystalHover) => {
    const arm = value ? (value.arm === CENTRE ? overall : arms[value.arm]) : null;
    setHover(arm && value ? { arm, prong: arm.prongs[value.prong], climber: arm.prongs[value.prong].climbers[value.climber] } : null);
  };
  const hoverAt = (item: NonNullable<Hover>) => {
    const key = spotKey(item.prong, item.climber);
    if (item.arm === overall) return toColumn(item.arm.spots.get(key)!);
    // from above the arms lie flat; in a close-up the open arm is a raised peak
    return full ? toScreen(item.arm.spots.get(key)!) : toScreen(item.arm.peakSpots.get(key)!, climbHeight(item.climber.t));
  };

  const layout = useMemo(() => (centre ? layoutColumn(overall, toColumn, pixels) : layoutArm(arms[focus], toScreen, pixels)),
    [centre, overall, arms, focus, toColumn, toScreen, pixels]);
  const tips = useMemo(() => layoutTips(arms, toScreen, pixels), [arms, toScreen, pixels]);
  const transform = `translate(${W / 2}px, ${H / 2}px) scale(${camera.s}) rotate(${camera.rot}deg) translate(${-camera.f.x}px, ${-camera.f.y}px)`;
  const settling = moving || (crystal && !projector); // labels wait for the first settled frame

  return <section className="snowBoard" aria-labelledby="snow-title">
    <div className="snowHeading">
      <div>
        <p className="eyebrow">The RoboExam snowflake</p>
        <h2 id="snow-title"><RevealWords text="Six capabilities. Four tracks. One crystal."/></h2>
      </div>
      <p>Each arm of the crystal is a capability and ends in a four-pronged fork — one route per track, all meeting at the capability&apos;s flagged summit. Every method climbs its track&apos;s route; contour rings mark equal scores on one 0–100 scale, so the higher it stands, the higher its score. The centre gathers each method&apos;s mean over all six capabilities. Ranks compare methods within a track only.</p>
    </div>

    <div className="snowStage">
      <div className="snowMain">
        <div ref={canvas} className={`snowCanvas ${full ? "isFull" : centre ? "isCentre" : "isFocus"} ${settling ? "isMoving" : ""} ${crystal ? "crystal3d" : ""}`}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Capability snowflake, ${full ? "whole view" : centre ? "overall column" : `close-up of ${current.label}`}`}>
            <g className="snowWorld" style={{ transform }}>
              <Plate/>
              {arms.map((item, index) => <line key={item.tag} className="snowHit" {...line({ x: 0, y: 0 }, forkPoint(item))}
                onClick={() => (index !== focus || full ? move(index, false) : undefined)}/>)}
              {arms.map((item, index) => <Arm key={item.tag} arm={item} focused={index === focus} onHover={setHover}/>)}
            </g>
          </svg>
          <SnowCrystal3D arms={arms} overall={overall} focus={focus} full={full} onReady={() => setCrystal(true)}
            onSettle={(next) => { setProjector(() => next); setMoving(false); }} onHover={crystalHover} onPickArm={(index) => move(index, false)}/>

          <div className="snowLabels" aria-hidden="true">
            {full ? <>
              {arms.map((item, index) => <button type="button" tabIndex={-1} key={item.tag} className={`snowTipLabel ${index === focus ? "active" : ""}`}
                style={pct(tips[index])} onClick={() => move(index, false)}>
                <i><CapabilityIcon tag={item.tag} size={compact ? 24 : 34}/></i>
                {!compact && <span><strong>{item.label}</strong><small>{item.scenes} scenes</small>
                  <span className="snowTipBars">{item.prongs.map((prong) => <em key={prong.track} title={prong.track}
                    style={{ ...track(prong.track), ["--reach" as string]: `${round(prong.best === null ? 0 : Math.min(1, prong.best / SNOW_SCALE) * 100)}%` }}/>)}</span>
                </span>}
              </button>)}
              <button type="button" tabIndex={-1} className={`snowCentreLabel ${centre ? "active" : ""}`} style={pct(toScreen({ x: 0, y: 0 }))} onClick={() => move(CENTRE, false)}>
                <i><CapabilityIcon tag="ALL" size={compact ? 22 : 28}/></i>{!compact && <span><strong>Overall</strong><small>mean of 6 capabilities</small></span>}
              </button>
            </> : <>
              <svg className="snowLeaders" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                {layout.callouts.map((item) => <polyline key={item.key} style={track(item.prong.track)}
                  points={[item.start, item.elbow, item.end].map((p) => `${round(p.x)},${round(p.y)}`).join(" ")}/>)}
              </svg>
              {layout.contours.map(({ level, at }) => <span key={level} className={`snowContourLabel ${level === SNOW_SCALE ? "summit" : ""}`} style={pct(at)}>
                {level === SNOW_SCALE ? "100 · summit" : level}
              </span>)}
              {layout.routes.map(({ prong, at }) => <span key={prong.track} className={`snowRouteChip ${prong.pending ? "pending" : ""}`}
                style={{ ...pct(at), ...track(prong.track) }}><TrackIcon track={prong.track} size={compact ? 22 : 30}/><b>{prong.track}</b></span>)}
              {layout.callouts.map(({ key, prong, climber, anchor, left }) => <span key={key} className={`snowClimberLabel ${left ? "toLeft" : ""} ${climber.rank === 1 ? "lead" : ""}`}
                style={{ ...pct(anchor), ...track(prong.track) }}>
                <i>{prong.track}</i>{shortLabel(climber.label)}<em>{fmt(climber.value)}</em>
              </span>)}
            </>}
            {hover && <div className="snowTooltip" style={{ ...pct(hoverAt(hover)), ...track(hover.prong.track) }}>
              <div className="snowTooltipHead"><MethodLogo label={hover.climber.label} size={28}/><strong>{hover.climber.label}</strong><Medal rank={hover.climber.rank} size={18}/></div>
              <span>{hover.prong.track} · {hover.prong.title} · {hover.arm.label}</span>
              <b>{fmt(hover.climber.value)} <small>{hover.prong.metric}{hover.arm === overall ? " · mean of 6 capabilities" : ""} · rank {hover.climber.rank} of {hover.prong.climbers.length}</small></b>
            </div>}
          </div>

          {!full && !compact && <div className="snowRouteLegend">
            {current.prongs.map((prong) => <span key={prong.track} className={prong.pending ? "pending" : ""} style={track(prong.track)}>
              <TrackIcon track={prong.track} size={20}/><b>{prong.track}</b>{prong.title}
            </span>)}
          </div>}
          {!full && <div className="snowTitle"><i><CapabilityIcon tag={current.tag} size={compact ? 27 : 38}/></i>
            <div><strong>{current.label}</strong><small>{centre ? "mean of the six capabilities · per track" : `${current.scenes} shared scenes · close-up`}</small></div>
          </div>}
          <button type="button" className="snowZoom" onClick={() => move(focus, !full)} aria-pressed={full}>
            {full ? <><Minimize2 size={15}/>{centre ? "Overall" : "Close-up"}</> : <><Maximize2 size={15}/>Whole snowflake</>}
          </button>
          <button type="button" className="snowRotate snowRotateLeft" onClick={() => rotate(-1)} aria-label={`Rotate to ${neighbour(-1).label}`}><RotateCcw size={20}/></button>
          <button type="button" className="snowRotate snowRotateRight" onClick={() => rotate(1)} aria-label={`Rotate to ${neighbour(1).label}`}><RotateCw size={20}/></button>
        </div>

        <div className="snowArms" role="group" aria-label="Capability">
          <button type="button" className="overall" data-spotlight aria-pressed={centre && !full} onClick={() => move(CENTRE, false)}>
            <i><CapabilityIcon tag="ALL" size={compact ? 24 : 29}/></i>
            <span>Overall<small>mean of 6</small></span>
          </button>
          {arms.map((item, index) => <button type="button" key={item.tag} data-spotlight aria-pressed={index === focus && !full} onClick={() => move(index, false)}>
            <i><CapabilityIcon tag={item.tag} size={compact ? 24 : 29}/></i>
            <span>{item.label}<small>{item.scenes} scenes</small></span>
          </button>)}
        </div>
      </div>

      <aside className="snowPanel" aria-live="polite">
        <div className="snowPanelHead">
          <i><CapabilityIcon tag={current.tag} size={36}/></i>
          <div><strong>{current.label}</strong><small>{centre ? current.rule : `${current.scenes} shared scenes · ${current.rule}`}</small></div>
        </div>
        <ol className="snowPanelLevels">
          {current.prongs.map((prong) => <li key={prong.track} data-spotlight style={track(prong.track)}>
            <div className="snowPanelTrack"><TrackIcon track={prong.track} size={26}/><b>{prong.track}</b><span>{prong.title}</span><small>{prong.metric}</small></div>
            {prong.climbers.length ? <ol className="snowPanelClimbers">
              {prong.climbers.slice(0, 3).map((climber) => <li key={climber.id} style={{ ["--reach" as string]: `${round(Math.min(1, climber.value / SNOW_SCALE) * 100)}%` }}>
                <Medal rank={climber.rank}/>
                <MethodLogo label={climber.label}/>
                <span>{shortLabel(climber.label)}</span>
                <em><CountUp value={climber.value} decimals={1} duration={900}/></em>
              </li>)}
            </ol> : <p>{prong.pending}</p>}
            {prong.climbers.length > 0 && <button type="button" onClick={() => onBreakdown(prong.track)}>
              {prong.climbers.length > 3 ? `+${prong.climbers.length - 3} more · ` : ""}All {prong.track} results
            </button>}
          </li>)}
        </ol>
      </aside>
    </div>
  </section>;
}

function Plate() {
  return <g className="snowPlate">
    <polygon className="snowPlateFace" points={hexagon(SNOW_PLATE)}/>
    <polygon className="snowPlateRing" points={hexagon(SNOW_PLATE * 0.64)}/>
    <polygon className="snowPlateRing" points={hexagon(SNOW_PLATE * 0.3)}/>
  </g>;
}

function Arm({ arm, focused, onHover }: { arm: SnowArm; focused: boolean; onHover: (hover: Hover) => void }) {
  const fork = forkPoint(arm);
  return <g className={`snowArm ${focused ? "focused" : ""}`}>
    <line className="snowTrunkInner" {...line({ x: 0, y: 0 }, polar(SNOW_PLATE, arm.angle))}/>
    <line className="snowTrunk" {...line(polar(SNOW_PLATE, arm.angle), fork)}/>
    {/* side twigs on the trunk outside the plate */}
    {[{ r: 500, len: 70 }, { r: 600, len: 54 }, { r: 690, len: 36 }].flatMap(({ r, len }) =>
      [1, -1].map((side) => <line key={`${r}:${side}`} className="snowTwig" {...line(polar(r, arm.angle), add(polar(r, arm.angle), polar(len, arm.angle + side * 60)))}/>))}
    <circle className="snowForkNode" cx={round(fork.x)} cy={round(fork.y)} r={9}/>
    {arm.prongs.map((prong) => <Prong key={prong.track} arm={arm} prong={prong} onHover={onHover}/>)}
  </g>;
}

function Prong({ arm, prong, onHover }: { arm: SnowArm; prong: SnowProng; onHover: (hover: Hover) => void }) {
  const fork = forkPoint(arm);
  const end = prongPoint(arm, prong, 1);
  const reach = prong.best === null ? 0 : Math.max(0, Math.min(1, prong.best / SNOW_SCALE));
  const direction = arm.angle + prong.offset;
  return <g className={`snowProng ${prong.pending ? "pending" : ""}`} style={track(prong.track)}>
    <line className="snowGuide" {...line(fork, end)}/>
    {[0.5, 0.78].map((t) => {
      const base = prongPoint(arm, prong, t);
      return [1, -1].map((side) => <line key={`${t}:${side}`} className="snowSub" {...line(base, add(base, polar(t === 0.5 ? 44 : 28, direction + side * 60)))}/>);
    })}
    <line className="snowCap" {...line(add(end, polar(14, direction + 90)), add(end, polar(14, direction - 90)))}/>
    {reach > 0 && <line className="snowFill" pathLength={1} {...line(end, climbPoint(arm, prong, reach))}/>}
    {prong.climbers.map((climber) => {
      const at = arm.spots.get(spotKey(prong, climber))!;
      return <g key={climber.id} className={`snowClimber ${climber.rank === 1 ? "lead" : ""}`}
        onMouseEnter={() => onHover({ arm, prong, climber })} onMouseLeave={() => onHover(null)}>
        {climber.rank === 1 && <circle className="snowHalo" cx={round(at.x)} cy={round(at.y)} r={19}/>}
        <circle cx={round(at.x)} cy={round(at.y)} r={climber.rank === 1 ? 11 : 8}/>
      </g>;
    })}
  </g>;
}

type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
type CalloutInput = { prong: SnowProng; climber: Climber; bead: Vec; rim: number; left: boolean };
type Units = { ux: number; uy: number; compact: boolean };

function units(pixels: { w: number; h: number }): Units {
  return { ux: W / Math.max(pixels.w, 1), uy: H / Math.max(pixels.h, 1), compact: pixels.w < 640 }; // overlay units per CSS pixel, per axis
}
/** Canvas chrome every close-up layout keeps clear of: title, zoom toggle, rotate buttons, the track legend along the bottom. */
function chrome({ ux, uy, compact }: Units): Box[] {
  const button = compact ? 42 : 64;
  return [
    { x0: 0, x1: (compact ? 200 : 360) * ux, y0: 0, y1: (compact ? 50 : 76) * uy },
    { x0: W - (compact ? 130 : 200) * ux, x1: W, y0: 0, y1: (compact ? 44 : 60) * uy },
    { x0: 0, x1: button * ux, y0: H / 2 - (button / 2) * uy, y1: H / 2 + (button / 2) * uy },
    { x0: W - button * ux, x1: W, y0: H / 2 - (button / 2) * uy, y1: H / 2 + (button / 2) * uy },
    ...(compact ? [] : [{ x0: 0, x1: W, y0: H - 46 * uy, y1: H }]),
  ];
}
/** Track chips (glyph + id) stand at the foot of each route; the legend names them. */
const chipBox = ({ ux, uy, compact }: Units, at: Vec): Box => {
  const half = compact ? 26 : 38;
  return { x0: at.x - half * ux, x1: at.x + half * ux, y0: at.y, y1: at.y + (compact ? 30 : 40) * uy };
};

/**
 * Methods are called out in two columns — the left half of the view to the
 * left, the right half to the right — each label level with its medallion
 * where it can be, joined to it by a leader. Narrow canvases call out only
 * each track's leader.
 */
function layoutCallouts(inputs: CalloutInput[], taken: Box[], { ux, uy, compact }: Units) {
  const margin = 14 * ux;
  const row = 22 * uy;
  const bottom = H - (compact ? 14 : 58) * uy; // above the track legend
  return [true, false].flatMap((left) => {
    const side = inputs.filter((item) => item.left === left && (!compact || item.climber.rank === 1)).sort((a, b) => a.bead.y - b.bead.y);
    if (!side.length) return [];
    const width = (item: CalloutInput) => ((shortLabel(item.climber.label).length + 6) * (compact ? 6.2 : 7.2) + 34) * ux;
    const widest = Math.max(...side.map(width));
    // the column clears the outermost medallion on its side
    const edge = left ? Math.min(...side.map((item) => item.bead.x - item.rim)) : Math.max(...side.map((item) => item.bead.x + item.rim));
    const column = left ? Math.max(edge - 30 * ux, margin + widest) : Math.min(edge + 30 * ux, W - margin - widest);
    const boxAt = (y: number, w: number): Box => ({ x0: left ? column - w : column, x1: left ? column : column + w, y0: y - row / 2, y1: y + row / 2 });
    // stack downward from each medallion's height, stepping past anything already placed …
    let cursor = -Infinity;
    const ys = side.map((item) => {
      let y = Math.max(item.bead.y, cursor + row);
      while (taken.some((other) => overlaps(boxAt(y, width(item)), other)) && y < H) y += row / 2;
      cursor = y;
      return y;
    });
    // … and if the column runs past the legend, re-stack it upward from there, keeping its order
    let floor = bottom + row;
    for (let i = ys.length - 1; i >= 0; i--) floor = ys[i] = Math.min(ys[i], floor - row);
    return side.map((item, i) => {
      const y = ys[i];
      taken.push(boxAt(y, width(item)));
      const end = { x: column + (left ? 5 : -5) * ux, y };
      // leave the medallion toward the label, then run level into it
      const elbow = { x: end.x + (left ? 1 : -1) * Math.min(Math.abs(end.x - item.bead.x) * 0.35, 28 * ux), y };
      const dx = elbow.x - item.bead.x;
      const dy = elbow.y - item.bead.y;
      const k = item.rim / (Math.hypot(dx, dy) || 1);
      const start = { x: item.bead.x + dx * k, y: item.bead.y + dy * k };
      return { key: spotKey(item.prong, item.climber), prong: item.prong, climber: item.climber, start, elbow, end, anchor: { x: column, y }, left };
    });
  });
}

/** Close-up of an arm: track chips at the routes' feet, contour values at the left end of each ring. */
function layoutArm(arm: SnowArm, toScreen: Screen, pixels: { w: number; h: number }) {
  const u = units(pixels);
  const taken = chrome(u);
  const routes = arm.prongs.map((prong) => {
    const foot = toScreen(routePoint(arm, prong, 1, PEAK));
    const at = { x: foot.x, y: foot.y + 12 * u.uy };
    taken.push(chipBox(u, at));
    return { prong, at };
  });
  const fork = forkPoint(arm);
  // contour values at the left end of each ring, at the ring's height
  const contours = u.compact ? [] : CONTOURS.map((level) => {
    const radius = contourRadius(level, PEAK);
    return { level, at: toScreen(add(fork, polar(radius + 12, arm.angle + 86)), ridgeHeight(radius)) };
  });
  const inputs = arm.prongs.flatMap((prong) => prong.climbers.map((climber) => {
    const spot = arm.peakSpots.get(spotKey(prong, climber))!;
    const z = climbHeight(climber.t);
    const bead = toScreen(spot, z);
    // screen radius of the medallion (it faces the camera), so leaders start at its rim
    const rimAt = toScreen(spot, z + coinRadius(climber.rank) * PEAK.coinScale + 4);
    return { prong, climber, bead, rim: Math.hypot(rimAt.x - bead.x, rimAt.y - bead.y), left: prong.offset > 0 };
  }));
  return { routes, contours, callouts: layoutCallouts(inputs, taken, u) };
}

/** The opened centre: track chips where the streams fall from, contour values at the rings' front. */
function layoutColumn(overall: SnowArm, toColumn: Projector["column"], pixels: { w: number; h: number }) {
  const u = units(pixels);
  const taken = chrome(u);
  // chips mark where each stream falls from, above the summit ring
  const routes = overall.prongs.map((prong, index) => {
    const at = toColumn({ x: streamX(index), y: columnHeight(SNOW_SCALE) + 170 });
    taken.push(chipBox(u, at));
    return { prong, at };
  });
  const contours = u.compact ? [] : [...CONTOURS, SNOW_SCALE].map((level) => ({ level, at: toColumn({ x: 0, y: columnHeight(level) }, -COLUMN.ring) }));
  const inputs = overall.prongs.flatMap((prong, index) => prong.climbers.map((climber) => {
    const spot = overall.spots.get(spotKey(prong, climber))!;
    const bead = toColumn(spot);
    const rimAt = toColumn({ x: spot.x + COLUMN_COIN + 4, y: spot.y });
    return { prong, climber, bead, rim: Math.abs(rimAt.x - bead.x), left: index < 2 };
  }));
  return { routes, contours, callouts: layoutCallouts(inputs, taken, u) };
}

/**
 * Whole view: each capability card sits just past the outermost prong tip of
 * its arm, pushed out along the arm far enough that the card never covers the
 * crystal, and kept inside the canvas.
 */
function layoutTips(arms: SnowArm[], toScreen: Screen, pixels: { w: number; h: number }) {
  const { ux, uy, compact } = units(pixels); // phones show icon tiles only
  const centre = toScreen({ x: 0, y: 0 });
  return arms.map((arm) => {
    const outer = [forkPoint(arm), ...arm.prongs.map((prong) => prongPoint(arm, prong, 1))].map((point) => toScreen(point)); // arms lie flat in this view
    const along = toScreen(polar(SNOW_FORK + 360, arm.angle));
    const length = Math.hypot(along.x - centre.x, along.y - centre.y) || 1;
    const dir = { x: (along.x - centre.x) / length, y: (along.y - centre.y) / length };
    const reach = Math.max(...outer.map((p) => (p.x - centre.x) * dir.x + (p.y - centre.y) * dir.y));
    const w = (compact ? 32 : Math.max(arm.label.length * 8.4, 120) + 80) * ux;
    const h = (compact ? 32 : 70) * uy;
    const extent = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 10 * Math.hypot(dir.x * ux, dir.y * uy);
    const at = { x: centre.x + dir.x * (reach + extent), y: centre.y + dir.y * (reach + extent) };
    // keep clear of the rotate buttons at the canvas edges
    const side = (compact ? 46 : 70) * ux;
    return { x: Math.min(Math.max(at.x, w / 2 + side), W - w / 2 - side), y: Math.min(Math.max(at.y, h / 2 + 8 * uy), H - h / 2 - 8 * uy) };
  });
}
