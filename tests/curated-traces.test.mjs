import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dataset = JSON.parse(await readFile(new URL("app/data/generated/explorer-dataset.json", root), "utf8"));
const registry = JSON.parse(await readFile(new URL("app/data/generated/curated-traces.json", root), "utf8"));

test("publishes one source-bound action trace for every explorer episode", () => {
  assert.equal(registry.schemaVersion, "roboexam.curated-trace-index.v1");
  assert.equal(Object.keys(registry.episodes).length, dataset.episodeCount);
  assert.equal(Object.values(registry.episodes).every((entry) => entry.available), true);
  assert.equal(JSON.stringify(registry).includes("/mnt/"), false);
});

test("keeps sampled joint and EE arrays aligned to the video PTS clock", async () => {
  const entries = Object.entries(registry.episodes);
  const sampled = [entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1)];
  for (const [episodeId, entry] of sampled) {
    const bytes = await readFile(new URL(`public${entry.url}`, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert.equal(bytes.includes(Buffer.from("/mnt/")), false);
    const trace = JSON.parse(bytes);
    assert.equal(trace.schemaVersion, "roboexam.action-trace.v1");
    assert.equal(trace.episodeId, episodeId);
    assert.equal(trace.clock.dataset, "vision/cam_head/video_pts_seconds");
    assert.equal(trace.t.length, entry.samples);
    assert.ok(trace.t.every((value, index) => index === 0 || value > trace.t[index - 1]));
    for (const side of ["left", "right"]) {
      assert.equal(trace.jointPosition[side].length, trace.t.length);
      assert.equal(trace.endEffectorPosition[side].length, trace.t.length);
      assert.equal(trace.jointPosition[side].every((sample) => sample.length === 6), true);
      assert.equal(trace.endEffectorPosition[side].every((sample) => sample.length === 3), true);
    }
  }
});
