// The RoboExam snowflake: a hexagonal plate with six arms, one per capability
// tag. Each arm ends in a four-pronged fork, one prong per track (T1 → T4).
// The fork is the capability's summit: every prong is a route up to it, and
// methods climb their track's route from its tip (score 0) toward the fork.
// Every track's metric runs 0–100, so all routes share one altitude scale: in
// 3D each fork is a peak, routes are ridges running down from it, and a
// method's height on its ridge is its score — contour rings around the peak
// mark equal scores. Ranks compare methods
// within a track only. The centre summarises: each method's mean over the six
// capability scores, shown as four streams falling into the plate.
import { BOARD_SCENES, BOARD_TAGS, buildMainBoard, columnRanks, type BoardRow, type BoardTrack } from "./main-board.ts";
import type { TrackId } from "./metric-plan.ts";

/** Circumradius of the central plate, the fork node on each arm, and prong length. */
export const SNOW_PLATE = 400;
export const SNOW_FORK = 760;
export const SNOW_PRONG = 360;
/** Prong direction relative to its arm; with the arm pointing down, T1 is leftmost. */
export const SNOW_PRONGS: { track: TrackId; offset: number }[] = [
  { track: "T1", offset: 42 },
  { track: "T2", offset: 14 },
  { track: "T3", offset: -14 },
  { track: "T4", offset: -42 },
];
/** Share of each route kept clear below the summit, so the leaders of four tracks never crowd the fork. */
export const SUMMIT_CLEARANCE = 0.24;
/** All four track metrics are 0–100 (agent score, composite score, success rates). */
export const SNOW_SCALE = 100;
/** Contour rings, in score points. */
export const CONTOURS = [20, 40, 60, 80];
/** Medallion radius in snowflake units; leaders are a little larger. */
export const coinRadius = (rank: number) => (rank === 1 ? 21 : 17);

