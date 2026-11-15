import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The web app's tests that need no database (the API description, its reference page, Previews). Database tests have their
// own config, vitest.db.config.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Component tests (*.test.tsx) render to a string on the server: no browser needed.
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], exclude: ["src/**/*.db.test.ts", "node_modules/**"] },
});
