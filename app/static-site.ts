import snapshot from "./data/generated/static-media.json" with { type: "json" };

/**
 * The GitHub Pages build has no server. Data endpoints are answered by JSON snapshots and video by a
 * curated sample, both exported with scripts/export-static-site.mjs into public/static-api and
 * public/static-media. The server build keeps every URL as it is.
 */
export const STATIC_SITE = process.env.ROBOEXAM_STATIC_SITE === "1";

const media: Record<string, string> = snapshot.media;

/** A request in one canonical spelling: path plus sorted query, so the browser and the exporter agree. */
export function canonicalRequest(url: string) {
  const parsed = new URL(url, "http://static.invalid");
  parsed.searchParams.sort();
  return parsed.pathname + parsed.search;
}

/** cyrb53: a stable 53-bit name for a request snapshot. */
export function staticKey(url: string) {
  const text = canonicalRequest(url);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Where a data endpoint is read: the endpoint itself, or its snapshot in the static build. */
export function dataUrl(url: string) {
  if (!STATIC_SITE) return url;
  const endpoint = canonicalRequest(url).split(/[/?]/)[2];
  return `/static-api/${endpoint}/${staticKey(url)}.json`;
}

/** A clip's address: itself, or in the static build its bundled copy, or null when the sample leaves it out. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!STATIC_SITE) return url;
  return media[canonicalRequest(url)] ?? null;
}

/** The same for a media record: the record with its bundled address, or null. */
export function withMedia<T extends { url: string }>(item: T | null | undefined): T | null {
  const url = mediaUrl(item?.url);
  return item && url ? { ...item, url } : null;
}
