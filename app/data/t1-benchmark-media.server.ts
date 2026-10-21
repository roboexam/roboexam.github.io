import path from "node:path";
import { serveT1Media, type T1MediaRecord } from "./t1-media-server.ts";

export type T1BenchmarkMediaRecord = T1MediaRecord;

export function t1BenchmarkMediaRoot(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  return path.resolve(env.T1_BENCHMARK_MEDIA_ROOT ?? path.join(cwd, ".local/t1-benchmark/media"));
}

/** The catalogue owns identities; request IDs never become caller-chosen paths. */
export async function serveT1BenchmarkMedia(
  request: Request,
  id: string,
  catalog: readonly T1BenchmarkMediaRecord[],
  root: string = t1BenchmarkMediaRoot(),
  headOnly = false,
): Promise<Response> {
  return serveT1Media(request, id, catalog, root, headOnly);
}
