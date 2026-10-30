import assert from "node:assert/strict";
import test from "node:test";

import data from "../app/data/generated/xvla-24id.json" with { type: "json" };
import aggregates from "../app/data/generated/xvla-24id-aggregates.json" with { type: "json" };
import media from "../scripts/xvla-24id-media.json" with { type: "json" };
import { readResult } from "../app/data/track-results.ts";
import { tracks } from "../app/data/metric-plan.ts";
import { HEAD } from "../app/api/xvla-24id-media/[file]/route.ts";

test("XVLA 24-task ID export preserves task, sample, metric, and video identity", () => {
  assert.equal(Object.keys(data).length, 24);
  assert.deepEqual(Object.keys(data), Object.keys(aggregates));
  assert.equal(Object.values(data).reduce((sum, task) => sum + task.samples.length, 0), 120);
  assert.equal(Object.values(data).reduce((sum, task) => sum + task.samples.filter((sample) => sample.metricsAvailable).length, 0), 118);
  assert.equal(Object.values(data).reduce((sum, task) => sum + task.samples.flatMap((sample) => sample.videos).length, 0), 354);
  assert.equal(Object.keys(media).length, 354);
  assert.equal(Object.values(data).filter((task) => task.promptVersion === "v3").length, 8);
  assert.equal(Object.values(data).filter((task) => task.promptVersion === "v1").length, 16);
  assert.equal(new Set(Object.values(data).map((task) => task.resultVersion)).size, 1);
  const ids = tracks.find((track) => track.id === "T3").metrics.map((metric) => metric.id);
  assert.equal(ids.length, 19);
  for (const task of Object.values(data)) {
    assert.equal(task.expectedEpisodes, 5);
    assert.equal(task.samples.length, 5);
    assert.deepEqual(Object.keys(task.values), ids);
    assert.equal(task.values.COLLISION_RATE.available, false);
    assert.equal(task.values.ROBUSTNESS.available, false);
    assert.equal(task.samples.every((sample) => sample.values.COLLISION_RATE === null && sample.values.ROBUSTNESS === null), true);
  }
});

test("XVLA result routing is task-specific and preserves unavailable metrics", () => {
  const selection = { trackId: "T3", mode: "plan", modelId: "XVLA", setting: "id" };
  assert.equal(readResult({ ...selection, taskId: "place_between_references", metricId: "TSR" }).primary, "40.00%");
  assert.equal(readResult({ ...selection, taskId: "arrange_largest_number", metricId: "FIRST_TARGET_SELECTION" }).primary, "100.00%");
  assert.equal(readResult({ ...selection, taskId: "arrange_largest_number", metricId: "COLLISION_RATE" }).available, false);
  assert.equal(readResult({ ...selection, taskId: "not_a_task", metricId: "TSR" }).available, false);
});

test("XVLA compressed media route serves an exact registered range", async () => {
  const [file] = Object.keys(media);
  const context = { params: Promise.resolve({ file }) };
  const response = await HEAD(new Request(`http://localhost/api/xvla-24id-media/${file}`, {
    headers: { range: "bytes=0-31" },
  }), context);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-length"), "32");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal((await HEAD(new Request("http://localhost"), { params: Promise.resolve({ file: "../../etc/passwd" }) })).status, 404);
});