export type Vec = { x: number; y: number };
export const polar = (r: number, degrees: number): Vec => {
  const a = (degrees * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
};
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** Arm i points at -90° + 60°·i (G straight up). */
export const armAngle = (index: number) => -90 + 60 * index;

export type Climber = { id: string; label: string; value: number; rank: number; t: number };
export type SnowProng = { track: TrackId; offset: number; title: string; metric: string; scale: number; best: number | null; climbers: Climber[]; pending: string | null };
export type SnowArm = {
  tag: string;
  label: string;
  rule: string;
  scenes: number;
  angle: number;
  prongs: SnowProng[];
  /** Where each climber stands in the flat snowflake, and on the raised peak, keyed `${track}:${id}`. */
  spots: Map<string, Vec>;
  peakSpots: Map<string, Vec>;
};
export const spotKey = (prong: Pick<SnowProng, "track">, climber: Pick<Climber, "id">) => `${prong.track}:${climber.id}`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function prongsFor(board: BoardTrack[], read: (row: BoardRow) => number | null): SnowProng[] {
  return SNOW_PRONGS.map((prong) => {
    const track = board.find((item) => item.id === prong.track)!;
    const ranks = columnRanks(track.rows, read);
    const climbers = track.rows
      .filter((row) => ranks.has(row.id))
      .map((row) => ({ id: row.id, label: row.label, value: read(row) as number, rank: ranks.get(row.id)! }))
      .sort((a, b) => a.rank - b.rank || b.value - a.value)
      .map((climber) => ({ ...climber, t: clamp01(climber.value / SNOW_SCALE) }));
    return {
      track: prong.track,
      offset: prong.offset,
      title: track.title,
      metric: track.metric,
      scale: SNOW_SCALE,
      best: climbers[0]?.value ?? null,
      climbers,
      pending: climbers.length ? null : track.rows.length ? "No admitted results yet" : "No baselines registered",
    };
  });
}

export function buildSnowflake(board: BoardTrack[] = buildMainBoard()): SnowArm[] {
  return BOARD_TAGS.map((tag, index) => {
    const arm = { tag: tag.id, label: tag.label, rule: tag.rule, scenes: tag.scenes.length, angle: armAngle(index), prongs: prongsFor(board, (row) => row.tags[tag.id]) };
    return { ...arm, spots: climberSpots(arm), peakSpots: climberSpots(arm, PEAK) };
  });
}

/** Mean of the six capability scores; null unless all six exist. */
export function capabilityMean(row: BoardRow) {
  const values = BOARD_TAGS.map((tag) => row.tags[tag.id]);
  return values.every((value): value is number => typeof value === "number") ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** The centre: per track, each method's mean over the six capabilities. */
export function buildOverall(board: BoardTrack[] = buildMainBoard()): SnowArm {
  const prongs = prongsFor(board, capabilityMean);
  return {
    tag: "ALL",
    label: "Overall",
    rule: "Each method's mean over the six capability scores; a method needs all six to be ranked.",
    scenes: BOARD_SCENES.length,
    angle: 90,
    prongs,
    spots: overallSpots(prongs),
    peakSpots: new Map(),
  };
}

export const forkPoint = (arm: Pick<SnowArm, "angle">) => polar(SNOW_FORK, arm.angle);
/** Point on a track's prong at fraction t of its length, measured from the fork. */
export function prongPoint(arm: Pick<SnowArm, "angle">, prong: Pick<SnowProng, "offset">, t: number): Vec {
  return add(forkPoint(arm), polar(SNOW_PRONG * t, arm.angle + prong.offset));
}
/**
 * A fork's geometry: each route's direction relative to its arm, the route
 * length, and how far (degrees) a climber may step along its ring to clear a
 * neighbour. The flat snowflake keeps its routes close; an opened arm rises
 * into a peak whose routes spread evenly across the view and run longer, so
 * close-ups read clearly.
 */
export type ForkLayout = { offsets: Record<TrackId, number>; reach: number; stepLimit: number; coinScale: number };
export const FLAT: ForkLayout = { offsets: Object.fromEntries(SNOW_PRONGS.map((prong) => [prong.track, prong.offset])) as Record<TrackId, number>, reach: SNOW_PRONG, stepLimit: 13, coinScale: 1 };
/** Medallions are drawn larger on a raised peak (`coinScale`), so its spacing allows for them. */
export const PEAK: ForkLayout = { offsets: { T1: 62, T2: 19, T3: -19, T4: -62 }, reach: 500, stepLimit: 18, coinScale: 1.4 };
const routeAngle = (arm: Pick<SnowArm, "angle">, prong: Pick<SnowProng, "track">, layout: ForkLayout) => arm.angle + layout.offsets[prong.track];

/** Point on a route at fraction t of its length from the fork, in a given layout. */
export function routePoint(arm: Pick<SnowArm, "angle">, prong: Pick<SnowProng, "track">, t: number, layout: ForkLayout = FLAT): Vec {
  return add(forkPoint(arm), polar(layout.reach * t, routeAngle(arm, prong, layout)));
}
/** Distance from the summit of a climber at progress t: the route's full length at 0, just short of the fork at 1. */
export const climbDistance = (t: number, layout: ForkLayout = FLAT) => layout.reach * (1 - clamp01(t) * (1 - SUMMIT_CLEARANCE));
/** Radius of the contour ring for a score. */
export const contourRadius = (value: number, layout: ForkLayout = FLAT) => climbDistance(value / SNOW_SCALE, layout);
/** Height of a raised summit above the plate. */
export const SNOW_PEAK = 600;
/** Height on a raised ridge at in-plane distance d from its summit. */
export const ridgeHeight = (d: number) => SNOW_PEAK * Math.max(0, 1 - d / PEAK.reach);
/** Height of a climber at progress t: proportional to its score, the same on every route. */
export const climbHeight = (t: number) => ridgeHeight(climbDistance(t, PEAK));
/** Height along a raised arm's trunk at radius r: a straight ridge from the plate's rim up to the summit. */
export const trunkHeight = (r: number) => SNOW_PEAK * Math.max(0, Math.min(1, (r - SNOW_PLATE) / (SNOW_FORK - SNOW_PLATE)));
/** Where a climber at progress t stands on its own route. */
export function climbPoint(arm: Pick<SnowArm, "angle">, prong: Pick<SnowProng, "track">, t: number, layout: ForkLayout = FLAT): Vec {
  return add(forkPoint(arm), polar(climbDistance(t, layout), routeAngle(arm, prong, layout)));
}

/**
 * Where each climber stands: on its own route at its altitude when that spot
 * is free, otherwise stepped sideways along the same contour ring (so its
 * altitude is unchanged), preferring the side away from the arm's centre line.
 * Higher ranks are placed first.
 */
export function climberSpots(arm: Pick<SnowArm, "angle" | "prongs">, layout: ForkLayout = FLAT): Map<string, Vec> {
  const fork = forkPoint(arm);
  const placed: { at: Vec; r: number }[] = [];
  const spots = new Map<string, Vec>();
  const order = arm.prongs.flatMap((prong) => prong.climbers.map((climber) => ({ prong, climber })))
    .sort((a, b) => a.climber.rank - b.climber.rank || b.climber.value - a.climber.value);
  for (const { prong, climber } of order) {
    const r = coinRadius(climber.rank) * layout.coinScale;
    const reach = climbDistance(climber.t, layout);
    const step = ((2 * coinRadius(2) * layout.coinScale + 4) / reach) * (180 / Math.PI);
    const outward = layout.offsets[prong.track] >= 0 ? 1 : -1;
    const tries = [0, 1, -1, 2, -2].map((k) => k * outward * step).filter((delta) => Math.abs(delta) <= layout.stepLimit);
    const candidates = tries.map((delta) => add(fork, polar(reach, routeAngle(arm, prong, layout) + delta)));
    const at = candidates.find((point) => placed.every((other) => distance(other.at, point) >= other.r + r + 3)) ?? candidates[0];
    placed.push({ at, r });
    spots.set(spotKey(prong, climber), at);
  }
  return spots;
}

// ---------------------------------------------------------------- the centre column
// Four streams fall side by side (T1 left → T4 right) from the sky into the plate.
// Coordinates here are `x` across the column and `y` as height above the plate.
export const COLUMN = { floor: 90, height: 1000, spacing: 270, ring: 580 } as const;
export const streamX = (index: number) => (index - 1.5) * COLUMN.spacing;
export const columnHeight = (value: number) => COLUMN.floor + (clamp01(value / SNOW_SCALE)) * COLUMN.height;
/** Medallion radius on the column. */
export const COLUMN_COIN = 40;

/** Column spots: each method on its track's stream at its height, stepped sideways within the stream when crowded. */
export function overallSpots(prongs: SnowProng[]): Map<string, Vec> {
  const placed: Vec[] = [];
  const spots = new Map<string, Vec>();
  const order = prongs.flatMap((prong, index) => prong.climbers.map((climber) => ({ prong, index, climber })))
    .sort((a, b) => a.climber.rank - b.climber.rank || b.climber.value - a.climber.value);
  for (const { prong, index, climber } of order) {
    const y = columnHeight(climber.value);
    const gap = 2 * COLUMN_COIN + 6;
    // the outer streams spill outward first; T4 sits empty until hardware results land
    const outward = index < 2 ? -1 : 1;
    const candidates = [0, 1, -1, 2].map((k) => ({ x: streamX(index) + k * outward * gap, y }));
    const at = candidates.find((point) => placed.every((other) => distance(other, point) >= gap)) ?? candidates[0];
    placed.push(at);
    spots.set(spotKey(prong, climber), at);
  }
  return spots;
}
