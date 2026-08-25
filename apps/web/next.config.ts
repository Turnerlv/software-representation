import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chomp/core", "@chomp/db"],
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    if (isServer) {
      config.externals.push("better-sqlite3");
    }
    return config;
  },
};

export default nextConfig;
