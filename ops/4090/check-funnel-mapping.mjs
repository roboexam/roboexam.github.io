import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Match the root handler in either observed Tailscale text layout. */
export function hasFunnelRootMapping(output, expectedUrl, expectedTarget) {
  if (typeof output !== "string" || typeof expectedUrl !== "string" || typeof expectedTarget !== "string") return false;
  try {
    const url = new URL(expectedUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
  } catch { return false; }
  const rootUrl = expectedUrl.replace(/\/$/, "");
  let rootBlock = false;
  for (const line of output.split(/\r?\n/)) {
    const text = line.trim();
    if (/^https?:\/\//.test(text)) {
      const header = text.match(/^(https?:\/\/\S+?)(?:\s+\([^)]*\))?$/);
      rootBlock = !!header && (header[1] === rootUrl || header[1] === `${rootUrl}/`);
      continue;
    }
    // Older status output puts '/' on the handler; newer output puts it on
    // the URL header. Never accept a target from a different URL/path block.
    const handler = text.match(/^\|--\s+(?:\/\s+)?proxy\s+(\S+)$/);
    if (rootBlock && handler?.[1] === expectedTarget) return true;
    if (!text) rootBlock = false;
  }
  return false;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = hasFunnelRootMapping(readFileSync(0, "utf8"), process.argv[2], process.argv[3]) ? 0 : 1;
}
