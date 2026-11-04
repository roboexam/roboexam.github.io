import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const TEST_SESSION_SECRET = "rendered-html-test-secret";

function sessionCookie() {
  process.env.AUTH_SESSION_SECRET = TEST_SESSION_SECRET;
  const expires = Math.floor(Date.now() / 1000) + 60;
  const payload = `test-user.${expires}`;
  const signature = createHmac("sha256", TEST_SESSION_SECRET).update(payload).digest("hex");
  return `unibench_session=${payload}.${signature}`;
}

async function render(pathname, {
  authenticated = false,
  accept = "text/html",
  headers = {},
  method = "GET",
} = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      method,
      headers: { accept, ...(authenticated ? { cookie: sessionCookie() } : {}), ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("does not publish the retired login page", async () => {
  const response = await render("/login");
  assert.equal(response.status, 404);
});

test("renders the public benchmark introduction without internal surfaces", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /RoboExam/);
  assert.match(html, /Evidence for robots that reason, predict, act, and recover\./);
  assert.match(html, /See the task, rollout, and outcome\./);
  assert.match(html, /One benchmark, four questions\./);
  assert.match(html, /Provisional 2027 schedule/);
  assert.match(html, /Benchmark challenge/);
  assert.match(html, /Research submissions/);
  assert.match(html, /Dec 15, 2026/);
  assert.match(html, /Mar 5 · AoE/);
  assert.match(html, /A final score is the start of the diagnosis\./);
  assert.match(html, /Embodied Agency/);
  assert.match(html, /Physical Foresight/);
  assert.match(html, /Simulation Deployment/);
  assert.match(html, /Real-World Deployment/);
  assert.match(html, /Visual OOD/);
  assert.match(html, /Failure recovery/);
  assert.match(html, /samples\/stack-bowls-policy\.mp4/);
  assert.match(html, /Leaderboards/);
  assert.doesNotMatch(html, /CVPR|Workshop|workshop|Correlation|Review|Datasets|当前 baseline 训练与测评计划|RUN REGISTRY/);
});

test("does not require an authentication cookie", async () => {
  const anonymous = await render("/");
  const authenticated = await render("/", { authenticated: true });
  assert.equal(anonymous.status, 200);
  assert.equal(authenticated.status, 200);
  assert.match(await authenticated.text(), /RoboExam/);
});

test("allows anonymous evidence access and rejects invalid requests", async () => {
  const sampleId = "0970d026706a3a8ed108e64410798032eeb2f4d586569e21c460d1e151f00608";
  const invalidMetric = await render(`/api/l1-phase1-evidence/items/${sampleId}?metric=../../private`, { accept: "application/json" });
  assert.equal(invalidMetric.status, 400);
  assert.equal((await invalidMetric.json()).error, "invalid_metric");

  const mismatch = await render(`/api/l1-phase1-evidence/items/${sampleId}?metric=l1b.area_hit_ratio`, { accept: "application/json" });
  assert.ok([404, 503].includes(mismatch.status));
  assert.ok(["sample_metric_mismatch", "evidence_unavailable"].includes((await mismatch.json()).error));
});

test("serves metric-specific GT and the actual Cosmos response for Figure 2", async () => {
  const sampleId = "0970d026706a3a8ed108e64410798032eeb2f4d586569e21c460d1e151f00608";
  const response = await render(`/api/l1-phase1-evidence/items/${sampleId}?metric=l1a.object_state_f1`, { accept: "application/json" });
  if (response.status === 503) {
    assert.equal((await response.json()).error, "evidence_unavailable");
    return;
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  const item = await response.json();
  assert.equal(item.canonicalSampleId, sampleId);
  assert.equal(item.membership.metricId, "l1a.object_state_f1");
  assert.equal(item.membership.nativeScore, 0.6086956521739131);
  assert.equal(item.memberships, undefined);
  assert.ok(item.membership.groundTruth.objects.find((object) => object.object_id === "bowl1").states.includes("stacked"));
  assert.ok(item.cosmos.parsedResponse.objects.every((object) => object.states.includes("stacked")));
});


test("does not publish the retired OOD page while keeping its media route guarded", async () => {
  const response = await render("/ood");
  assert.equal(response.status, 404);
  const invalid = await render("/api/ood-media?file=../../secret", { authenticated: true });
  assert.equal(invalid.status, 404);
});

test("does not publish the review page and rejects unlisted media", async () => {
  const response = await render("/review");
  assert.equal(response.status, 404);
  const invalidRaw = await render("/api/raw-review?path=%2Fetc%2Fpasswd");
  assert.equal(invalidRaw.status, 400);
  assert.equal((await render("/api/raw-review-media?id=unlisted")).status, 404);
  assert.equal((await render("/api/raw-review-trace?id=unlisted")).status, 400);
  assert.equal((await render("/api/raw-review-trace?id=" + "a".repeat(64))).status, 404);
  for (const file of ["../../secret", "0".repeat(64)+".mp4"]) {
    const invalid = await render("/api/review-media?file="+encodeURIComponent(file));
    assert.equal(invalid.status,404);
  }
});

test("does not publish a standalone Datasets page", async () => {
  const response = await render("/datasets");
  assert.equal(response.status, 404);
});

test("an obsolete task query remains on the public overview", async () => {
  const response = await render("/?task=mirror_pair_layout");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Evidence for robots that reason, predict, act, and recover\./);
  assert.doesNotMatch(html, /Task-aligned simulation episodes/);
});

