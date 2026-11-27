// The browser check of the deck slides (spec 0069): every slide type drawn in a headless Chromium and measured. It
// needs the browser (`playwright install chromium-headless-shell`) and, once, the fonts from their host, so it has its own
// config and `pnpm --filter @ziffr/web test:slides`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.browser.test.ts"], testTimeout: 300_000, hookTimeout: 120_000 },
});
