import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hone/domain", "@hone/config-env", "@hone/observability"],
};

export default nextConfig;

