import assert from "node:assert/strict";
import test from "node:test";

import { AXES, BOARD_SCENES, BOARD_TAGS, axisRows, buildMainBoard, columnRanks, metricTable, t3Rows } from "../app/data/main-board.ts";
import { simulationV2Plan } from "../app/data/scenario-plan.ts";
import { policyBaselines } from "../app/data/policy-baselines.ts";
import { acwm600 } from "../app/data/acwm600-results.ts";
import { t1UnibenchResults } from "../app/data/t1-unibench-results.ts";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("capability columns use the frozen base tags of the 24 shared scenes", () => {
  assert.equal(BOARD_SCENES.length, 24);
  for (const tag of BOARD_TAGS) {
    const expected = simulationV2Plan.filter((scene) => scene.tags.includes(tag.id)).map((scene) => scene.id);
    assert.deepEqual(tag.scenes, expected, `${tag.id} must ignore candidate and variant-scoped tags`);
    assert.ok(tag.scenes.length > 0);
  }
});

test("main board keeps the four tracks and never ranks incomplete cohorts", () => {
  const board = buildMainBoard();
  assert.deepEqual(board.map((track) => track.id), ["T1", "T2", "T3", "T4"]);
  const t1 = board[0];
  for (const model of t1UnibenchResults.models) {
    const row = t1.rows.find((item) => item.id === model.id);
    assert.equal(row.ranked, model.overall !== null);
    if (!row.ranked) {
      assert.equal(row.overall, null);
      assert.ok(Object.values(row.tags).every((value) => value === null), "missing settings stay null, never zero");
    } else {
      // scene-macro overall stays within a point of the official split-macro overall
      assert.ok(Math.abs(row.overall - model.overall.overall) < 1, `${model.id} overall drift`);
    }
  }
  assert.equal(board[1].rows.length, acwm600.models.length);
  assert.ok(board[1].rows.every((row) => row.cases === 600 && row.ranked));
  assert.ok(board[3].rows.every((row) => !row.ranked && row.overall === null), "T4 has no published score");
  for (const track of board.slice(0, 3)) for (const row of track.rows.filter((item) => item.ranked)) {
    for (const value of [row.overall, ...Object.values(row.tags)]) assert.ok(value >= 0 && value <= 100, `${row.id} value in range`);
  }
});

test("T3 scene-macro success rate equals the official pooled success rate", () => {
  const rows = t3Rows();
  for (const row of rows) {
    const splits = Object.values(policyBaselines.overall[row.id]);
    const pooled = 100 * splits.reduce((sum, split) => sum + split.successes, 0) / splits.reduce((sum, split) => sum + split.episodes, 0);
    assert.ok(Math.abs(row.overall - pooled) < 0.5, `${row.id}: ${row.overall} vs ${pooled}`);
    const axis = axisRows("T3").find((item) => item.id === row.id);
    assert.ok(close(axis.axes.ID.value, 100 * policyBaselines.overall[row.id].id.values.TSR.value));
  }
});

test("a missing scene nulls its tag columns and the overall instead of counting as zero", () => {
  const bundle = structuredClone(policyBaselines);
  delete bundle.models.G05.id.stack_bowls;
  const row = t3Rows(bundle).find((item) => item.id === "G05");
  assert.equal(row.scenes.stack_bowls.value, null);
  assert.equal(row.overall, null);
  for (const tag of BOARD_TAGS) {
    if (tag.scenes.includes("stack_bowls")) assert.equal(row.tags[tag.id], null, `${tag.id} must be null`);
    else assert.notEqual(row.tags[tag.id], null);
  }
});

test("sub-tables expose every axis and the exact native T2 values", () => {
  for (const trackId of ["T1", "T2", "T3"]) {
    for (const row of axisRows(trackId)) assert.deepEqual(Object.keys(row.axes), AXES.map((axis) => axis.id));
  }
  const table = metricTable("T2");
  for (const model of acwm600.models) {
    const row = table.rows.find((item) => item.id === model.id);
    assert.equal(row.values.A1, model.groups.ALL.a.A1);
    assert.equal(row.values.pos, model.groups.ALL.b.v5.position.mae);
    assert.equal(row.values.rot, model.groups.ALL.b.v5.rotation.mae);
  }
  assert.ok(table.columns.filter((column) => column.pending).every((column) => table.rows.every((row) => !(column.id in row.values))));
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
