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

test("redirects the obsolete login page to the homepage", async () => {
  const response = await render("/login");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/");
});

test("renders the dashboard introduction without login", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /RoboExam/);
  assert.match(html, /CVPR 2027 Workshop/);
  assert.match(html, /The final exam for Physical AI/);
  assert.match(html, /You just can&#x27;t differentiate between a robot and the very best of humans\./);
  assert.doesNotMatch(html, /你已无法分辨，何者是机器人，何者是人类中的至善者。/);
  assert.match(html, /Isaac Asimov（艾萨克·阿西莫夫）· I, Robot（《我，机器人》）· 1950/);
  assert.match(html, /Correlation/);
  assert.match(html, /From model capabilities to task-level evidence\./);
  assert.match(html, /The RoboExam evaluation spectrum/);
  assert.doesNotMatch(html, /Measures C[1-7]|Other capabilities|VLM agents · shared harness|Action-conditioned world models|Policies in simulation|Policies on real robots/);
  assert.match(html, /Embodied Agency/);
  assert.match(html, /Seven capabilities/);
  assert.match(html, /State Grounding/);
  assert.match(html, /Recovery &amp; Safety/);
  assert.match(html, /Leaderboards/);
  assert.doesNotMatch(html, /拟之而后言|识其境，推其变，成其事，应万变|Where Physical AI|纸上得来终觉浅|Lu You|Reason from observations|Perceive and reason without acting|Fire tests gold|Seneca|Toward human-level Physical AI|One robot|Build history|From profile to evidence|Read abilities first|reducing embodied intelligence to a single success rate|Capability × interface × regime|One syllabus\. Four exams|UniEmbodied-Bench|Unified Embodied Evaluation|Research preview|ICLR 2027/);
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


test("redirects the retired standalone OOD page while keeping its media route guarded", async () => {
  const response = await render("/ood");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/");
  const invalid = await render("/api/ood-media?file=../../secret", { authenticated: true });
  assert.equal(invalid.status, 404);
});

test("publishes the pending review page and rejects unlisted media", async () => {
  const response = await render("/review");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /新增构造候选/);
  assert.match(html, /不自动入库/);
  assert.doesNotMatch(html, /\/mnt\//);
  for (const file of ["../../secret", "0".repeat(64)+".mp4"]) {
    const invalid = await render("/api/review-media?file="+encodeURIComponent(file));
    assert.equal(invalid.status,404);
  }
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


test("renders the current Track 1 results and exact selected execution video", async () => {
  const response = await render("/track-1");
  assert.equal(response.status, 200);
  const html = await response.text();
  const bundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), "utf8"));
  for (const text of ["DeepSeek", "Overall", "VQA", "Subtask", "Success", "Recognition", "Planning", "Task Tracking", "Next Action", bundle.models[0].scores.overall.toFixed(2)]) assert.ok(html.includes(text), text);
  assert.match(html, /api\/t1-benchmark-media\/t1-robodojo14-deepseek-20261021-v1-deepseek-/);
  for (const name of ["MiMo v2.6 Pro", "Kimi K3", "GPT-6 Astra", "GLM 5.3 Flash", "MiniMax H3.1 Preview", "Cosmos3-Nano"]) assert.ok(html.includes(name), name);
  assert.doesNotMatch(html, /DeepSeek v4\.1 Flash|Process questions C2 and C3 have not been scored/);
  assert.doesNotMatch(html, /\/bh\/|\/mnt\//);
});

test("rejects an unlisted benchmark video without exposing private paths", async () => {
  const response = await render("/api/t1-benchmark-media/unlisted-video", { accept: "video/mp4" });
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /\/bh\/|\/mnt\/|\/Users\//);
});

test("serves the exact benchmark rollout through the built server with seek support", async () => {
  const bundle = JSON.parse(readFileSync(new URL("../app/data/generated/t1-benchmark-results.json", import.meta.url), "utf8"));
  const video = bundle.episodes[0].video;
  const head = await render(video.url, { accept: "video/mp4", method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(video.bytes));
  assert.equal(head.headers.get("etag"), `"${video.sha256}"`);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  const range = await render(video.url, { accept: "video/mp4", headers: { range: "bytes=0-31" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), `bytes 0-31/${video.bytes}`);
  assert.equal((await range.arrayBuffer()).byteLength, 32);
});

test("rejects an unlisted Track 1 video in the built server", async () => {
  const response = await render("/api/t1-media/unlisted-video", { accept: "video/mp4" });
  assert.equal(response.status, 404);
});