test("serves compressed video renditions with ranges and immutable identity", async () => {
  const catalog = JSON.parse(readFileSync(
    new URL("../app/data/generated/video-renditions.json", import.meta.url),
    "utf8",
  ));
  const [sourceSha256, rendition] = Object.entries(catalog.items)[0];
  assert.ok(sourceSha256, "rendition catalog is empty");
  const path =
    `/api/video-renditions?source=${sourceSha256}` +
    `&profile=${catalog.profile.id}`;

  for (const invalid of [
    "/api/video-renditions",
    "/api/video-renditions?source=bad&profile=web-360p-v1",
    `/api/video-renditions?source=${"a".repeat(64)}&profile=bad`,
  ]) {
    assert.equal((await render(invalid, { accept: "video/mp4" })).status, 404);
  }

  const metadata = await render(path, { accept: "video/mp4", method: "HEAD" });
  assert.equal(metadata.status, 200);
  assert.equal(metadata.headers.get("content-length"), String(rendition.bytes));
  assert.equal(metadata.headers.get("accept-ranges"), "bytes");
  assert.equal(metadata.headers.get("etag"), `"${rendition.sha256}"`);
  assert.equal(metadata.headers.get("x-roboexam-source-sha256"), sourceSha256);

  const partial = await render(path, {
    accept: "video/mp4",
    headers: { range: "bytes=0-31" },
  });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-length"), "32");
  assert.equal((await partial.arrayBuffer()).byteLength, 32);

  const unchanged = await render(path, {
    accept: "video/mp4",
    headers: { "if-none-match": `"${rendition.sha256}"` },
  });
  assert.equal(unchanged.status, 304);
});


test("renders the public UniBench-24 Track 1 score tables across five settings", async () => {
  const response = await render("/leaderboards");
  assert.equal(response.status, 200);
  const html = await response.text();
  const bundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-unibench-results.json", import.meta.url), "utf8"));
  for (const model of bundle.models) {
    assert.ok(html.includes(model.label), model.label);
    if (model.overall) assert.ok(html.includes(`<strong>${model.overall.overall.toFixed(1)}</strong>`), `${model.id} overall`);
  }
  for (const text of ["Overall", "VQA", "Subtask", "In-distribution", "Visual OOD", "Semantic OOD", "Behavioral OOD", "Failure recovery"]) assert.ok(html.includes(text), text);
  assert.match(html, /aria-label="Per-task subtask scores"/);
  assert.doesNotMatch(html, /Rollout model|Rollout setting|Rollout task|Episode VQA|data-episode-id|src="\/api\/t1-/);
  assert.doesNotMatch(html, /MiMo/);
  assert.doesNotMatch(html, /\/bh\/|\/mnt\//);
});

test("serves selected-episode VQA questions, first answers and exact saved scores", async () => {
  const detailBundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-benchmark-vqa.json", import.meta.url), "utf8"));
  for (const modelId of ["gpt-6-1-sol", "deepseek"]) {
    const expected = detailBundle.episodes.find(episode => episode.modelId === modelId && episode.taskId === "arrange_largest_number" && episode.layoutId === 100000);
    const response = await render(`/api/t1-benchmark-vqa/${expected.episodeId}`, { accept: "application/json" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), expected);
  }
  const otherModelId = `${detailBundle.resultVersion}-mimo-arrange_largest_number-layout100000`;
  const invalid = await render(`/api/t1-benchmark-vqa/${otherModelId}`, { accept: "application/json" });
  assert.equal(invalid.status, 404);
  assert.equal(await invalid.text(), "");
});

test("serves both approved zero assignments without inventing model answers", async () => {
  const bundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-benchmark-vqa.json", import.meta.url), "utf8"));
  const expected = bundle.episodes.find(episode => episode.modelId === "gpt-6-1-sol" && episode.taskId === "classify_objects_by_language" && episode.layoutId === 100001);
  const response = await render(`/api/t1-benchmark-vqa/${expected.episodeId}`, { accept: "application/json" });
  assert.equal(response.status, 200);
  const actual = await response.json();
  const initial = actual.initial.filter(question => question.scoreOrigin === "policy_zero");
  const process = actual.checkpoints.filter(point => point.scoreOrigin === "policy_zero");
  assert.equal(initial.length, 1); assert.equal(process.length, 1);
  assert.equal(initial[0].score, 0); assert.equal(initial[0].observedScore, null); assert.equal(initial[0].response, null);
  assert.deepEqual(process[0].scores, { c2: 0, c3: 0 });
  assert.deepEqual(process[0].observedScores, { c2: null, c3: null }); assert.equal(process[0].response, null);
});

test("rejects an unlisted benchmark video without exposing private paths", async () => {
  const response = await render("/api/t1-benchmark-media/unlisted-video", { accept: "video/mp4" });
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /\/bh\/|\/mnt\/|\/Users\//);
});

test("does not expose private benchmark rollout media from the public copy", async () => {
  const bundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), "utf8"));
  const video = bundle.episodes[0].video;
  const head = await render(video.url, { accept: "video/mp4", method: "HEAD" });
  assert.equal(head.status, 404);
});

test("rejects an unlisted Track 1 video in the built server", async () => {
  const response = await render("/api/t1-media/unlisted-video", { accept: "video/mp4" });
  assert.equal(response.status, 404);
});
