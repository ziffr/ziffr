import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The web app's tests that need no database (the API description and its reference page). Database tests have their
// own config, vitest.db.config.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts", "node_modules/**"] },
});
