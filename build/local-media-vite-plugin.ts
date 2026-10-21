import { GET as getRawReviewTrace } from "../app/api/raw-review-trace/route";
import { GET as getRawReview } from "../app/api/raw-review/route";
import { GET as getRawReviewMedia, HEAD as headRawReviewMedia } from "../app/api/raw-review-media/route";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Plugin } from "vite";
import {
  GET as getCuratedMedia,
  HEAD as headCuratedMedia,
} from "../app/api/curated-media/route";
import {
  GET as getCuratedMediaByPath,
  HEAD as headCuratedMediaByPath,
} from "../app/api/curated-media/[...segments]/route";
import {
  GET as getEpisodeMedia,
  HEAD as headEpisodeMedia,
} from "../app/api/episode-media/[...segments]/route";
import {
  GET as getL1MinimalMedia,
  HEAD as headL1MinimalMedia,
} from "../app/api/l1-minimal-media/[...segments]/route";
import {
  GET as getL1Phase1Media,
  HEAD as headL1Phase1Media,
} from "../app/api/l1-phase1-media/[...segments]/route";
import {
  GET as getOodMedia,
  HEAD as headOodMedia,
} from "../app/api/ood-media/route";
import {
  GET as getReviewMedia,
  HEAD as headReviewMedia,
} from "../app/api/review-media/route";
import {
  GET as getVideoRendition,
  HEAD as headVideoRendition,
} from "../app/api/video-renditions/route";
import {
  GET as getT1BenchmarkMedia,
  HEAD as headT1BenchmarkMedia,
} from "../app/api/t1-benchmark-media/[id]/route";
import {
  GET as getT1LegacyMedia,
  HEAD as headT1LegacyMedia,
} from "../app/api/t1-media/[id]/route";

type RouteContext = { params: Promise<{ segments: string[] }> };
type RouteHandler = (request: Request, context: RouteContext) => Response | Promise<Response>;
type RouteMatch = { get: RouteHandler; head: RouteHandler; context: RouteContext };
const stableIdContext = (value: RouteContext) => ({
  params: value.params.then(({ segments }) => ({ id: segments.length === 1 ? segments[0] : ".." })),
});
const getBenchmarkMedia: RouteHandler = (request, value) => getT1BenchmarkMedia(request, stableIdContext(value));
const headBenchmarkMedia: RouteHandler = (request, value) => headT1BenchmarkMedia(request, stableIdContext(value));
const getLegacyMedia: RouteHandler = (request, value) => getT1LegacyMedia(request, stableIdContext(value));
const headLegacyMedia: RouteHandler = (request, value) => headT1LegacyMedia(request, stableIdContext(value));

const context = (segments: string[] = []): RouteContext => ({
  params: Promise.resolve({ segments }),
});

function pathMatch(
  pathname: string,
  prefix: string,
  get: RouteHandler,
  head: RouteHandler,
): RouteMatch | null {
  if (!pathname.startsWith(`${prefix}/`)) return null;
  try {
    return {
      get,
      head,
      context: context(
        pathname
          .slice(prefix.length + 1)
          .split("/")
          .map(decodeURIComponent),
      ),
    };
  } catch {
    return { get, head, context: context([".."]) };
  }
}

function matchRoute(pathname: string): RouteMatch | null {
  if (pathname === "/api/raw-review-trace") return { get: getRawReviewTrace, head: getRawReviewTrace, context: context() };
  if (pathname === "/api/raw-review") return { get: getRawReview, head: getRawReview, context: context() };
  if (pathname === "/api/raw-review-media") return { get: getRawReviewMedia, head: headRawReviewMedia, context: context() };
  if (pathname === "/api/curated-media") {
    return { get: getCuratedMedia, head: headCuratedMedia, context: context() };
  }
  if (pathname === "/api/ood-media") {
    return { get: getOodMedia, head: headOodMedia, context: context() };
  }
  if (pathname === "/api/review-media") {
    return { get: getReviewMedia, head: headReviewMedia, context: context() };
  }
  if (pathname === "/api/video-renditions") {
    return {
      get: getVideoRendition,
      head: headVideoRendition,
      context: context(),
    };
  }
  return (
    pathMatch(pathname, "/api/t1-benchmark-media", getBenchmarkMedia, headBenchmarkMedia) ??
    pathMatch(pathname, "/api/t1-media", getLegacyMedia, headLegacyMedia) ??
    pathMatch(
      pathname,
      "/api/curated-media",
      getCuratedMediaByPath,
      headCuratedMediaByPath,
    ) ??
    pathMatch(pathname, "/api/episode-media", getEpisodeMedia, headEpisodeMedia) ??
    pathMatch(
      pathname,
      "/api/l1-minimal-media",
      getL1MinimalMedia,
      headL1MinimalMedia,
    ) ??
    pathMatch(
      pathname,
      "/api/l1-phase1-media",
      getL1Phase1Media,
      headL1Phase1Media,
    )
  );
}

function requestHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

async function serve(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  match: RouteMatch,
) {
  const method = incoming.method === "HEAD" ? "HEAD" : "GET";
  const request = new Request(
    new URL(incoming.url ?? "/", "http://localhost"),
    { method, headers: requestHeaders(incoming.headers) },
  );
  const response = await (method === "HEAD" ? match.head : match.get)(
    request,
    match.context,
  );

  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  if (!response.body || method === "HEAD") {
    outgoing.end();
    return;
  }

  const body = Readable.fromWeb(response.body);
  body.once("error", (error) => outgoing.destroy(error));
  outgoing.once("close", () => body.destroy());
  body.pipe(outgoing);
}

/**
 * Vinext's local Worker cannot read host-mounted benchmark media. In dev only,
 * serve the same allowlisted route handlers from Vite's host Node process.
 */
export function localMedia(): Plugin {
  return {
    name: "local-media",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((incoming, outgoing, next) => {
        if (incoming.method !== "GET" && incoming.method !== "HEAD") {
          next();
          return;
        }
        const pathname = new URL(
          incoming.url ?? "/",
          "http://localhost",
        ).pathname;
        const match = matchRoute(pathname);
        if (!match) {
          next();
          return;
        }
        void serve(incoming, outgoing, match).catch(next);
      });
    },
  };
}
