import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const bundle = read("../app/data/generated/review-candidates.json");
test("pipeline review keeps semantic clean, fidelity and timing separate", () => {
  const byTask = new Map(bundle.tasks.map(task=>[task.id,task.count]));
  assert.equal(byTask.get("find_category_outlier"),100);
  assert.equal(byTask.get("place_between_references"),100);
  let diagnostic=0;
  for(const task of bundle.tasks) {
    const chunk=read("../public"+task.dataUrl);
    assert.ok(!JSON.stringify(chunk).includes("/mnt/"));
    for(const episode of chunk.episodes) {
      assert.equal(episode.qualification.functional,true);
      assert.equal(episode.qualification.clean,true);
      assert.equal(typeof episode.qualification.strongFidelity,"boolean");
      assert.equal(episode.qualification.time.status,"formal_budget_pending");
      assert.notEqual(episode.qualification.time.passed,true);
      assert.match(episode.sourceCommit,/^[a-f0-9]{40}$/);
      if(!episode.qualification.strongFidelity) diagnostic++;
    }
  }
  assert.ok(diagnostic>0,"accepted semantic samples retain original fidelity rejection");
});
