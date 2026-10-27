import { realDatasets } from "../../data/real-datasets.server.ts";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (keys.some(key => key !== "dataset" && key !== "episode" && key !== "refresh") ||
    params.getAll("dataset").length > 1 || params.getAll("episode").length > 1 || params.getAll("refresh").length > 1 ||
    (params.has("refresh") && params.get("refresh") !== "1") ||
    (params.has("refresh") && (params.has("dataset") || params.has("episode"))) ||
    (params.has("dataset") && params.has("episode")) ||
    [params.get("dataset"), params.get("episode")].some(value => value !== null && !/^[a-f0-9]{64}$/.test(value)))
    return Response.json({ error: "invalid_query" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  try {
    if (params.has("episode")) {
      const value = await realDatasets.episode(params.get("episode")!);
      return Response.json(value ?? { error: "not_found" }, { status: value ? 200 : 404, headers: { "cache-control": "private, no-store" } });
    }
    if (params.has("dataset")) {
      const value = await realDatasets.dataset(params.get("dataset")!);
      return Response.json(value ?? { error: "not_found" }, { status: value ? 200 : 404, headers: { "cache-control": "private, no-store" } });
    }
    return Response.json(await realDatasets.catalog(params.get("refresh") === "1"), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "real_dataset_unavailable", message: "真机数据目录暂时不可读，请稍后刷新。" }, { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "30" } });
  }
}
