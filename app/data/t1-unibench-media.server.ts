import path from "node:path";
import { serveT1Media, type T1MediaRecord } from "./t1-media-server.ts";
import { t1UnibenchRegistry } from "../../scripts/t1-unibench-registry.mjs";

/** Publication media directory (exact copies with SHA-256 receipts); override with T1_UNIBENCH_MEDIA_ROOT. */
export function t1UnibenchMediaRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.T1_UNIBENCH_MEDIA_ROOT ?? path.join(t1UnibenchRegistry.publicationRoot, "media"));
}

/** The catalogue owns identities; request IDs never become caller-chosen paths. */
export async function serveT1UnibenchMedia(
  request: Request,
  id: string,
  catalog: readonly T1MediaRecord[],
  root: string = t1UnibenchMediaRoot(),
  headOnly = false,
): Promise<Response> {
  return serveT1Media(request, id, catalog, root, headOnly);
}
