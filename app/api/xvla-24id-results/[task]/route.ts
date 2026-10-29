import data from "../../../data/generated/xvla-24id.json" with { type: "json" };

export async function GET(_request: Request, context: { params: Promise<{ task: string }> }) {
  const { task } = await context.params;
  if (!Object.hasOwn(data, task)) return new Response(null, { status: 404 });
  const entry = data[task as keyof typeof data];
  return Response.json(
    { task, resultVersion: entry.resultVersion, samples: entry.samples },
    { headers: { "cache-control": "no-cache" } },
  );
}
