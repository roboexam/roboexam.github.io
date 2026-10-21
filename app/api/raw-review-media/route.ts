import { rawReview } from "../../data/raw-review.server";
export const GET = (request: Request) => rawReview.serveMedia(request);
export const HEAD = (request: Request) => rawReview.serveMedia(request, true);
