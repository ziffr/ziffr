import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "../../packages/core/src/test/serial-files";

// The API's route handlers called with real requests, against the local Supabase like the core's database tests
// (spec 0002, testing decisions). They check the HTTP layer: status, error shape, paging and headers.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { globals: true, include: ["src/**/*.db.test.ts"], globalSetup: ["../../packages/core/src/test/db-ready.ts"], setupFiles: ["../../packages/core/src/test/db-env.ts"], fileParallelism: false, testTimeout: 60_000 },
});
