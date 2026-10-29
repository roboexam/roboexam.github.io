import { simulationDatasets } from "../../data/simulation-datasets.server.ts";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  const task = params.get("task");
  if (keys.some(key => key !== "dataset" && key !== "episode" && key !== "refresh" && key !== "task") ||
    params.getAll("dataset").length > 1 || params.getAll("episode").length > 1 ||
    params.getAll("refresh").length > 1 || params.getAll("task").length > 1 ||
    (params.has("refresh") && params.get("refresh") !== "1") ||
    (params.has("refresh") && (params.has("dataset") || params.has("episode") || params.has("task"))) ||
    (params.has("dataset") && params.has("episode")) ||
    (params.has("task") && !params.has("dataset")) ||
    [params.get("dataset"), params.get("episode")].some(value => value !== null && !/^[a-f0-9]{64}$/.test(value)) ||
    (task !== null && !/^[A-Za-z0-9_+-]{1,128}$/.test(task)))
    return Response.json({ error: "invalid_query" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  try {
    if (params.has("episode")) {
      const value = await simulationDatasets.episode(params.get("episode")!);
      return Response.json(value ?? { error: "not_found" }, { status: value ? 200 : 404, headers: { "cache-control": "private, no-store" } });
    }
    if (params.has("dataset")) {
      const value = await simulationDatasets.dataset(params.get("dataset")!, task ?? undefined);
      return Response.json(value ?? { error: "not_found" }, { status: value ? 200 : 404, headers: { "cache-control": "private, no-store" } });
    }
    return Response.json(await simulationDatasets.catalog(params.get("refresh") === "1"), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "simulation_dataset_unavailable", message: "Simulation 数据目录暂时不可读，请稍后刷新。" },
      { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "30" } });
  }
}
