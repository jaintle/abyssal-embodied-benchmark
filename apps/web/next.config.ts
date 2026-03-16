import type { NextConfig } from "next";

// Support GitHub Pages (or any sub-path deployment) via:
//   NEXT_PUBLIC_BASE_PATH=/abyssal-embodied-benchmark npm run build
// Omit the env var for local dev or root deployments.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // ── Static export ─────────────────────────────────────────────────────────
  // Produces apps/web/out/ — deploy to GitHub Pages, Netlify, or any CDN.
  output: "export",

  // Ensure each route is emitted as a directory index for static hosts.
  trailingSlash: true,

  // Sub-path for GitHub Pages: https://<user>.github.io/<repo>
  basePath,

  // next/image optimisation requires a server; disable for static export.
  images: { unoptimized: true },

  // ── Workspace packages ────────────────────────────────────────────────────
  // Transpile workspace packages that ship raw TypeScript source.
  transpilePackages: ["@abyssal/worldgen", "@abyssal/replay-schema"],
};

export default nextConfig;
