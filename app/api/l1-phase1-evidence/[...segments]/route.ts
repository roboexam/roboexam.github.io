import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

type RouteContext = { params: Promise<{ segments: string[] }> };

const defaultBundleRoot = "/mnt/gyc_ckp/benchmark2027/data/generated/dashboard-l1-phase1-evidence/v0.4-20260905";
const metricPattern = /^l1[abcd]\.[a-z0-9_]+$/;
const samplePattern = /^[a-f0-9]{64}$/;

async function readBundleJson(relativePath: string) {
  const root = await realpath(process.env.DASHBOARD_L1_PHASE1_EVIDENCE_BUNDLE_DIR ?? defaultBundleRoot);
  const candidate = await realpath(path.join(root, relativePath));
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error("evidence path escaped bundle root");
  return JSON.parse(await readFile(candidate, "utf8"));
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const segments = (await context.params).segments;
  const metricId = new URL(request.url).searchParams.get("metric") ?? "";
  if (!metricPattern.test(metricId)) return json({ ok: false, error: "invalid_metric" }, 400);

  try {
    if (segments.length === 1 && segments[0] === "index") {
      const index = await readBundleJson("index.json");
      const samples = index.metrics?.[metricId];
      if (!Array.isArray(samples)) return json({ ok: false, error: "unknown_metric" }, 404);
      return json({
        schemaVersion: index.schemaVersion,
        bundleVersion: index.bundleVersion,
        runId: index.runId,
        testedModel: index.testedModel,
        metricId,
        sampleCount: samples.length,
        samples,
      });
    }
    if (segments.length === 2 && segments[0] === "items" && samplePattern.test(segments[1])) {
      const item = await readBundleJson(`items/${segments[1]}.json`);
      const membership = item.memberships?.[metricId];
      if (!membership) return json({ ok: false, error: "sample_metric_mismatch" }, 404);
      const sample = { ...item, memberships: undefined };
      return json({ ...sample, membership });
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch {
    return json({ ok: false, error: "evidence_unavailable" }, 503);
  }
}
