import { defineConfig } from "vitest/config";
import "../core/src/test/serial-files";

// The MCP server against a running app (spec 0002, testing decisions): ZIFFR_TEST_URL (default http://localhost:3000) with
// the local Supabase it uses. Test data is made through the core, like the database tests.
export default defineConfig({ test: { globals: true, include: ["test/**/*.app.test.ts"], setupFiles: ["../core/src/test/db-env.ts"], fileParallelism: false, testTimeout: 60_000 } });
