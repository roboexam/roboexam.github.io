import type { NextConfig } from "next";

// GITHUB_PAGES=true builds the static site: every page prerendered to dist/client, no server.
const githubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(githubPages ? {
    output: "export",
    images: { unoptimized: true },
  } : {}),
  env: { ROBOEXAM_STATIC_SITE: githubPages ? "1" : "" },
};

export default nextConfig;
