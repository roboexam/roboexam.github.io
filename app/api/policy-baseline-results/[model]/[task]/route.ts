import data from "../../../../data/generated/policy-baselines.json" with { type: "json" };

type RouteContext = { params: Promise<{ model: string; task: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { model, task } = await context.params;
  const requested = new URL(request.url).searchParams.get("setting") ?? "id";
  const setting = requested === "behavioral" ? "behavior" : requested;
  const models = data.models as Record<string, Record<string, Record<string, { resultVersion: string; samples: unknown[] }>>>;
  const cohort = models[model]?.[setting];
  if (!cohort || !Object.hasOwn(cohort, task)) return new Response(null, { status: 404 });
  const entry = cohort[task];
  return Response.json(
    { model, task, setting, resultVersion: entry.resultVersion, samples: entry.samples },
    { headers: { "cache-control": "no-cache" } },
  );
}
