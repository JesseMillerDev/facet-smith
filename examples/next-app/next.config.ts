import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@facetsmith/core",
    "@facetsmith/analytics",
    "@facetsmith/react",
    "@facetsmith/next",
    "@facetsmith/inspector",
  ],
};

export default nextConfig;
