import { simulationDatasets } from "../../data/simulation-datasets.server.ts";

export const GET = (request: Request) => simulationDatasets.serveMedia(request);
export const HEAD = (request: Request) => simulationDatasets.serveMedia(request, true);
