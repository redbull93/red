import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@red/orchestrator", "@red/mcp-tools"],
};

export default nextConfig;
