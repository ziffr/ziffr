import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Master logos and backgrounds travel as data URLs in server actions (prototype; Storage later).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // pptxgenjs imports "node:fs" etc. for its Node build; its package.json `browser` field
      // maps them to false, but webpack rejects the node: scheme before reading that field.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false, os: false, path: false };
    }
    return config;
  },
};

export default nextConfig;
