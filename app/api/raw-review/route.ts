import { rawReview } from "../../data/raw-review.server.ts";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const task = url.searchParams.get("task");
  const episode = url.searchParams.get("episode");
  if ([...url.searchParams.keys()].some(key => key !== "task" && key !== "episode") ||
    url.searchParams.getAll("task").length > 1 || url.searchParams.getAll("episode").length > 1 ||
    (task && episode) || [task, episode].some(id => id !== null && !/^[a-f0-9]{64}$/.test(id)))
    return Response.json({ error: "invalid_id" }, { status: 400 });
  try {
    const value = episode ? await rawReview.episode(episode) : task ? await rawReview.task(task) : await rawReview.catalog();
    return Response.json(value ?? { error: "not_found" }, { status: value ? 200 : 404, headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "raw_unavailable", message: "公盘 raw 目录暂时不可读，请稍后刷新。" },
      { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "30" } });
  }
}
