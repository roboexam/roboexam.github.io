import { t1UnibenchMediaCatalog } from "../../../data/t1-unibench-results";
import { serveT1UnibenchMedia } from "../../../data/t1-unibench-media.server";

type Context = { params: Promise<{ id: string }> };
const catalog = t1UnibenchMediaCatalog();

async function serve(request: Request, context: Context, headOnly: boolean) {
  const { id } = await context.params;
  return serveT1UnibenchMedia(request, id, catalog, undefined, headOnly);
}

export async function GET(request: Request, context: Context) {
  return serve(request, context, false);
}

export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}
