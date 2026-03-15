import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages that ship raw TypeScript source
  transpilePackages: ["@abyssal/worldgen", "@abyssal/replay-schema"],
};

export default nextConfig;
