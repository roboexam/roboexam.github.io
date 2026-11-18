import assert from "node:assert/strict";
import test from "node:test";

import { AXES, BOARD_SCENES, BOARD_TAGS, axisRows, buildMainBoard, columnRanks, metricTable, t3Rows } from "../app/data/main-board.ts";
import { paperResults } from "../app/data/paper-results.ts";
import { simulationV2Plan, tagsForScenario } from "../app/data/scenario-plan.ts";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("capability columns follow the manuscript's task-capability mapping", () => {
  assert.equal(BOARD_SCENES.length, 24);
  for (const tag of BOARD_TAGS) {
    const expected = simulationV2Plan.filter((scene) => tagsForScenario(scene).includes(tag.id)).map((scene) => scene.id);
    assert.deepEqual(tag.scenes, expected);
    assert.equal(tag.scenes.length, paperResults.tags[tag.id].tasks, `${tag.id} task count matches Supp. Table 3`);
    const paperTasks = paperResults.tasks.filter((task) => [...task.tags, ...task.conditionalTags].includes(tag.id)).map((task) => task.id).sort();
    assert.deepEqual([...tag.scenes].sort(), paperTasks, `${tag.id} task membership matches the manuscript`);
  }
});

test("main board reproduces manuscript Table 1 for all four tracks", () => {
  const board = buildMainBoard();
  assert.deepEqual(board.map((track) => track.id), ["T1", "T2", "T3", "T4"]);
  assert.deepEqual(board.map((track) => track.rows.length), [5, 5, 7, 5]);
  const gpt = board[0].rows.find((row) => row.id === "gpt-6.1-sol-xhigh");
  assert.deepEqual([gpt.tags.G, gpt.tagSecondary.G, gpt.overall, gpt.overallSecondary], [34.7, 47.5, 26.3, 45.6]);
  const pelican = board[1].rows.find((row) => row.id === "pelican_sim");
  assert.deepEqual([pelican.overall, pelican.overallSecondary], [58.3, 8.2]);
  const openwam = board[2].rows.find((row) => row.id === "OpenWAM");
  assert.deepEqual([openwam.tags.M, openwam.tagSecondary.M, openwam.overall], [25.5, 26.4, 24.8]);
  const pi = board[3].rows.find((row) => row.label === "π0.5");
  assert.deepEqual([pi.overall, pi.overallSecondary], [26.1, 55.07]);
  assert.deepEqual(pi.real.map((cell) => cell.value), [10, 0, 35, 33.3, 25, 100]);
  for (const row of board[3].rows) assert.ok(Object.values(row.tags).every((value) => value === null), "T4 is not tag-scored");
  for (const track of board) for (const row of track.rows) {
    assert.ok(row.ranked);
    for (const value of [row.overall, ...Object.values(row.tags)].filter((item) => item !== null)) assert.ok(value >= 0 && value <= 100, `${row.id} value in range`);
  }
  const labels = board.flatMap((track) => track.rows.map((row) => row.label));
  assert.ok(!labels.some((label) => /Claude|Qwen/.test(label)), "only manuscript models are published");
});

test("T3 per-task strips pool the frozen episodes behind Table 1", () => {
  for (const row of t3Rows()) {
    const model = paperResults.tracks.T3.find((item) => item.id === row.id);
    const n = Object.values(row.scenes).reduce((sum, scene) => sum + scene.n, 0);
    assert.equal(n, model.cases);
    assert.ok(model.cases >= 598 && model.cases <= 600, `${row.id} covers the 600-case suite`);
    const axis = axisRows("T3").find((item) => item.id === row.id);
    assert.ok(close(axis.axes.ID.value, model.settings.ID.tsr));
    assert.ok(close(axis.overall, model.summary.tsr));
  }
});

test("sub-tables expose every axis and the manuscript's native T2 values", () => {
  for (const trackId of ["T1", "T2", "T3", "T4"]) {
    for (const row of axisRows(trackId)) assert.deepEqual(Object.keys(row.axes), AXES.map((axis) => axis.id));
  }
  const table = metricTable("T2");
  for (const model of paperResults.tracks.T2) {
    const row = table.rows.find((item) => item.id === model.id);
    assert.equal(row.values.psnr, model.metrics.psnr);
    assert.equal(row.values.eePos, model.metrics.eePos);
    assert.equal(row.values.pred, model.overall.pred);
  }
  const real = axisRows("T4").find((row) => row.id === "Pi_05");
  assert.equal(real.axes.ID.n, 15);
  assert.equal(real.axes.REC.n, 6);
  assert.ok(close(real.axes.REC.value, 100 * 4 / 6), "π0.5 completes 1/3 towel and 3/3 puzzle continuations");
});

test("column ranks respect direction, ties and unranked rows", () => {
  const rows = [
    { id: "a", ranked: true, v: 3 }, { id: "b", ranked: true, v: 5 }, { id: "c", ranked: true, v: 5 },
    { id: "d", ranked: false, v: 9 }, { id: "e", ranked: true, v: null },
  ];
  const high = columnRanks(rows, (row) => row.v);
  assert.deepEqual([...high.entries()], [["b", 1], ["c", 1], ["a", 3]]);
  const low = columnRanks(rows, (row) => row.v, false);
  assert.equal(low.get("a"), 1);
  assert.equal(low.has("d"), false);
});
