import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const TEST_SESSION_SECRET = "rendered-html-test-secret";

function sessionCookie() {
  process.env.AUTH_SESSION_SECRET = TEST_SESSION_SECRET;
  const expires = Math.floor(Date.now() / 1000) + 60;
  const payload = `test-user.${expires}`;
  const signature = createHmac("sha256", TEST_SESSION_SECRET).update(payload).digest("hex");
  return `unibench_session=${payload}.${signature}`;
}

async function render(pathname, { authenticated = false, accept = "text/html" } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept, ...(authenticated ? { cookie: sessionCookie() } : {}) },
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
  assert.match(html, /知是行之始，行是知之成/);
  assert.match(html, /Knowledge is the beginning of action\. Action is the completion of knowledge\./);
  assert.match(html, /王阳明《传习录》/);
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
  assert.match(html, /已验收 clean 候选/);
  assert.match(html, /尚未正式入库/);
  assert.doesNotMatch(html, /\/mnt\//);
  for (const file of ["../../secret", "0".repeat(64)+".mp4"]) {
    const invalid = await render("/api/review-media?file="+encodeURIComponent(file));
    assert.equal(invalid.status,404);
  }
});
