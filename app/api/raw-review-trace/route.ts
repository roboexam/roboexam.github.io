import { rawReview } from "../../data/raw-review.server.ts";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const headers = { "cache-control": "private, no-store" };
  if (!/^[a-f0-9]{64}$/.test(id) || params.getAll("id").length !== 1 || [...params.keys()].some(key => key !== "id"))
    return Response.json({ error: "invalid_id" }, { status: 400, headers });
  const result = await rawReview.actionTrace(id);
  if (!result) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(result, { headers });
}
