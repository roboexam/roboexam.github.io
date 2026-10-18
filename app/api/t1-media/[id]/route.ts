import path from "node:path";
import { t1AgentResults } from "../../../data/t1-agent-results";
import { serveT1Media } from "../../../data/t1-media-server";

type Context = { params: Promise<{ id: string }> };
const publicationRoot = "/mnt/gyc_ckp/benchmark2027/experiments/evaluation/track1/t1-stack-bowls-20261018-v1";

async function serve(request: Request, context: Context, headOnly: boolean) {
  const { id } = await context.params;
  const root = process.env.DASHBOARD_T1_MEDIA_ROOT ?? path.join(publicationRoot, "media");
  return serveT1Media(request, id, t1AgentResults.episodes.map((episode) => episode.video), root, headOnly);
}

export async function GET(request: Request, context: Context) {
  return serve(request, context, false);
}

export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}
