import g05 from "../../../../data/generated/policy-baselines-g05.json" with { type: "json" };
import hyvla from "../../../../data/generated/policy-baselines-hyvla.json" with { type: "json" };
import xvla from "../../../../data/generated/policy-baselines-xvla.json" with { type: "json" };
import pi05 from "../../../../data/generated/policy-baselines-pi05.json" with { type: "json" };
import opendm from "../../../../data/generated/policy-baselines-opendm.json" with { type: "json" };

type TaskEntry = { resultVersion: string; samples: unknown[] };
type ModelData = Record<string, Record<string, TaskEntry>>;
const models: Record<string, ModelData> = {
  G05: g05.models.G05,
  HyVLA: hyvla.models.HyVLA,
  XVLA: xvla.models.XVLA,
  "Pi0.5": pi05.models["Pi0.5"],
  OpenDM: opendm.models.OpenDM,
};

type RouteContext = { params: Promise<{ model: string; task: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { model, task } = await context.params;
  const requested = new URL(request.url).searchParams.get("setting") ?? "id";
  const setting = requested === "behavioral" ? "behavior" : requested;
  const cohort = models[model]?.[setting];
  if (!cohort || !Object.hasOwn(cohort, task)) return new Response(null, { status: 404 });
  const entry = cohort[task];
  return Response.json(
    { model, task, setting, resultVersion: entry.resultVersion, samples: entry.samples },
    { headers: { "cache-control": "no-cache" } },
  );
}
