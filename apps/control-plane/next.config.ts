import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@red/orchestrator", "@red/mcp-tools", "@red/shared", "@red/ai"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
