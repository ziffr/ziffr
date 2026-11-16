import path from "node:path";
import type { NextConfig } from "next";

// Local settings stay at the repository root, shared by every app; package.json's scripts hand them to Node.

const nextConfig: NextConfig = {
  // `pnpm ci:local` builds into its own folder, so a running `pnpm dev` keeps its own.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Docker image (spec 0015, docker/Dockerfile) runs a server traced with only the files it needs. Elsewhere
  // `next start` runs from the checkout, which standalone output does not support.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const, outputFileTracingRoot: path.join(__dirname, "../..") } : {}),
  // The core ships as TypeScript source inside the monorepo.
  transpilePackages: ["@ziffr/core"],
  // No image optimizer: Ziffr does not use next/image, and /_next/image would run sharp on request (docs/security).
  images: { unoptimized: true },
  // The user guide's chapters and the glossary are read from the checkout when a page is asked for; a traced build takes them along.
  outputFileTracingIncludes: { "/guide/**": ["../../docs/user-guide/*.md", "../../GLOSSARY.md"] },
  // No framing (clickjacking), no type sniffing, and no full URLs to other sites (View Link tokens are in paths).
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
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
      // The service-role database access must never reach a browser, however it is imported (docs/security).
      config.plugins.push({
        apply(compiler: { hooks: { compilation: { tap: (n: string, f: (c: { hooks: { finishModules: { tap: (n: string, f: (mods: Iterable<{ resource?: string }>) => void) => void } }; errors: Error[] }) => void) => void } } }) {
          compiler.hooks.compilation.tap("NoCoreDbInBrowser", (compilation) => {
            compilation.hooks.finishModules.tap("NoCoreDbInBrowser", (mods) => {
              for (const m of mods) if (m.resource && /packages[\\/]core[\\/]src[\\/]db\.ts$/.test(m.resource)) compilation.errors.push(new Error(`The core's database access was bundled for the browser via ${m.resource}.`));
            });
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
