import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Since we are exporting a static site, we don't need server packages
  // or turbopack server-side config.
};

export default nextConfig;
