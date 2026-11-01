import data from "../../../data/generated/xvla-24id.json" with { type: "json" };
import ood from "../../../data/generated/xvla-ood.json" with { type: "json" };

export async function GET(request: Request, context: { params: Promise<{ task: string }> }) {
  const { task } = await context.params;
  const requested = new URL(request.url).searchParams.get("setting") ?? "id";
  const split = requested === "behavioral" ? "behavior" : requested;
  const cohort = split === "id" ? data : (split === "visual" || split === "semantic" || split === "behavior" ? ood[split] : null);
  if (!cohort || !Object.hasOwn(cohort, task)) return new Response(null, { status: 404 });
  const entry = cohort[task as keyof typeof cohort];
  return Response.json(
    { task, resultVersion: entry.resultVersion, samples: entry.samples },
    { headers: { "cache-control": "no-cache" } },
  );
}
