import { getT1UnibenchVqaEpisode } from "../../../data/t1-unibench-vqa.server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const episode = getT1UnibenchVqaEpisode(id);
    if (!episode) return new Response(null, { status: 404 });
    return Response.json(episode, { headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
  } catch {
    // Invalid or stale bundled evidence is unavailable; never return partial or private diagnostics.
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
