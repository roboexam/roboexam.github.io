import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = new URL("../app/data/generated/vla-wam-samples.json", import.meta.url);
const bundle = JSON.parse(await readFile(file, "utf8"));

test("VLA/WAM sample bundle publishes ten diverse, paired samples per model", () => {
  assert.equal(bundle.schemaVersion, "unibench.dashboard.vla-wam-samples.v1");
  assert.deepEqual(Object.keys(bundle.models), ["Pi0.5", "FastWAM"]);
  for (const model of Object.values(bundle.models)) {
    assert.equal(model.samples.length, 10);
    assert.equal(new Set(model.samples.map((sample) => sample.seed)).size, 10);
    assert.deepEqual(new Set(model.samples.map((sample) => sample.outcome)), new Set(["success", "half-success", "failure"]));
    for (const sample of model.samples) {
      assert.match(sample.media.sha256, /^[a-f0-9]{64}$/);
      assert.match(sample.media.url, /^\/api\/episode-media\/stack_bowls\//);
      assert.equal(Number.isFinite(sample.timing.wallTotalSeconds), true);
      assert.equal(Number.isFinite(sample.trajectory.left.ee_path_length_m), true);
      assert.equal(Number.isFinite(sample.trajectory.right.ee_path_length_m), true);
    }
  }
  assert.equal(bundle.models["Pi0.5"].samples.some((sample) => sample.events.taskAdherence.count > 0), true);
});
