import assert from "node:assert/strict";
import test from "node:test";

import { BOARD_TAGS, buildMainBoard } from "../app/data/main-board.ts";
import {
  armAngle, buildOverall, buildSnowflake, capabilityMean, climbDistance, climbHeight, climbPoint, coinRadius, columnHeight, forkPoint, PEAK, prongPoint,
  SNOW_FORK, SNOW_PLATE, SNOW_PRONG, SNOW_PRONGS, SNOW_SCALE, spotKey,
} from "../app/data/snowflake.ts";

const board = buildMainBoard();
const arms = buildSnowflake(board);
const overall = buildOverall(board);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("six arms are the capability tags, each ending in a T1–T4 fork outside the plate", () => {
  assert.deepEqual(arms.map((arm) => arm.tag), BOARD_TAGS.map((tag) => tag.id));
  assert.deepEqual(arms.map((arm) => arm.angle), [0, 1, 2, 3, 4, 5].map(armAngle));
  assert.ok(SNOW_FORK > SNOW_PLATE, "the fork sits outside the plate");
  for (const arm of arms) {
    assert.deepEqual(arm.prongs.map((prong) => prong.track), ["T1", "T2", "T3", "T4"]);
    const offsets = arm.prongs.map((prong) => prong.offset);
    assert.ok(offsets.every((offset, i) => i === 0 || offset < offsets[i - 1]), "prongs fan in track order");
    const fork = forkPoint(arm);
    for (const prong of arm.prongs) {
      const end = prongPoint(arm, prong, 1);
      assert.ok(Math.abs(Math.hypot(end.x - fork.x, end.y - fork.y) - SNOW_PRONG) < 1e-9);
    }
  }
});

test("climbers are exactly the ranked rows with a tag score, on the shared 0–100 altitude", () => {
  for (const arm of arms) {
    for (const prong of arm.prongs) {
      const track = board.find((item) => item.id === prong.track);
      const expected = track.rows.filter((row) => row.ranked && typeof row.tags[arm.tag] === "number");
      assert.equal(prong.climbers.length, expected.length, `${arm.tag} ${prong.track}`);
      for (const climber of prong.climbers) {
        assert.equal(climber.value, track.rows.find((row) => row.id === climber.id).tags[arm.tag]);
        assert.ok(climber.t >= 0 && climber.t <= 1);
        assert.ok(Math.abs(climber.t - climber.value / prong.scale) < 1e-9);
      }
      assert.ok(prong.climbers.every((climber, i) => i === 0 || climber.rank >= prong.climbers[i - 1].rank), "ordered by rank");
      assert.equal(prong.best, prong.climbers[0]?.value ?? null);
      if (!prong.climbers.length) assert.ok(prong.pending, "empty prongs say why");
    }
  }
  assert.ok(arms.every((arm) => arm.prongs[3].climbers.length === 0), "T4 has no published hardware score");
});

test("every route shares one altitude scale, and neighbouring forks never touch", () => {
  assert.ok(arms.every((arm) => arm.prongs.every((prong) => prong.scale === SNOW_SCALE)));
  // equal scores sit on the same contour ring, whatever the track
  for (const arm of arms) {
    const fork = forkPoint(arm);
    const radii = arm.prongs.map((prong) => gap(climbPoint(arm, prong, 0.5), fork));
    assert.ok(radii.every((r) => Math.abs(r - radii[0]) < 1e-9));
  }
  // the first track's prong of one arm faces the last track's prong of the next
  const first = SNOW_PRONGS[0];
  const last = SNOW_PRONGS[SNOW_PRONGS.length - 1];
  for (let i = 0; i < 6; i++) {
    const a = prongPoint({ angle: armAngle(i) }, first, 1);
    const b = prongPoint({ angle: armAngle(i + 1) }, last, 1);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 200, `arm ${i}`);
  }
});

test("climbers rise toward the summit: higher scores stand closer to the fork, never on it", () => {
  for (const arm of arms) {
    const fork = forkPoint(arm);
    for (const prong of arm.prongs) {
      const distance = (climber) => { const p = climbPoint(arm, prong, climber.t); return Math.hypot(p.x - fork.x, p.y - fork.y); };
      prong.climbers.forEach((climber, i) => {
        assert.ok(distance(climber) > 0.2 * SNOW_PRONG, "summit stays clear");
        if (i > 0 && climber.value < prong.climbers[i - 1].value) assert.ok(distance(climber) > distance(prong.climbers[i - 1]));
      });
    }
  }
  const tip = prongPoint({ angle: 0 }, SNOW_PRONGS[0], 1);
  assert.deepEqual(climbPoint({ angle: 0 }, SNOW_PRONGS[0], 0), tip, "a zero score sits at the route's foot");
});

test("each climber stands on its own altitude ring, clear of the others where the ring allows", () => {
  for (const arm of arms) {
    const fork = forkPoint(arm);
    const placed = [];
    for (const prong of arm.prongs) {
      for (const climber of prong.climbers) {
        const at = arm.spots.get(spotKey(prong, climber));
        assert.ok(at, `${arm.tag} ${prong.track} ${climber.id} has a spot`);
        assert.ok(Math.abs(gap(at, fork) - climbDistance(climber.t)) < 1e-6, "stepping sideways keeps the altitude");
        placed.push({ at, r: coinRadius(climber.rank) });  // flat layout: unscaled medallions
      }
    }
    // a 60 must stand nearer the summit, and higher, than a 30 on any route
    const sorted = arm.prongs.flatMap((prong) => prong.climbers).sort((a, b) => b.value - a.value);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(climbDistance(sorted[i].t) >= climbDistance(sorted[i - 1].t));
      assert.ok(climbHeight(sorted[i].t) <= climbHeight(sorted[i - 1].t));
    }
    assert.equal(arm.spots.size, placed.length);
  }
});

test("the centre ranks each method by its mean over all six capabilities", () => {
  assert.equal(overall.tag, "ALL");
  for (const prong of overall.prongs) {
    const track = board.find((item) => item.id === prong.track);
    const expected = track.rows.filter((row) => row.ranked && capabilityMean(row) !== null);
    assert.equal(prong.climbers.length, expected.length, prong.track);
    for (const climber of prong.climbers) {
      const row = track.rows.find((item) => item.id === climber.id);
      const tags = Object.values(row.tags);
      assert.ok(Math.abs(climber.value - tags.reduce((sum, value) => sum + value, 0) / tags.length) < 1e-9);
      assert.equal(overall.spots.get(spotKey(prong, climber)).y, columnHeight(climber.value));
    }
  }
  assert.ok(columnHeight(60) > columnHeight(30));
});

test("an opened arm's peak spreads its routes wider and keeps every climber on its altitude ring", () => {
  for (const arm of arms) {
    const fork = forkPoint(arm);
    const offsets = arm.prongs.map((prong) => PEAK.offsets[prong.track]);
    assert.ok(offsets.every((offset, i) => i === 0 || offset < offsets[i - 1]), "peak routes keep track order");
    assert.ok(Math.abs(offsets[0]) > Math.abs(arm.prongs[0].offset), "and fan wider than the flat fork");
    for (const prong of arm.prongs) {
      for (const climber of prong.climbers) {
        const at = arm.peakSpots.get(spotKey(prong, climber));
        assert.ok(Math.abs(gap(at, fork) - climbDistance(climber.t, PEAK)) < 1e-6);
      }
    }
  }
});
