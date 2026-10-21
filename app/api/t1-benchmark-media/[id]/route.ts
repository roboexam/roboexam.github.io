import { t1BenchmarkResults } from "../../../data/t1-benchmark-results";
import { serveT1BenchmarkMedia } from "../../../data/t1-benchmark-media.server";

type Context = { params: Promise<{ id: string }> };

async function serve(request: Request, context: Context, headOnly: boolean) {
  const { id } = await context.params;
  const catalog = t1BenchmarkResults.episodes.flatMap((episode) => episode.video ? [episode.video] : []);
  return serveT1BenchmarkMedia(request, id, catalog, undefined, headOnly);
}

export async function GET(request: Request, context: Context) {
  return serve(request, context, false);
}

export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}
