import { realDatasets } from "../../data/real-datasets.server.ts";
export const GET = (request: Request) => realDatasets.serveMedia(request);
export const HEAD = (request: Request) => realDatasets.serveMedia(request, true);
