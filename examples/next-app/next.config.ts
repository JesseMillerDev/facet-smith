import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@facet-smith/core",
    "@facet-smith/analytics",
    "@facet-smith/react",
    "@facet-smith/next",
    "@facet-smith/inspector",
  ],
};

export default nextConfig;
