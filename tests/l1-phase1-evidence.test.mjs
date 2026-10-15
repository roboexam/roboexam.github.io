import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { l1Phase1ProvisionalRegistry } from "../scripts/l1-phase1-provisional-registry.mjs";

const goldenSampleId = "0970d026706a3a8ed108e64410798032eeb2f4d586569e21c460d1e151f00608";

test("publishes a complete protected item-evidence index", async () => {
  const index = JSON.parse(await readFile(path.join(l1Phase1ProvisionalRegistry.evidenceBundleRoot, "index.json"), "utf8"));
  assert.equal(index.schemaVersion, "unibench.dashboard.l1-phase1-evidence-index.v1");
  assert.equal(index.sampleCount, 1070);
  assert.equal(index.membershipCount, 2815);
  assert.equal(Object.keys(index.metrics).length, 29);
  assert.equal(index.metrics["l1a.direct"].length, 574);
  assert.equal(index.metrics["l1a.object_state_f1"].length, 107);
  assert.equal(index.metrics["l1b.situational"].length, 21);
  assert.equal(index.metrics["l1b.area_hit_ratio"].length, 19);
  assert.equal(index.metrics["l1c.plan_step_f1"].length, 12);
  assert.equal(index.metrics["l1d.recovery_plan_score"].length, 4);
});

test("shows the Figure 2 GT, Cosmos response, and metric-specific scores without a canned answer", async () => {
  const item = JSON.parse(await readFile(path.join(l1Phase1ProvisionalRegistry.evidenceBundleRoot, "items", `${goldenSampleId}.json`), "utf8"));
  assert.equal(item.canonicalSampleId, goldenSampleId);
  assert.deepEqual(item.frameIndices, [213]);
  assert.match(item.question, /Identify the visible bowls/);

  const objectState = item.memberships["l1a.object_state_f1"];
  const gtById = new Map(objectState.groundTruth.objects.map((object) => [object.object_id, object.states]));
  assert.ok(gtById.get("bowl0").includes("stack_base"));
  assert.ok(gtById.get("bowl1").includes("stacked"));
  assert.equal(gtById.get("bowl2").includes("stacked"), false);
  assert.equal(objectState.nativeScore, 0.6086956521739131);
  assert.ok(item.cosmos.parsedResponse.objects.every((object) => object.states.includes("stacked")));
  assert.doesNotMatch(JSON.stringify(objectState.groundTruth), /all bowls are loose|no stack has been formed/i);

  assert.equal(item.memberships["l1a.text_spatial_f1"].nativeScore, 0);
  assert.equal(item.memberships["l1a.llm_alignment"].nativeScore, 0);
  assert.equal(item.memberships["l1a.llm_alignment"].judge.verdict, "incorrect");
});

test("keeps item evidence sanitized with validated public API access", async () => {
  const [item, route, detail] = await Promise.all([
    readFile(path.join(l1Phase1ProvisionalRegistry.evidenceBundleRoot, "items", `${goldenSampleId}.json`), "utf8"),
    readFile(new URL("../app/api/l1-phase1-evidence/[...segments]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/l1/metric-detail.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(item, /\/mnt\/|\/World\/|instance_mask_path|mask_path|checkpoint|judge_cache_key|judge_prompt_sha256/i);
  assert.doesNotMatch(route, /validSession/);
  assert.match(route, /private, no-store/);
  assert.match(route, /sample_metric_mismatch/);
  assert.match(detail, /COSMOS3-NANO ACTUAL RESPONSE/);
  assert.match(detail, /GROUND TRUTH/);
  assert.match(detail, /逐题证据不可用/);
  assert.doesNotMatch(detail, /EXPECTED RESPONSE|期望模型怎样回答/);
});
